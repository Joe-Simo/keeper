/**
 * Finds the note that answers a question, using only the notes it is handed. Callers filter by
 * audience first, so a note a guest may not hear is never a candidate. Deterministic BM25 over
 * title, keywords, and text, with a small household synonym table, so every answer is traceable to
 * one written note and the same question always gets the same answer.
 */
export interface Searchable { id: string; title: string; text: string; keywords?: string[]; steps?: string[] }
export interface Hit { id: string; score: number; coverage: number; matched: string[] }

const STOP = new Set(
  "a an the is are was were be been am do does did doing to of in on at for from by with and or but if then so than that this these those it its i me my we our us you your he she they them their his her what whats which who whom where when why how can could should would will shall may might must there here any some much many again please tell know need want like just get got also about into out up down over off ok okay hey alexa keeper sam sams have has had time turn keep go goes going put take make made does need needs thing anything something everything long there wont dont cant isnt doesnt im ive let lets house home one".split(" "),
);

/** Words people say for the same thing in a house. Each group expands to all its members. */
const GROUPS: string[][] = [
  ["wifi", "wi-fi", "internet", "network", "password", "router", "online"],
  ["trash", "garbage", "bin", "bins", "rubbish", "recycling", "recycle", "pickup", "collection"],
  ["thermostat", "heat", "heating", "temperature", "cold", "warm", "hot", "ac", "air"],
  ["dog", "biscuit", "puppy", "pup"],
  ["feed", "food", "dinner", "kibble", "eat", "meal", "fed"],
  ["walk", "leash", "lead", "outside"],
  ["bedtime", "bed", "sleep", "night", "asleep", "tuck"],
  ["allergy", "allergic", "allergies", "peanut", "nut", "epipen", "reaction"],
  ["tv", "television", "screen", "show", "episode", "watch", "bluey"],
  ["emergency", "hospital", "doctor", "pediatrician", "vet", "911", "hurt", "sick", "injured", "phone", "number", "call", "contact"],
  ["door", "lock", "locked", "key", "keys", "stuck", "sticks", "open"],
  ["alarm", "security", "code"],
  ["dishwasher", "dishes", "tablet", "tablets"],
  ["knife", "knives", "cooking", "cook", "stove", "oven", "fridge", "kitchen"],
  ["neighbor", "neighbour", "ruth", "next"],
  ["friend", "friends", "playdate", "visitor", "over"],
  ["mila", "kid", "kids", "child", "daughter"],
  ["money", "cash"],
  ["gift", "present", "surprise"],
];

const SYN = new Map<string, string[]>();
for (const g of GROUPS) {
  const roots = [...new Set(g.map(stem))];
  for (const r of roots) SYN.set(r, roots);
}

export function stem(w: string): string {
  let s = w.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-/g, "");
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.length > 4 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 3 && s.endsWith("ed") && !s.endsWith("eed")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("es") && /(sh|ch|x|ss)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  return s;
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/wi-fi/g, "wifi")
    .split(/[^a-z0-9'-]+/)
    .map((w) => w.replace(/'s$/, "").replace(/'/g, ""))
    .filter((w) => w && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 1);
}

function docTokens(n: Searchable) {
  // Title and keywords count double: they say what the note is about.
  const head = tokens(`${n.title} ${(n.keywords ?? []).join(" ")}`);
  return [...head, ...head, ...tokens(`${n.text} ${(n.steps ?? []).join(" ")}`)];
}

/**
 * An answer needs both: a real match (score) and most of what the person asked about matched
 * (coverage, the share of the question's informative words that the note covers, weighted by how
 * rare each word is). Coverage is what stops "Can Mila have a friend over?" from being answered
 * with a note that merely mentions Mila. Thresholds were set on the development questions in
 * test/fixtures/questions.ts and then frozen before the held-out set was scored (see README).
 */
export const MIN_SCORE = 1.0;
export const MIN_COVERAGE = 0.6;

/**
 * Ranks `notes` (the only candidates) for a question. Word rarity comes from `corpus` (by default
 * the candidates), so scores do not swing with how many notes a pass happens to cover.
 */
export function search(question: string, notes: Searchable[], k = 3, corpus: Searchable[] = notes): Hit[] {
  const q = [...new Set(tokens(question))];
  if (!q.length || !notes.length) return [];
  const stats = corpus.map((n) => docTokens(n));
  const N = stats.length;
  const df = new Map<string, number>();
  for (const d of stats) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = stats.reduce((s, d) => s + d.length, 0) / Math.max(1, N);
  const idf = (t: string) => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
  const qWeight = q.map((qt) => Math.max(...(SYN.get(qt) ?? [qt]).map(idf), idf(qt)));
  const total = qWeight.reduce((s, w) => s + w, 0);
  const k1 = 1.2, b = 0.6;
  const hits: Hit[] = [];
  for (const n of notes) {
    const toks = docTokens(n);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0, covered = 0;
    const matched: string[] = [];
    q.forEach((qt, i) => {
      // A word the person said counts fully; a synonym counts at 0.7.
      let best = 0, w = 0;
      for (const cand of SYN.get(qt) ?? [qt]) {
        const f = tf.get(cand);
        if (!f) continue;
        const factor = cand === qt ? 1 : 0.7;
        const s = idf(cand) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / avg))) * factor;
        if (s > best) { best = s; w = factor; }
      }
      if (best > 0) {
        score += best;
        covered += qWeight[i] * w;
        matched.push(qt);
      }
    });
    if (score > 0) hits.push({ id: n.id, score: Math.round(score * 100) / 100, coverage: Math.round((covered / total) * 100) / 100, matched });
  }
  return hits.sort((a, b) => b.score * b.coverage - a.score * a.coverage).slice(0, k);
}

export const answers = (h: Hit) => h.score >= MIN_SCORE && h.coverage >= MIN_COVERAGE;
