import { snapshot } from "@/lib/house";
import { createHouse, loadHouse, resetHouse, validHouseId } from "@/lib/store";

/**
 * The simulator's side panel. GET returns a read-only snapshot (no owner key, no note text).
 * POST {action:"create"} makes a fresh demo house and returns its owner key once.
 * POST {action:"reset", house, ownerKey} puts the house back to the starting point.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("house");
  if (!validHouseId(id)) return Response.json({ error: "no house" }, { status: 404 });
  const h = await loadHouse(id);
  if (!h) return Response.json({ error: "no house" }, { status: 404 });
  return Response.json(snapshot(h), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; house?: string; ownerKey?: string };
  if (body.action === "create") {
    const h = await createHouse();
    return Response.json({ house: h.id, ownerKey: h.ownerKey, snapshot: snapshot(h) });
  }
  if (body.action === "reset" && validHouseId(body.house) && body.ownerKey) {
    const h = await resetHouse(body.house, body.ownerKey);
    return h ? Response.json({ snapshot: snapshot(h) }) : Response.json({ error: "not allowed" }, { status: 403 });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
