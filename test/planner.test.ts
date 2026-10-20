import { describe, expect, it } from "vitest";
import { planOffline, spokenDigits } from "@/lib/planner";

const first = (u: string, speaker: "owner" | "guest" = "guest", tools: string[] = []) => planOffline(u, tools.length ? [{ user: "x", speech: "Step 1: ...", tools }] : [], speaker).calls[0];

describe("offline planner", () => {
  it("reads spoken codes", () => {
    expect(spokenDigits("four seven two nine")).toBe("4729");
    expect(first("Hi, I'm Priya. My code is 4 7 2 9")).toEqual({ name: "visit_start", arguments: { code: "4729" } });
    expect(first("my code is six one five oh")).toEqual({ name: "visit_start", arguments: { code: "6150" } });
  });
  it("sends questions through house_ask in the person's words", () => {
    expect(first("What's the Wi-Fi password?")).toEqual({ name: "house_ask", arguments: { question: "What's the Wi-Fi password?" } });
  });
  it("handles emergencies first", () => {
    expect(first("Emergency! Mila fell and she's hurt")?.name).toBe("emergency_info");
  });
  it("moves through routines only when in one", () => {
    expect(first("next", "guest", ["routine_walk"])).toEqual({ name: "routine_walk", arguments: { move: "next" } });
    expect(first("Walk me through it")).toEqual({ name: "routine_walk", arguments: { move: "start" } });
  });
  it("maps owner phrases", () => {
    expect(first("Tell Priya yes, Ava can come over until five", "owner")).toEqual({ name: "question_answer", arguments: { answer: "Yes, Ava can come over until five" } });
    expect(first("Give Lee a dog walker pass for the pets for two days", "owner")).toEqual({ name: "pass_create", arguments: { name: "Lee", role: "dog walker", sections: ["pets"], days: 2 } });
    expect(first("Remember for guests: the plants get watered on Thursday", "owner")).toEqual({ name: "note_add", arguments: { text: "the plants get watered on Thursday", share: "guests" } });
    expect(first("What happened while I was out?", "owner")?.name).toBe("house_recap");
  });
  it("never offers owner tools to a guest", () => {
    expect(first("Give me a pass for everything")?.name).toBe("house_ask");
  });
});
