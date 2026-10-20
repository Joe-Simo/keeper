/** The public origin of this deployment, so the simulator can reach its own MCP endpoint over HTTP. */
export function originOf(req: Request): string {
  if (process.env.KEEPER_SELF_URL) return process.env.KEEPER_SELF_URL;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
