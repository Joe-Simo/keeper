/**
 * One pass of the model resolver over every case in a question set that lexical search does not
 * answer, run against the real free OpenRouter models. Writes eval/resolver-<set>.json. Costs one
 * model call per case; results are counts of what happened, including errors.
 *   usage: tsx scripts/eval-resolver.mts heldout|development
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { ask, audienceOf, lexicalAnswer, newHouse, startVisit, visibleNotes } from "../src/lib/house";
import { CASES, HELD_OUT } from "../test/fixtures/questions";

const which = process.argv[2] === "development" ? "development" : "heldout";
const set = which === "development" ? CASES : HELD_OUT;
const { resolveNote } = await import("../src/lib/resolver");
const rows: { who: string; q: string; expect: string; want: string | null; picked: string | null; correct: boolean; leaked: boolean; ms: number }[] = [];
for (const c of set) {
  const h = newHouse("h-evalres000", "k");
  startVisit(h, c.who === "Priya" ? "4729" : "6150");
  const a = audienceOf(h, null);
  if (lexicalAnswer(h, a, c.q)) continue;
  const t0 = Date.now();
  const pick = await resolveNote(c.q, visibleNotes(h, a));
  const r = ask(h, a, c.q, pick);
  const leaked = c.expect === "withheld" && JSON.stringify(r).includes(c.secret);
  const correct = c.expect === "answer" ? r.note?.id === c.note : !r.found;
  rows.push({ who: c.who, q: c.q, expect: c.expect, want: "note" in c ? c.note : null, picked: pick, correct, leaked, ms: Date.now() - t0 });
}
const by = (e: string) => rows.filter((x) => x.expect === e);
const out = {
  generated: new Date().toISOString(), set: which, casesSentToResolver: rows.length,
  answerableRecovered: `${by("answer").filter((x) => x.correct).length}/${by("answer").length}`,
  withheldStillRouted: `${by("withheld").filter((x) => x.correct).length}/${by("withheld").length}`,
  notInManualStillRouted: `${by("none").filter((x) => x.correct).length}/${by("none").length}`,
  leaked: rows.filter((x) => x.leaked).length, rows,
};
mkdirSync("eval", { recursive: true });
writeFileSync(`eval/resolver-${which}.json`, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
