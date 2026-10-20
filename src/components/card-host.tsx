"use client";

import { useEffect, useRef } from "react";

/**
 * A minimal MCP Apps host. It renders Keeper's ui:// card in a sandboxed iframe, answers the
 * ui/initialize handshake, pushes each tool result in with ui/notifications/tool-result, relays the
 * card's tools/call requests back to the MCP server, and turns ui/message into a new utterance.
 */
type Rpc = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown };

export function CardHost(props: {
  html: string | null;
  result: Record<string, unknown> | null;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<{ structuredContent: Record<string, unknown> | null; speech: string; isError: boolean }>;
  onMessage: (text: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const post = (msg: Omit<Rpc, "jsonrpc">) => frame.current?.contentWindow?.postMessage({ jsonrpc: "2.0", ...msg }, "*");
    const pushResult = () => {
      const r = latest.current.result;
      if (ready.current && r) post({ method: "ui/notifications/tool-result", params: { content: [{ type: "text", text: String(r.speech ?? "") }], structuredContent: r } });
    };
    const onMessage = async (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data as Rpc;
      if (!m || m.jsonrpc !== "2.0" || !m.method) return;
      if (m.method === "ui/initialize") {
        post({ id: m.id, result: { protocolVersion: "2026-01-26", hostInfo: { name: "Keeper Alexa+ simulator", version: "1.0.0" }, hostCapabilities: { serverTools: {}, message: { text: {} } }, hostContext: { theme: "dark", displayMode: "inline", platform: "web" } } });
      } else if (m.method === "ui/notifications/initialized") {
        ready.current = true;
        pushResult();
      } else if (m.method === "tools/call") {
        const p = (m.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        try {
          const r = await latest.current.onToolCall(String(p.name), p.arguments ?? {});
          post({ id: m.id, result: { content: [{ type: "text", text: r.speech }], structuredContent: r.structuredContent, isError: r.isError } });
        } catch {
          post({ id: m.id, error: { code: -32603, message: "Tool call failed" } });
        }
      } else if (m.method === "ui/message") {
        const content = (m.params?.content as { type: string; text?: string }[] | undefined) ?? [];
        const text = content.find((c) => c.type === "text")?.text;
        post({ id: m.id, result: {} });
        if (text) latest.current.onMessage(text);
      } else if (m.id !== undefined) {
        post({ id: m.id, result: {} });
      }
    };
    window.addEventListener("message", onMessage);
    pushResult();
    return () => window.removeEventListener("message", onMessage);
  }, [props.result]);

  if (!props.html) return null;
  return <iframe ref={frame} title="Keeper card (MCP Apps view)" srcDoc={props.html} sandbox="allow-scripts" className="h-full w-full border-0 bg-transparent" />;
}
