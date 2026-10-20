import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CARD_HTML, CARD_MIME, CARD_URI } from "./card-html";
import * as K from "./house";
import { resolveNote } from "./resolver";
import { loadHouse, NoHouse, validHouseId, withHouse } from "./store";

/**
 * Keeper as an MCP server: the house manual an Alexa+ style assistant reads to whoever is minding
 * the home. One endpoint serves two kinds of connection:
 *   device  /api/mcp?house=<id>            the Echo in the house; speaks for the guest whose pass is active
 *   owner   /api/mcp?house=<id>&key=<key>  the owner (in a real Alexa+ deployment, their linked account)
 * Every tool returns structuredContent with a `speech` line written for voice, and links the MCP
 * Apps card (ui://keeper/house-card.html) so an Echo Show can show and act on the result.
 */
export const SERVER_INFO = { name: "keeper", title: "Keeper", version: "1.0.0" };

export const INSTRUCTIONS = [
  "Keeper is a house manual that the home's owner shares with sitters, guests, and helpers, scoped by a pass.",
  "Read the `speech` field of each result aloud as your reply; it is written for voice. Never add facts about the house that Keeper did not return.",
  "When someone in the home says their pass code, call visit_start. For any question about the house, call house_ask with their words.",
  "For step-by-step help (bedtime, feeding the dog), use routine_walk with start, then next, back, repeat, or stop.",
  "If anyone mentions an emergency, injury, or danger, call emergency_info immediately.",
  "Tools marked owner only work on the owner's connection.",
].join(" ");

const ui = { ui: { resourceUri: CARD_URI } };
const out = z.looseObject({ kind: z.string(), speech: z.string().describe("Say this aloud."), house: z.string() });
const section = z.enum(K.SECTIONS);

type Ctx = { http?: { req?: Request } };
function connectionOf(ctx: Ctx) {
  const req = ctx.http?.req;
  const url = req ? new URL(req.url) : null;
  const house = req?.headers.get("x-keeper-house") ?? url?.searchParams.get("house") ?? null;
  const key = req?.headers.get("x-keeper-key") ?? url?.searchParams.get("key") ?? null;
  return { house, key };
}

/** Runs a tool against the connection's house, as the right audience, and shapes the MCP result. */
async function run(ctx: Ctx, fn: (h: K.House, a: K.Audience) => { kind: string; speech: string }, opts: { owner?: boolean } = {}) {
  const { house, key } = connectionOf(ctx);
  if (!validHouseId(house)) return fail("This Keeper link has no house. Open the Keeper page to get your house's link.");
  try {
    return await withHouse(house, (h) => {
      const a = K.audienceOf(h, key);
      if (opts.owner && a.kind !== "owner") return done(house, { kind: "denied", speech: `Only ${h.owner} can do that, from the owner's connection.` }, true);
      const r = fn(h, a);
      const extra = a.kind === "guest" && r.kind !== "visit" ? K.deliverAnswers(h, a) : null;
      const audience = a.kind === "owner" ? { kind: "owner", name: a.name } : a.kind === "guest" ? { kind: "guest", name: a.pass.name, role: a.pass.role, until: a.pass.until } : { kind: "locked" };
      return done(house, { ...r, speech: extra ? `${r.speech} ${extra}` : r.speech, audience }, r.kind === "denied");
    });
  } catch (err) {
    if (err instanceof NoHouse) return fail("I can't find that house. It may have been reset; open the Keeper page for a fresh link.");
    throw err;
  }
}
/** Reads the house once, outside the lock, and asks the resolver only when lexical search misses. */
async function preResolve(ctx: Ctx, question: string): Promise<string | null> {
  const { house, key } = connectionOf(ctx);
  if (!validHouseId(house)) return null;
  const h = await loadHouse(house).catch(() => null);
  if (!h) return null;
  const a = K.audienceOf(h, key);
  if (a.kind === "locked" || K.lexicalAnswer(h, a, question)) return null;
  return resolveNote(question, K.visibleNotes(h, a));
}
function done(house: string, r: Record<string, unknown> & { speech: string }, isError = false) {
  return { content: [{ type: "text" as const, text: r.speech }], structuredContent: { ...r, house }, ...(isError ? { isError: true } : {}) };
}
const fail = (speech: string) => ({ content: [{ type: "text" as const, text: speech }], isError: true });

export function registerKeeper(server: McpServer) {
  server.registerResource(
    "house-card",
    CARD_URI,
    { title: "Keeper card", description: "Echo Show style card for any Keeper result (MCP Apps view).", mimeType: CARD_MIME },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: CARD_MIME, text: CARD_HTML, _meta: { ui: { prefersBorder: false } } }] }),
  );

  const ro = (title: string) => ({ title, readOnlyHint: true, openWorldHint: false });
  const rw = (title: string, destructive = false) => ({ title, readOnlyHint: false, destructiveHint: destructive, idempotentHint: false, openWorldHint: false });

  // ---------- anyone in the home ----------

  server.registerTool(
    "visit_start",
    {
      title: "Start a visit with a pass code",
      description: "When a sitter, guest, or helper says their pass code ('I'm Priya, my code is 4 7 2 9'), unlock the notes their pass covers on this device. Pass the digits only.",
      inputSchema: z.object({ code: z.string().trim().min(4).max(12).describe("The spoken pass code, digits only, e.g. '4729'") }),
      outputSchema: out,
      annotations: rw("Start a visit"),
      _meta: ui,
    },
    async ({ code }, ctx) => run(ctx, (h) => K.startVisit(h, code)),
  );

  server.registerTool(
    "visit_end",
    {
      title: "End the visit",
      description: "When the guest says they're leaving or done ('I'm heading out', 'lock it'), lock the device again.",
      inputSchema: z.object({}),
      outputSchema: out,
      annotations: rw("End the visit"),
      _meta: ui,
    },
    async (_a, ctx) => run(ctx, (h) => K.endVisit(h)),
  );

  server.registerTool(
    "house_ask",
    {
      title: "Ask the house manual",
      description:
        "Answer a question about the home from the owner's notes, limited to what the speaker's pass covers: 'what's the wifi password?', 'when does Biscuit eat?', 'can Mila have a snack?', 'which bin is recycling?'. Pass the question in the speaker's own words. If the notes don't cover it, Keeper sends the question to the owner and says so. Never answer house questions from your own knowledge.",
      inputSchema: z.object({ question: z.string().trim().min(2).max(300) }),
      outputSchema: out,
      annotations: rw("Ask the house manual"),
      _meta: ui,
    },
    async ({ question }, ctx) => {
      const resolved = await preResolve(ctx, question);
      return run(ctx, (h, a) => K.ask(h, a, question, resolved));
    },
  );

  server.registerTool(
    "routine_walk",
    {
      title: "Walk through a routine",
      description: "Step-by-step help that remembers where you are across turns: bedtime, feeding the dog. move=start (optionally with routine, e.g. 'bedtime'; without it, the routine just asked about), then next, back, repeat, or stop.",
      inputSchema: z.object({ move: z.enum(["start", "next", "back", "repeat", "stop"]), routine: z.string().trim().min(2).max(60).optional().describe("Which routine, as said: 'bedtime', 'Biscuit's dinner'") }),
      outputSchema: out,
      annotations: rw("Walk through a routine"),
      _meta: ui,
    },
    async ({ move, routine }, ctx) => run(ctx, (h, a) => K.walk(h, a, move, routine)),
  );

  server.registerTool(
    "emergency_info",
    {
      title: "Emergency information",
      description: "Call 911 guidance, the home's address, and the owner's emergency contacts. Always available, even before a pass code. Use for any mention of an emergency, injury, poison, fire, or danger.",
      inputSchema: z.object({}),
      outputSchema: out,
      annotations: ro("Emergency information"),
      _meta: ui,
    },
    async (_a, ctx) => run(ctx, (h, a) => K.emergency(h, a)),
  );

  server.registerTool(
    "house_manual",
    {
      title: "What I can help with",
      description: "List the sections of the manual the speaker can ask about ('what can you help with?', 'what's in the manual?'). For the owner, every note with whether it's shared or private.",
      inputSchema: z.object({}),
      outputSchema: out,
      annotations: ro("What I can help with"),
      _meta: ui,
    },
    async (_a, ctx) => run(ctx, (h, a) => K.manual(h, a)),
  );

  // ---------- owner only ----------

  server.registerTool(
    "note_add",
    {
      title: "Add a note (owner only)",
      description: "Owner only. Save something guests might need: 'remember that the plants get watered on Thursday'. New notes are private unless share is 'guests'; say so and offer to share. section is guessed from the text if omitted.",
      inputSchema: z.object({ text: z.string().trim().min(3).max(600), title: z.string().trim().max(60).optional(), section: section.optional(), share: z.enum(["guests", "private"]).optional(), steps: z.array(z.string().trim().min(2).max(200)).max(12).optional() }),
      outputSchema: out,
      annotations: rw("Add a note"),
      _meta: ui,
    },
    async (input, ctx) => run(ctx, (h, a) => K.addNote(h, a, input), { owner: true }),
  );

  server.registerTool(
    "note_update",
    {
      title: "Share, hide, or edit a note (owner only)",
      description: "Owner only. Change who can hear a note ('share it', 'make the alarm code private') or its text. note is its name as said; omit it to mean the note just discussed.",
      inputSchema: z.object({ note: z.string().trim().max(80).optional(), share: z.enum(["guests", "private"]).optional(), text: z.string().trim().min(3).max(600).optional(), section: section.optional() }),
      outputSchema: out,
      annotations: rw("Update a note"),
      _meta: ui,
    },
    async (input, ctx) => run(ctx, (h, a) => K.updateNote(h, a, input), { owner: true }),
  );

  server.registerTool(
    "note_remove",
    {
      title: "Remove a note (owner only)",
      description: "Owner only. Delete a note by name.",
      inputSchema: z.object({ note: z.string().trim().min(2).max(80) }),
      outputSchema: out,
      annotations: rw("Remove a note", true),
      _meta: ui,
    },
    async ({ note }, ctx) => run(ctx, (h, a) => K.removeNote(h, a, note), { owner: true }),
  );

  server.registerTool(
    "pass_create",
    {
      title: "Give someone a pass (owner only)",
      description: "Owner only. 'Give Lee a dog walker pass for the pets until Friday'. Creates a 4-digit code for that person, limited to the listed sections (emergency is always included) and a time window. Giving the same person a new pass ends their old code.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(40),
        role: z.enum(["sitter", "guest", "dog walker", "family", "helper"]).optional(),
        sections: z.array(section).max(10).optional().describe("Omit for everything except security and other"),
        days: z.number().min(0).max(30).optional(),
        hours: z.number().min(0).max(720).optional(),
      }),
      outputSchema: out,
      annotations: rw("Give someone a pass"),
      _meta: ui,
    },
    async (input, ctx) => run(ctx, (h, a) => K.createPass(h, a, input), { owner: true }),
  );

  server.registerTool(
    "pass_revoke",
    {
      title: "End someone's pass (owner only)",
      description: "Owner only. 'Turn off Lee's code.' Their code stops working right away, and if they're mid-visit the device locks.",
      inputSchema: z.object({ name: z.string().trim().min(1).max(40) }),
      outputSchema: out,
      annotations: rw("End a pass", true),
      _meta: ui,
    },
    async ({ name }, ctx) => run(ctx, (h, a) => K.revokePass(h, a, name), { owner: true }),
  );

  server.registerTool(
    "pass_list",
    {
      title: "Who has a pass (owner only)",
      description: "Owner only. Active passes, what each covers, and who is visiting now.",
      inputSchema: z.object({}),
      outputSchema: out,
      annotations: ro("Who has a pass"),
      _meta: ui,
    },
    async (_a, ctx) => run(ctx, (h, a) => K.passes(h, a), { owner: true }),
  );

  server.registerTool(
    "questions_open",
    {
      title: "Questions guests asked (owner only)",
      description: "Owner only. Questions the manual couldn't answer for a guest, newest first ('did Priya ask anything?').",
      inputSchema: z.object({}),
      outputSchema: out,
      annotations: ro("Open questions"),
      _meta: ui,
    },
    async (_a, ctx) => run(ctx, (h, a) => K.openQuestions(h, a), { owner: true }),
  );

  server.registerTool(
    "question_answer",
    {
      title: "Answer a guest's question (owner only)",
      description: "Owner only. 'Tell Priya yes, Ava can come over until five.' Answers the newest open question (or question_id). The guest hears it on their next turn. By default the answer is also saved to the manual, shared, so the next guest gets it too; pass save_as_note false or share 'private' to keep it one-off.",
      inputSchema: z.object({ answer: z.string().trim().min(1).max(600), question_id: z.string().max(20).optional(), save_as_note: z.boolean().optional(), share: z.enum(["guests", "private"]).optional() }),
      outputSchema: out,
      annotations: rw("Answer a question"),
      _meta: ui,
    },
    async (input, ctx) => run(ctx, (h, a) => K.answerQuestion(h, a, input), { owner: true }),
  );

  server.registerTool(
    "house_recap",
    {
      title: "What happened while I was out (owner only)",
      description: "Owner only. The visit log across guests and days: who arrived, what they asked and heard, routines finished, questions waiting.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
      outputSchema: out,
      annotations: ro("Recap"),
      _meta: ui,
    },
    async ({ limit }, ctx) => run(ctx, (h, a) => K.recap(h, a, limit), { owner: true }),
  );

  server.registerPrompt(
    "sitter_handoff",
    {
      title: "Hand the house to a sitter",
      description: "Owner walkthrough: check what is shared, give the sitter a pass, and confirm what they'll be able to ask.",
      argsSchema: z.object({ name: z.string().describe("The sitter's first name") }),
    },
    async ({ name }) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: `I'm leaving ${name} in charge of the house. Use Keeper: show me what's in my manual and what's private, give ${name} a sitter pass for two days, and tell me the code and what ${name} will be able to ask about.` } }],
    }),
  );
}
