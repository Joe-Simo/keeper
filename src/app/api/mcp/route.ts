import { createMcpHandler } from "mcp-handler";
import { INSTRUCTIONS, SERVER_INFO, registerKeeper } from "@/lib/mcp-server";

export const maxDuration = 30;

/**
 * Keeper's MCP endpoint (Streamable HTTP, stateless; MCP 2025-11-25 and later).
 * Device connection: ?house=<id>. Owner connection: the same plus the owner key in the
 * x-keeper-key header (or ?key= for clients that only take a URL).
 */
const handler = createMcpHandler(registerKeeper, { serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });

export { handler as GET, handler as POST, handler as DELETE };
