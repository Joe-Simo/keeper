import "server-only";
import { chatJson, llmEnabled, llmResting } from "./llm";
import type { Note } from "./house";

/**
 * When lexical search finds nothing, a free open model gets one look at the notes this person is
 * allowed to hear (never private or out-of-pass notes, which are not in the prompt at all) and
 * picks the one that answers the question, or none. Keeper then speaks the owner's note verbatim,
 * so the model chooses but never writes the answer.
 */
const SYSTEM = [
  "You match a question from someone staying in a home to the owner's house notes.",
  "Return JSON {\"note\": \"<id>\"} for the single note that directly answers the question, or {\"note\": null} if none does.",
  "Only pick a note if it actually contains the answer. A note that is merely on a related topic is not an answer. When unsure, return null.",
].join(" ");

const cache = new Map<string, string | null>();

export async function resolveNote(question: string, visible: Note[]): Promise<string | null> {
  if (!visible.length || !llmEnabled() || llmResting()) return null;
  const key = `${question.toLowerCase().trim()}|${visible.map((n) => `${n.id}:${n.updatedAt}`).join(",")}`;
  if (cache.has(key)) return cache.get(key)!;
  const list = visible.map((n) => `- id ${n.id}: ${n.title}. ${n.text}${n.steps?.length ? ` Steps: ${n.steps.join(" / ")}` : ""}`).join("\n");
  try {
    const { json } = await chatJson(SYSTEM, `Notes:\n${list}\n\nQuestion: ${question}`, 20_000);
    const id = (json as { note?: unknown }).note;
    const pick = typeof id === "string" && visible.some((n) => n.id === id) ? id : null;
    cache.set(key, pick);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return pick;
  } catch {
    return null;
  }
}
