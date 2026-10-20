import { afterEach, describe, expect, it, vi } from "vitest";
import * as K from "@/lib/house";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("resolver", () => {
  it("only ever shows the model notes this person may hear", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    let prompt = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init: RequestInit) => {
      prompt = String(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"note":"n-alarm"}' } }] }), { status: 200 });
    }));
    const { resolveNote } = await import("@/lib/resolver");
    const h = K.newHouse("h-resolver01", "k");
    K.startVisit(h, "6150");
    const lee = K.audienceOf(h, null);
    const pick = await resolveNote("how do I switch off the beeping box", K.visibleNotes(h, lee));
    for (const n of h.notes.filter((x) => !K.visibleNotes(h, lee).includes(x))) expect(prompt).not.toContain(n.text);
    // The model named a private note; it is not visible, so the resolver refuses it.
    expect(pick).toBeNull();
    expect(K.ask(h, lee, "how do I switch off the beeping box", "n-alarm").speech).not.toContain("2580");
  });

  it("falls back to no answer when the model is unavailable", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    const { resolveNote } = await import("@/lib/resolver");
    const h = K.newHouse("h-resolver02", "k");
    expect(await resolveNote("anything", h.notes.filter((n) => n.share === "guests"))).toBeNull();
  });
});
