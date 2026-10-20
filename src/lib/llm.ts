import "server-only";

/**
 * One call to a free open model on OpenRouter that must return a JSON object. The free tier allows
 * about 50 requests a day for the whole account, so callers cache, cap, and always have a fallback.
 */
export const LLM_MODELS = (process.env.KEEPER_LLM_MODELS ?? "nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free").split(",").map((s) => s.trim()).filter(Boolean);
export const llmEnabled = () => !!process.env.OPENROUTER_API_KEY?.trim();

let exhaustedUntil = 0;
const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };
export const llmResting = () => Date.now() < exhaustedUntil;

/** House style: no em or en dashes in anything a model writes. */
export function tidy(s: string) {
  return s.replace(/\s*\u2014\s*/g, ", ").replace(/[\u2010-\u2013]/g, "-").replace(/\u00a0/g, " ");
}

export async function chatJson(system: string, user: string, timeoutMs = 25_000): Promise<{ json: unknown; model: string }> {
  if (!llmEnabled()) throw new Error("no model key");
  if (llmResting()) throw new Error("free daily model quota used up");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/Joe-Simo/keeper", "X-Title": "Keeper" },
    body: JSON.stringify({ model: LLM_MODELS[0], models: LLM_MODELS.slice(0, 3), temperature: 0.1, max_tokens: 700, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 429 && /per-day|daily|free-models-per-day/i.test(text)) exhaustedUntil = nextUtcMidnight();
    throw new Error(`OpenRouter ${res.status}`);
  }
  const data = JSON.parse(text) as { model?: string; error?: { message?: string }; choices?: { message?: { content?: string | null } }[] };
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message ?? "unknown"}`);
  const raw = (data.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("model returned no JSON");
  return { json: JSON.parse(tidy(json)), model: data.model ?? LLM_MODELS[0] };
}
