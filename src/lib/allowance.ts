import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Daily model allowance for the public demo. The free model tier is about 50 requests a day for the
 * whole account, so Keeper caps its own share and gives each visitor a few model-planned turns.
 * After that, the offline intent matcher answers, so the demo never stops working.
 */
const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
export const limits = () => ({ perVisitor: n(process.env.KEEPER_TURNS_PER_VISITOR, 6), perDay: n(process.env.KEEPER_LLM_CALLS_PER_DAY, 15) });

const today = () => new Date().toISOString().slice(0, 10);
let global = { day: today(), used: 0 };

const COOKIE = "keeper_turns";
const secret = () => `keeper-allowance:${process.env.KEEPER_COOKIE_SECRET ?? process.env.OPENROUTER_API_KEY ?? "local"}`;
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url").slice(0, 22);

export function readUsed(req: Request): number {
  const raw = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1];
  const [day, used, sig] = (raw ? decodeURIComponent(raw) : "").split(".");
  const body = `${day}.${used}`;
  const ok = sig?.length === 22 && day === today() && timingSafeEqual(Buffer.from(sig), Buffer.from(sign(body)));
  return ok ? Number(used) || 0 : 0;
}

export function cookieFor(used: number) {
  const body = `${today()}.${used}`;
  return `${COOKIE}=${encodeURIComponent(`${body}.${sign(body)}`)}; Path=/; Max-Age=93600; HttpOnly; SameSite=Lax${process.env.VERCEL ? "; Secure" : ""}`;
}

export type Gate = { ok: true; used: number; commit: () => string } | { ok: false; reason: "visitor" | "global"; used: number };

/** Checks without spending; call commit() only when a model call is actually made. */
export function gate(req: Request): Gate {
  if (global.day !== today()) global = { day: today(), used: 0 };
  const lim = limits();
  const used = readUsed(req);
  if (used >= lim.perVisitor) return { ok: false, reason: "visitor", used };
  if (global.used >= lim.perDay) return { ok: false, reason: "global", used };
  return { ok: true, used, commit: () => { global.used++; return cookieFor(used + 1); } };
}
