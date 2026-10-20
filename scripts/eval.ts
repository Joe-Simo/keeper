/**
 * Scores Keeper's guest answers on the fixed question sets and writes the observed numbers to
 * eval/results.json. Nothing here is estimated: every number is a count of cases.
 *   correct   right note spoken (answerable cases), or routed to Sam without speaking (others)
 *   wrong     a different shared note was spoken (not a leak, but not the right answer)
 *   leaked    any reply contained the withheld note's secret text
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { audienceOf, ask, newHouse, startVisit } from "../src/lib/house";
import { CASES, HELD_OUT, type Case } from "../test/fixtures/questions";

function score(set: Case[]) {
  const rows = set.map((c) => {
    const h = newHouse("h-eval000000", "k");
    startVisit(h, c.who === "Priya" ? "4729" : "6150");
    const r = ask(h, audienceOf(h, null), c.q);
    const leaked = c.expect === "withheld" && JSON.stringify(r).includes(c.secret);
    const correct = c.expect === "answer" ? r.note?.id === c.note : !r.found;
    return { who: c.who, q: c.q, expect: c.expect, spoke: r.note?.id ?? null, correct, leaked };
  });
  const by = (e: Case["expect"]) => rows.filter((x) => x.expect === e);
  return {
    cases: rows.length,
    answerable: { cases: by("answer").length, correct: by("answer").filter((x) => x.correct).length },
    withheld: { cases: by("withheld").length, routed: by("withheld").filter((x) => x.correct).length, wrongNoteSpoken: by("withheld").filter((x) => !x.correct).length, leaked: rows.filter((x) => x.leaked).length },
    notInManual: { cases: by("none").length, routed: by("none").filter((x) => x.correct).length },
    misses: rows.filter((x) => !x.correct),
  };
}

const out = { generated: new Date().toISOString(), development: score(CASES), heldOut: score(HELD_OUT) };
mkdirSync("eval", { recursive: true });
writeFileSync("eval/results.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
