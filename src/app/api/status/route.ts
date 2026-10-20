import { limits } from "@/lib/allowance";
import { LLM_MODELS, llmEnabled, llmResting } from "@/lib/llm";
import { storageMode } from "@/lib/store";

export function GET() {
  return Response.json(
    { mcp: { endpoint: "/api/mcp", transport: "streamable-http", protocol: ["2025-11-25", "2026-07-28"] }, planner: llmEnabled() ? (llmResting() ? "offline (model quota used up)" : `model (${LLM_MODELS[0]})`) : "offline", storage: storageMode(), limits: limits() },
    { headers: { "cache-control": "no-store" } },
  );
}
