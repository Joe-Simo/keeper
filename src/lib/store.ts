import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { newHouse, type House } from "./house";

/**
 * Where each house lives between conversations.
 * Production: one private Vercel Blob object per house, read fresh on every request, so what the
 * owner changes from their phone is what the sitter's Echo hears next.
 * Local and tests: memory plus a JSON file in .data/.
 */
const dir = process.env.KEEPER_DATA_DIR || (process.env.VERCEL ? "/tmp/keeper" : path.join(process.cwd(), ".data"));
const memory = new Map<string, House>();
const locks = new Map<string, Promise<unknown>>();

export const HOUSE_RE = /^h-[a-z0-9]{10}$/;
export const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
export const storageMode = () => (blobEnabled() ? "blob" : "local");
export const validHouseId = (id: string | null | undefined): id is string => !!id && HOUSE_RE.test(id);

const key = (id: string) => `keeper/houses/${id}.json`;

async function readRaw(id: string): Promise<House | null> {
  if (blobEnabled()) {
    try {
      const { get } = await import("@vercel/blob");
      const res = await get(key(id), { access: "private", useCache: false });
      if (res && res.statusCode === 200) return JSON.parse(await new Response(res.stream).text()) as House;
      return null;
    } catch (err) {
      console.error(`[keeper] blob read ${id} failed, using local copy:`, err instanceof Error ? err.message : err);
    }
  }
  if (memory.has(id)) return structuredClone(memory.get(id)!);
  try {
    return JSON.parse(await fs.readFile(path.join(dir, key(id)), "utf8")) as House;
  } catch {
    return null;
  }
}

async function writeRaw(h: House) {
  memory.set(h.id, structuredClone(h));
  if (blobEnabled()) {
    try {
      const { put } = await import("@vercel/blob");
      await put(key(h.id), JSON.stringify(h), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
      return;
    } catch (err) {
      console.error(`[keeper] blob write ${h.id} failed, kept locally:`, err instanceof Error ? err.message : err);
    }
  }
  const file = path.join(dir, key(h.id));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(h));
}

export const loadHouse = (id: string) => readRaw(id);

/** Creates a fresh demo house and returns its id and owner key. The key is shown once, to the creator. */
export async function createHouse(): Promise<House> {
  const id = `h-${randomBytes(8).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(10, "0").slice(0, 10)}`;
  const h = newHouse(id);
  await writeRaw(h);
  return h;
}

/** Puts a house back to the demo starting point, keeping its id and owner key. */
export async function resetHouse(id: string, ownerKey: string): Promise<House | null> {
  const h = await readRaw(id);
  if (!h || h.ownerKey !== ownerKey) return null;
  const fresh = newHouse(id, ownerKey);
  await writeRaw(fresh);
  return fresh;
}

export class NoHouse extends Error {}

/** Runs one operation against a house under a per-instance lock; saves only if something changed. */
export async function withHouse<T>(id: string, fn: (h: House) => T | Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    const h = await readRaw(id);
    if (!h) throw new NoHouse(id);
    const before = JSON.stringify(h);
    const result = await fn(h);
    if (JSON.stringify(h) !== before) await writeRaw(h);
    return result;
  });
  locks.set(id, run);
  try {
    return await run;
  } finally {
    if (locks.get(id) === run) locks.delete(id);
  }
}
