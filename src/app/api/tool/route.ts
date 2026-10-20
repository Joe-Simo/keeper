import { z } from "zod";
import { connectKeeper } from "@/lib/mcp-client";
import { originOf } from "@/lib/origin";
import { validHouseId } from "@/lib/store";

const Body = z.object({ house: z.string().max(40), speaker: z.enum(["owner", "guest"]), ownerKey: z.string().max(64).optional(), name: z.string().max(40), arguments: z.record(z.string(), z.unknown()).default({}) });

/** The simulator's MCP Apps host relays tools/call requests from the card (a tap) to Keeper's MCP endpoint. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !validHouseId(parsed.data.house)) return Response.json({ error: "bad request" }, { status: 400 });
  const { name, speaker, house } = parsed.data;
  const keeper = await connectKeeper(originOf(req), house, speaker === "owner" ? parsed.data.ownerKey : null);
  try {
    const out = await keeper.call(name, parsed.data.arguments);
    return Response.json({ ok: out.ok, speech: out.speech, structuredContent: out.structured, isError: !out.ok, ms: out.ms });
  } finally {
    await keeper.close().catch(() => {});
  }
}
