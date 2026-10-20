import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

/**
 * The simulator talks to Keeper exactly the way Alexa+ (or any MCP host) would: the official MCP
 * client over Streamable HTTP, negotiating protocol 2025-11-25. No shortcuts into server code.
 */
export interface ToolInfo { name: string; title?: string; description?: string; inputSchema: unknown; uiResource?: string }
export interface CallOutcome { name: string; arguments: Record<string, unknown>; ok: boolean; speech: string; structured: Record<string, unknown> | null; ms: number }

export async function connectKeeper(baseUrl: string, house: string, ownerKey?: string | null, fetchImpl?: typeof fetch) {
  const url = new URL("/api/mcp", baseUrl);
  url.searchParams.set("house", house);
  const headers: Record<string, string> = {};
  // The owner's key travels in a header, never in a URL that could end up in logs.
  if (ownerKey) headers["x-keeper-key"] = ownerKey;
  // Requests to our own deployment must carry the protection bypass when one is configured.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers }, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  const client = new Client({ name: "keeper-alexa-simulator", version: "1.0.0" });
  await client.connect(transport);
  const protocolVersion = (transport as unknown as { protocolVersion?: string }).protocolVersion ?? null;

  return {
    protocolVersion,
    server: client.getServerVersion(),
    async tools(): Promise<ToolInfo[]> {
      const { tools } = await client.listTools();
      return tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, uiResource: (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri }));
    },
    async call(name: string, args: Record<string, unknown>): Promise<CallOutcome> {
      const started = Date.now();
      try {
        const r = await client.callTool({ name, arguments: args });
        const structured = (r.structuredContent as Record<string, unknown> | undefined) ?? null;
        const text = (r.content as { type: string; text?: string }[] | undefined)?.find((c) => c.type === "text")?.text ?? "";
        return { name, arguments: args, ok: !r.isError, speech: typeof structured?.speech === "string" ? structured.speech : text, structured, ms: Date.now() - started };
      } catch (err) {
        console.error(`[keeper] tools/call ${name} failed:`, err instanceof Error ? err.message : err);
        return { name, arguments: args, ok: false, speech: "Sorry, that didn't work. Please try again.", structured: null, ms: Date.now() - started };
      }
    },
    async readResource(uri: string): Promise<string | null> {
      const r = await client.readResource({ uri });
      const c = r.contents[0] as { text?: string } | undefined;
      return c?.text ?? null;
    },
    close: () => client.close(),
  };
}
export type KeeperClient = Awaited<ReturnType<typeof connectKeeper>>;
