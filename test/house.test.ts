import { describe, expect, it } from "vitest";
import * as K from "@/lib/house";
import { CASES, HELD_OUT } from "./fixtures/questions";

const fresh = () => K.newHouse("h-testhouse1", "owner-key");
const guest = (h: K.House, code: string) => {
  K.startVisit(h, code);
  return K.audienceOf(h, null);
};

describe("passes and audiences", () => {
  it("is locked until a valid code, and the owner key unlocks owner mode", () => {
    const h = fresh();
    expect(K.audienceOf(h, null).kind).toBe("locked");
    expect(K.audienceOf(h, "wrong").kind).toBe("locked");
    expect(K.audienceOf(h, "owner-key").kind).toBe("owner");
    expect(K.startVisit(h, "0000").ok).toBe(false);
    expect(K.startVisit(h, "4 7 2 9").ok).toBe(true);
    expect(K.audienceOf(h, null)).toMatchObject({ kind: "guest", pass: { name: "Priya" } });
  });

  it("locks out code guessing after five wrong tries", () => {
    const h = fresh();
    for (let i = 0; i < 5; i++) K.startVisit(h, `100${i}`);
    expect(K.startVisit(h, "4729")).toMatchObject({ ok: false, speech: expect.stringContaining("Too many") });
  });

  it("refuses expired and revoked passes", () => {
    const h = fresh();
    h.passes[0].until = new Date(Date.now() - 1000).toISOString();
    expect(K.startVisit(h, "4729").ok).toBe(false);
    const owner = K.audienceOf(h, "owner-key");
    K.revokePass(h, owner, "Lee");
    expect(K.startVisit(h, "6150").ok).toBe(false);
  });

  it("still gives emergency information when locked", () => {
    const h = fresh();
    const r = K.ask(h, K.audienceOf(h, null), "Emergency, Mila is hurt");
    expect(r.speech).toContain("911");
    expect(r.speech).toContain("14 Alder Lane");
  });

  it("says nothing about the house when locked", () => {
    const h = fresh();
    const r = K.ask(h, K.audienceOf(h, null), "What's the wifi password?");
    expect(r.speech).not.toContain("lanternfish42");
    expect(r.speech).toContain("pass code");
  });
});

describe("the fixed question sets", () => {
  for (const [name, set] of [["development", CASES], ["held-out", HELD_OUT]] as const) {
    it(`${name}: no private or out-of-pass text is ever spoken`, () => {
      for (const c of set) {
        if (c.expect !== "withheld") continue;
        const h = fresh();
        const r = K.ask(h, guest(h, c.who === "Priya" ? "4729" : "6150"), c.q);
        expect(JSON.stringify(r), c.q).not.toContain(c.secret);
      }
    });
  }

  it("development: answers the answerable questions with the right note", () => {
    const wrong = CASES.filter((c) => c.expect === "answer").filter((c) => {
      const h = fresh();
      const r = K.ask(h, guest(h, c.who === "Priya" ? "4729" : "6150"), c.q);
      return r.note?.id !== c.note;
    });
    expect(wrong.map((c) => c.q)).toEqual([]);
  });

  it("gives the same words for a private note and for a miss", () => {
    const h = fresh();
    const a = guest(h, "4729");
    const priv = K.ask(h, a, "What's the alarm code?");
    const miss = K.ask(h, a, "Where are the extra towels?");
    expect(priv.speech).toBe(miss.speech);
  });

  it("tells the owner when a hidden note might cover a question", () => {
    const h = fresh();
    const a = guest(h, "4729");
    K.ask(h, a, "What's the alarm code?");
    K.ask(h, a, "Where are the extra towels?");
    const reasons = h.questions.map((q) => q.reason);
    expect(reasons).toEqual(["not_found", "not_shared"]);
  });
});

describe("routines", () => {
  it("walks bedtime step by step and remembers the step across turns", () => {
    const h = fresh();
    const a = guest(h, "4729");
    K.ask(h, a, "When does Mila go to bed?");
    expect(K.walk(h, a, "start").speech).toContain("Step 1:");
    expect(K.walk(h, a, "next").speech).toContain("Step 2:");
    expect(K.walk(h, a, "back").speech).toContain("Step 1:");
    expect(K.walk(h, a, "repeat").speech).toContain("Step 1:");
    for (let i = 0; i < 4; i++) K.walk(h, a, "next");
    expect(K.walk(h, a, "next").speech).toContain("That's everything");
  });

  it("will not walk a routine the pass doesn't cover", () => {
    const h = fresh();
    const lee = guest(h, "6150");
    const r = K.walk(h, lee, "start", "bedtime");
    expect(r.routine?.title).not.toBe("Mila's bedtime");
  });
});

describe("owner loop", () => {
  it("routes a question to the owner, delivers the answer, and the next guest hears it", () => {
    const h = fresh();
    const priya = guest(h, "4729");
    expect(K.ask(h, priya, "Can Mila have a friend over?").found).toBe(false);
    const owner = K.audienceOf(h, "owner-key");
    expect(K.openQuestions(h, owner).speech).toContain("Priya asked");
    const ans = K.answerQuestion(h, owner, { answer: "Yes, Ava from next door can come over until five" });
    expect(ans.speech).toContain("Priya");
    expect(K.deliverAnswers(h, priya)).toContain("Ava");
    expect(K.deliverAnswers(h, priya)).toBeNull();
    K.endVisit(h);
    const lee = guest(h, "6150");
    expect(K.ask(h, lee, "Can a friend come over?").found).toBe(false);
    K.endVisit(h);
    const priya2 = guest(h, "4729");
    const again = K.ask(h, priya2, "Can Mila have a friend over?");
    expect(again.found).toBe(true);
    expect(again.speech).toContain("Ava");
  });

  it("recaps what each guest heard and asked", () => {
    const h = fresh();
    const lee = guest(h, "6150");
    K.ask(h, lee, "When does Biscuit eat?");
    K.ask(h, lee, "What's the wifi password?");
    const r = K.recap(h, K.audienceOf(h, "owner-key"));
    expect(r.speech).toBe(`Lee heard Biscuit's dinner and asked you "What's the wifi password?". Lee is here now. 1 question needs your answer.`);
  });

  it("saves new notes as private until shared", () => {
    const h = fresh();
    const owner = K.audienceOf(h, "owner-key");
    const r = K.addNote(h, owner, { text: "the plants get watered on Thursday" });
    expect(r.speech).toContain("private");
    const priya = guest(h, "4729");
    expect(K.ask(h, priya, "Do the plants need water?").found).toBe(false);
    K.updateNote(h, owner, { share: "guests" });
    expect(K.ask(h, priya, "Do the plants need water?").found).toBe(true);
  });

  it("refuses owner actions from a guest", () => {
    const h = fresh();
    const priya = guest(h, "4729");
    expect(K.createPass(h, priya, { name: "Eve" }).kind).toBe("denied");
    expect(K.updateNote(h, priya, { note: "Alarm code", share: "guests" }).kind).toBe("denied");
  });

  it("creates a scoped pass with a working code and ends the old one", () => {
    const h = fresh();
    const owner = K.audienceOf(h, "owner-key");
    const r = K.createPass(h, owner, { name: "Lee", role: "dog walker", sections: ["pets"], days: 2 });
    expect(r.kind).toBe("pass");
    const code = (r as { pass: { code: string } }).pass.code;
    expect(K.startVisit(h, "6150").ok).toBe(false);
    expect(K.startVisit(h, code).ok).toBe(true);
  });
});
