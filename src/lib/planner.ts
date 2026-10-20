import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { chatJson } from "./llm";
import type { ToolInfo } from "./mcp-client";
import { SECTIONS, type Section } from "./house";

/**
 * Turns one spoken sentence into Keeper MCP tool calls. In production Alexa+ is this layer; here an
 * open model plays its part, reading the live tools/list. When the model is unavailable or today's
 * allowance is spent, a small offline intent matcher covers the common phrases.
 */
export interface PlannedCall { name: string; arguments: Record<string, unknown> }
export interface Plan { calls: PlannedCall[]; say?: string; source: "model" | "offline" | "cache"; model?: string; note?: string }
export interface Turn { user: string; speech: string; tools: string[] }
export type Speaker = "owner" | "guest";

const PlanSchema = z.object({
  calls: z.array(z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) })).max(3).default([]),
  say: z.string().max(300).optional(),
});

const OWNER_TOOLS = new Set(["note_add", "note_update", "note_remove", "pass_create", "pass_revoke", "pass_list", "questions_open", "question_answer", "house_recap"]);
const toolsFor = (tools: ToolInfo[], speaker: Speaker) => tools.filter((t) => speaker === "owner" || !OWNER_TOOLS.has(t.name));

function context(history: Turn[]) {
  const recent = history.slice(-3);
  if (!recent.length) return "(start of conversation)";
  return recent.map((t) => `Person: ${t.user}\nAssistant (via ${t.tools.join(", ") || "no tools"}): ${t.speech}`).join("\n");
}

const SYSTEM = (tools: ToolInfo[], speaker: Speaker) => `You are the orchestration layer of a voice assistant on an Echo in someone's home (like Alexa+). You never answer questions about the house from your own knowledge; you call the Keeper MCP tools and the assistant speaks their results.
The person speaking is ${speaker === "owner" ? "the home's owner, on their own linked account" : "someone in the home who is not the owner: a sitter, guest, or helper"}.
Return ONE JSON object: {"calls":[{"name":"<tool>","arguments":{...}}],"say":"<only if no tool fits>"}.
Rules:
- Usually exactly 1 call. Arguments must match the tool's input schema exactly.
- A spoken pass code ("my code is four seven two nine"): visit_start with the digits only, e.g. "4729".
- Any question about the home, its people, pets, or how things work: house_ask with the person's own words as the question. Do not rephrase or add details.
- "Walk me through it", "step by step": routine_walk move "start" (add routine if they name one). During a routine, "next", "okay, done", "back", "say that again", "stop": routine_walk with that move.
- Emergency, injury, danger, poison, fire: emergency_info.
${speaker === "owner" ? `- "Remember that ...": note_add with the text; share "guests" only if they say guests/sitters should know or "share", else omit share.
- "Share it" / "make X private": note_update. "Give NAME a pass": pass_create (map spoken sections to: ${SECTIONS.join(", ")}). "Tell NAME ...": question_answer with the answer text only.
- "What happened", "while I was out": house_recap. "Did anyone ask anything": questions_open.` : "- Owner tools are not available to this person."}
- If the request has nothing to do with the home, return no calls and a one-sentence "say".
Tools:
${toolsFor(tools, speaker).map((t) => `- ${t.name}: ${t.description}\n  input: ${JSON.stringify(t.inputSchema)}`).join("\n")}`;

const cache = new Map<string, Plan>();

export async function planWithModel(utterance: string, history: Turn[], tools: ToolInfo[], speaker: Speaker): Promise<Plan> {
  const prompt = `Conversation so far:\n${context(history)}\n\nPerson now says: "${utterance}"`;
  const key = createHash("sha256").update(JSON.stringify([utterance.toLowerCase().trim(), context(history), speaker])).digest("hex");
  const hit = cache.get(key);
  if (hit) return { ...hit, source: "cache" };
  const { json, model } = await chatJson(SYSTEM(tools, speaker), prompt);
  const parsed = PlanSchema.parse(json);
  const names = new Set(toolsFor(tools, speaker).map((t) => t.name));
  const plan: Plan = { calls: parsed.calls.filter((c) => names.has(c.name)).slice(0, 2), say: parsed.say, source: "model", model };
  cache.set(key, plan);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return plan;
}

// ---------------- offline intent matcher ----------------

const DIGIT: Record<string, string> = { zero: "0", oh: "0", o: "0", one: "1", two: "2", to: "2", too: "2", three: "3", four: "4", for: "4", five: "5", six: "6", seven: "7", eight: "8", ate: "8", nine: "9" };
export function spokenDigits(s: string) {
  return s.toLowerCase().split(/[\s,.-]+/).map((w) => (/^\d+$/.test(w) ? w : DIGIT[w] ?? "")).join("");
}
const SEC_WORDS: [Section, RegExp][] = [["wifi", /wi-?fi|internet/], ["kids", /kid|mila|child/], ["pets", /pet|dog|biscuit/], ["kitchen", /kitchen|fridge/], ["house", /house|door|key/], ["bins", /bin|trash|recycl/], ["heating", /heat|thermostat/], ["security", /alarm|security/], ["emergency", /emergenc/], ["other", /other/]];
const WORDNUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, a_week: 7 };

export function planOffline(utterance: string, history: Turn[], speaker: Speaker): Plan {
  const u = utterance.toLowerCase().replace(/[.!?]+$/g, "").replace(/^(alexa|hey alexa)[, ]*/, "").trim();
  const one = (name: string, args: Record<string, unknown> = {}): Plan => ({ calls: [{ name, arguments: args }], source: "offline" });
  const inRoutine = history.length > 0 && history[history.length - 1].tools.includes("routine_walk") && !/That's everything|stopped/.test(history[history.length - 1].speech);
  let r: RegExpMatchArray | null;

  if (/emergenc|\b911\b|ambulance|bleeding|can't breathe|choking|poison|on fire|\bhurt\b|injured/.test(u)) return one("emergency_info");
  if ((r = u.match(/\b(?:code|pass ?code|pin)(?: is|'s)?[: ]+(.+)$/)) || (r = u.match(/^([\d\s]{4,})$/))) {
    const code = spokenDigits(r[1]);
    if (code.length >= 4) return one("visit_start", { code: code.slice(0, 12) });
  }
  if (inRoutine) {
    if (/^(next|next step|ok(ay)?|done|got it|finished|ready|and then|what's next|okay next|ok next|all set)\b/.test(u)) return one("routine_walk", { move: "next" });
    if (/^(back|go back|previous|last step)\b/.test(u)) return one("routine_walk", { move: "back" });
    if (/(repeat|say (that|it) again|again|what was that)/.test(u)) return one("routine_walk", { move: "repeat" });
    if (/^(stop|cancel|never mind|that's enough)\b/.test(u)) return one("routine_walk", { move: "stop" });
  }
  if ((r = u.match(/(?:walk me through|take me through|step by step|go through)\s*(?:it|that|the)?\s*(.*)$/)) || (r = u.match(/^(?:start|help me with|let's do|time for)\s+(?:the\s+)?(.*\b(?:bedtime|routine|dinner|feeding)\b.*)$/))) {
    const what = r[1].replace(/^(routine|steps)$/, "").trim();
    return one("routine_walk", what && !/^(it|that|this)$/.test(what) ? { move: "start", routine: what } : { move: "start" });
  }
  if (/^(i'm|i am) (leaving|heading out|off|done for (the )?(day|night))|^(bye|goodbye|lock (it|up))\b/.test(u)) return one("visit_end");
  if (/what can (you|i) (help|ask)|what('s| is) in (the|my) manual|what do you know|what('s| is) private/.test(u)) return one("house_manual");

  if (speaker === "owner") {
    if ((r = u.match(/^(?:remember|note|add a note|save a note)(?: that|:)?\s+(?:(for guests|for the sitter|privately)[:,]?\s+)?(.+)$/))) {
      const share = r[1] && /guest|sitter/.test(r[1]) ? "guests" : undefined;
      return one("note_add", { text: utterance.replace(/^.*?(?:remember|note|add a note|save a note)(?: that|:)?\s+(?:(?:for guests|for the sitter|privately)[:,]?\s+)?/i, "").replace(/[.!?]*$/, ""), ...(share ? { share } : {}) });
    }
    if ((r = u.match(/^share (it|that|this|the (.+?)(?: note)?)(?: with (?:guests|the sitter|everyone))?$/))) return one("note_update", { share: "guests", ...(r[2] ? { note: r[2] } : {}) });
    if ((r = u.match(/^(?:make|keep) (it|that|the (.+?)(?: note)?) private$/)) || (r = u.match(/^hide (it|that|the (.+?)(?: note)?)$/))) return one("note_update", { share: "private", ...(r[2] ? { note: r[2] } : {}) });
    if ((r = u.match(/^(?:remove|delete) the (.+?)(?: note)?$/))) return one("note_remove", { note: r[1] });
    if ((r = u.match(/^(?:give|make) (\w+) (?:a |an )?(sitter|guest|dog walker|helper|family)? ?(?:pass|code)(.*)$/))) {
      const rest = r[3] ?? "";
      const sections = SEC_WORDS.filter(([, re]) => re.test(rest)).map(([s]) => s);
      const d = rest.match(/for (\w+) (day|week|hour)s?/);
      const n = d ? (/^\d+$/.test(d[1]) ? Number(d[1]) : WORDNUM[d[1]] ?? 1) : undefined;
      const name = r[1].charAt(0).toUpperCase() + r[1].slice(1);
      return one("pass_create", { name, ...(r[2] ? { role: r[2] } : {}), ...(sections.length ? { sections } : {}), ...(d ? (d[2] === "hour" ? { hours: n } : { days: d[2] === "week" ? (n ?? 1) * 7 : n }) : {}) });
    }
    if ((r = u.match(/(?:turn off|end|revoke|cancel|stop) (\w+?)(?:'s)? (?:code|pass)/))) return one("pass_revoke", { name: r[1] });
    if (/who has a (pass|code)|which passes|who('s| is) (here|visiting)|list (the )?passes/.test(u)) return one("pass_list");
    if (/did (anyone|anybody|\w+) ask|any questions|open questions|what did \w+ ask|questions (from|waiting)/.test(u)) return one("questions_open");
    if ((r = utterance.match(/^(?:alexa,?\s*)?(?:tell|answer|reply to) (\w+)[:,]?\s+(?:that\s+)?(.+?)[.!?]*$/i))) return one("question_answer", { answer: r[2].charAt(0).toUpperCase() + r[2].slice(1) });
    if (/what happened|recap|while i was (out|away|gone)|what('s| has) been going on|how('s| is) (it|everything) going/.test(u)) return one("house_recap");
  }
  if (u.split(/\s+/).length < 2) return { calls: [], say: speaker === "owner" ? "Try \"what happened while I was out?\" or \"give Lee a dog walker pass for the pets\"." : "Ask me anything about the house, like \"what's the Wi-Fi password?\"", source: "offline" };
  return one("house_ask", { question: utterance.trim() });
}
