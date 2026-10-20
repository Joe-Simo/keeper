import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { connectKeeper } from "@/lib/mcp-client";
import { createHouse } from "@/lib/store";

/** Real MCP over Streamable HTTP against the route handler (no network): the same client the simulator uses. */
const fetchToRoute = (async (input: RequestInfo | URL, init?: RequestInit) => POST(new Request(input, init))) as typeof fetch;

describe("Keeper MCP server", () => {
  it("negotiates 2025-11-25 and lists tools that link the MCP Apps card", async () => {
    const h = await createHouse();
    const c = await connectKeeper("http://keeper.test", h.id, null, fetchToRoute);
    expect(c.protocolVersion).toBe("2025-11-25");
    const tools = await c.tools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["visit_start", "house_ask", "routine_walk", "emergency_info", "note_add", "pass_create", "question_answer", "house_recap"]));
    expect(tools.every((t) => t.uiResource === "ui://keeper/house-card.html")).toBe(true);
    const html = await c.readResource("ui://keeper/house-card.html");
    expect(html).toContain("ui/notifications/tool-result");
    await c.close();
  });

  it("keeps a visit across connections and scopes answers to the pass", async () => {
    const h = await createHouse();
    const device = await connectKeeper("http://keeper.test", h.id, null, fetchToRoute);
    expect((await device.call("visit_start", { code: "6150" })).speech).toContain("Welcome, Lee");
    await device.close();
    const again = await connectKeeper("http://keeper.test", h.id, null, fetchToRoute);
    const food = await again.call("house_ask", { question: "When does Biscuit eat?" });
    expect(food.speech).toContain("6 PM");
    const wifi = await again.call("house_ask", { question: "What's the wifi password?" });
    expect(wifi.speech).not.toContain("lanternfish42");
    await again.close();
  });

  it("only the owner connection can change the manual", async () => {
    const h = await createHouse();
    const device = await connectKeeper("http://keeper.test", h.id, null, fetchToRoute);
    const denied = await device.call("note_update", { note: "Alarm code", share: "guests" });
    expect(denied.ok).toBe(false);
    await device.close();
    const owner = await connectKeeper("http://keeper.test", h.id, h.ownerKey, fetchToRoute);
    const r = await owner.call("house_recap", {});
    expect(r.ok).toBe(true);
    await owner.close();
  });

  it("reports a missing house as a tool error, not a crash", async () => {
    const c = await connectKeeper("http://keeper.test", "h-0000000000", null, fetchToRoute);
    const r = await c.call("house_ask", { question: "hello there" });
    expect(r.ok).toBe(false);
    await c.close();
  });
});
