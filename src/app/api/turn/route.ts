import { z } from "zod";
import { gate } from "@/lib/allowance";
import { llmEnabled, llmResting } from "@/lib/llm";
import { connectKeeper, type CallOutcome } from "@/lib/mcp-client";
import { originOf } from "@/lib/origin";
import { planOffline, planWithModel, type Plan } from "@/lib/planner";
import { validHouseId } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({
  utterance: z.string().trim().min(1).max(300),
  house: z.string().max(40),
  speaker: z.enum(["owner", "guest"]),
  ownerKey: z.string().max(64).optional(),
  history: z.array(z.object({ user: z.string().max(300), speech: z.string().max(1200), tools: z.array(z.string()).max(4) })).max(6).default([]),
  wantCard: z.boolean().optional(),
});

/**
 * One simulated Alexa+ turn: plan the utterance (open model, or the offline matcher), then run the
 * planned calls against Keeper's MCP endpoint over Streamable HTTP, as the device or as the owner.
 */
export async function POST(req: Request) {
  const started = Date.now();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !validHouseId(parsed.data.house)) return Response.json({ error: "Say something for Keeper to do." }, { status: 400 });
  const { utterance, speaker, history, wantCard, house } = parsed.data;
  const keeper = await connectKeeper(originOf(req), house, speaker === "owner" ? parsed.data.ownerKey : null);
  try {
    const tools = await keeper.tools();
    let plan: Plan | null = null;
    let cookie: string | undefined;
    let note: string | undefined;
    const g = gate(req);
    if (!llmEnabled()) note = "No model key is set, so the offline intent matcher is planning.";
    else if (llmResting()) note = "Today's free model quota is used up, so the offline intent matcher is planning.";
    else if (!g.ok) note = g.reason === "visitor" ? "You've used today's model-planned turns, so the offline intent matcher is planning. It handles the common phrases." : "Today's shared model allowance is spent, so the offline intent matcher is planning.";
    else {
      try {
        plan = await planWithModel(utterance, history, tools, speaker);
        if (plan.source === "model") cookie = g.commit();
        if (!plan.calls.length && !plan.say) plan = null;
      } catch (err) {
        note = "The open model didn't answer in time, so the offline intent matcher planned this turn.";
        console.error("[keeper] planner fell back:", err instanceof Error ? err.message : err);
      }
    }
    plan ??= planOffline(utterance, history, speaker);

    const calls: CallOutcome[] = [];
    for (const c of plan.calls) {
      const out = await keeper.call(c.name, c.arguments);
      calls.push(out);
      if (!out.ok) break;
    }
    const speech = calls.length ? calls.map((c) => c.speech).filter(Boolean).slice(-2).join(" ") : plan.say ?? "Sorry, I didn't catch that.";
    const withCard = [...calls].reverse().find((c) => c.structured);
    const cardUri = withCard ? tools.find((t) => t.name === withCard.name)?.uiResource ?? null : null;
    const cardHtml = wantCard && cardUri ? await keeper.readResource(cardUri) : undefined;
    const body = {
      speech,
      plan: { source: plan.source, model: plan.model ?? null, note: note ?? plan.note ?? null },
      calls: calls.map(({ name, arguments: a, ok, ms }) => ({ name, arguments: a, ok, ms })),
      card: withCard ? { uri: cardUri, tool: withCard.name, result: withCard.structured } : null,
      ...(cardHtml ? { cardHtml } : {}),
      mcp: { protocolVersion: keeper.protocolVersion, server: keeper.server ?? null, transport: "streamable-http", connection: speaker === "owner" ? "owner" : "device" },
      ms: Date.now() - started,
    };
    return Response.json(body, cookie ? { headers: { "set-cookie": cookie } } : undefined);
  } finally {
    await keeper.close().catch(() => {});
  }
}
