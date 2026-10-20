"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardHost } from "./card-host";

type Call = { name: string; arguments: Record<string, unknown>; ok: boolean; ms: number };
type TurnResult = {
  speech: string;
  plan: { source: "model" | "offline" | "cache"; model: string | null; note: string | null };
  calls: Call[];
  card: { uri: string | null; tool: string; result: Record<string, unknown> } | null;
  cardHtml?: string;
  mcp: { protocolVersion: string | null; transport: string; connection?: string };
  ms: number;
};
type Person = { id: string; name: string; role: string; speaker: "owner" | "guest" };
type Turn = { id: number; user: string; via: "voice" | "text" | "tap"; person: Person; result?: TurnResult; error?: string };
type Snapshot = {
  id: string;
  owner: string;
  here: { name: string; role: string } | null;
  passes: { code: string; name: string; role: string; sections: string[]; until: string; active: boolean }[];
  notes: { id: string; title: string; section: string; share: "guests" | "private" }[];
  questions: { id: string; by: string; text: string; status: "open" | "answered"; answer: string | null }[];
  activity: { at: string; who?: string; text: string }[];
  routine: { noteId: string; step: number } | null;
};

const PEOPLE: Person[] = [
  { id: "priya", name: "Priya", role: "sitter", speaker: "guest" },
  { id: "lee", name: "Lee", role: "dog walker", speaker: "guest" },
  { id: "sam", name: "Sam", role: "owner", speaker: "owner" },
];
type Ring = "idle" | "listen" | "think" | "speak";
type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const STORE = "keeper-house-v1";

export function Simulator() {
  const [house, setHouse] = useState<{ id: string; key: string } | null>(null);
  const [person, setPerson] = useState<Person>(PEOPLE[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [ring, setRing] = useState<Ring>("idle");
  const [cardHtml, setCardHtml] = useState<string | null>(null);
  const [card, setCard] = useState<Record<string, unknown> | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [srOk, setSrOk] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const recog = useRef<SR | null>(null);
  const idRef = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const busy = ring === "think";

  const create = useCallback(async () => {
    const r = await fetch("/api/house", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create" }) });
    const d = (await r.json()) as { house: string; ownerKey: string; snapshot: Snapshot };
    localStorage.setItem(STORE, JSON.stringify({ id: d.house, key: d.ownerKey }));
    setHouse({ id: d.house, key: d.ownerKey });
    setSnap(d.snapshot);
  }, []);

  const refresh = useCallback(async (id: string) => {
    const r = await fetch(`/api/house?house=${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setSnap(await r.json());
    return r?.ok ?? false;
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setSrOk(!!(W.SpeechRecognition ?? W.webkitSpeechRecognition));
    let saved: { id: string; key: string } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
    } catch {}
    if (saved?.id && saved.key) {
      setHouse(saved);
      refresh(saved.id).then((ok) => {
        if (!ok) create();
      });
    } else create();
  }, [create, refresh]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return setRing("idle");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.03;
    u.onstart = () => setRing("speak");
    u.onend = () => setRing("idle");
    u.onerror = () => setRing("idle");
    window.speechSynthesis.speak(u);
  }, []);

  // Each person keeps their own thread of context, like separate conversations on the same Echo.
  const history = useMemo(
    () => turns.filter((t) => t.result && t.person.id === person.id).slice(-3).map((t) => ({ user: t.user, speech: t.result!.speech, tools: t.result!.calls.map((c) => c.name) })),
    [turns, person.id],
  );

  const send = useCallback(
    async (text: string, via: Turn["via"] = "text") => {
      const utterance = text.trim();
      if (!utterance || !house || busy) return;
      const id = ++idRef.current;
      setTurns((t) => [...t, { id, user: utterance, via, person }]);
      setInput("");
      setRing("think");
      try {
        const res = await fetch("/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ utterance, house: house.id, speaker: person.speaker, ...(person.speaker === "owner" ? { ownerKey: house.key } : {}), history, wantCard: !cardHtml }) });
        const data = (await res.json()) as TurnResult & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Keeper didn't answer. Try again.");
        if (data.cardHtml) setCardHtml(data.cardHtml);
        if (data.card) setCard(data.card.result);
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, result: data } : x)));
        setRing("idle");
        speak(data.speech);
        refresh(house.id);
      } catch (err) {
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: err instanceof Error ? err.message : "Something went wrong." } : x)));
        setRing("idle");
      }
    },
    [house, person, history, cardHtml, busy, speak, refresh],
  );

  const toolCall = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const res = await fetch("/api/tool", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ house: house?.id, speaker: person.speaker, ...(person.speaker === "owner" ? { ownerKey: house?.key } : {}), name, arguments: args }) });
      const data = (await res.json()) as { speech: string; structuredContent: Record<string, unknown> | null; isError: boolean };
      const id = ++idRef.current;
      const label = name === "routine_walk" ? `Tapped: ${String(args.move)}` : name === "note_update" ? "Tapped: change sharing" : name === "pass_revoke" ? "Tapped: end pass" : `Tapped: ${name.replace(/_/g, " ")}`;
      setTurns((t) => [...t, { id, user: label, via: "tap", person, result: { speech: data.speech, plan: { source: "offline", model: null, note: null }, calls: [{ name, arguments: args, ok: !data.isError, ms: 0 }], card: data.structuredContent ? { uri: null, tool: name, result: data.structuredContent } : null, mcp: { protocolVersion: null, transport: "streamable-http" }, ms: 0 } }]);
      if (data.structuredContent) setCard(data.structuredContent);
      speak(data.speech);
      if (house) refresh(house.id);
      return data;
    },
    [house, person, speak, refresh],
  );

  const listen = useCallback(() => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor || busy) return;
    if (recog.current) return recog.current.stop();
    window.speechSynthesis?.cancel();
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) finalText = text;
    };
    r.onend = () => {
      recog.current = null;
      setRing((x) => (x === "listen" ? "idle" : x));
      if (finalText) send(finalText, "voice");
    };
    r.onerror = () => {
      recog.current = null;
      setRing("idle");
    };
    recog.current = r;
    setRing("listen");
    r.start();
  }, [busy, send]);

  const reset = async () => {
    if (!house) return;
    window.speechSynthesis?.cancel();
    const r = await fetch("/api/house", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset", house: house.id, ownerKey: house.key }) });
    if (r.ok) setSnap(((await r.json()) as { snapshot: Snapshot }).snapshot);
    setTurns([]);
    setCard(null);
  };

  const mine = [...turns].reverse().find((t) => t.result && t.person.id === person.id)?.result;
  const pass = snap?.passes.find((p) => p.name === person.name);
  const isHere = snap?.here?.name === person.name;
  const suggestions = (() => {
    if (person.speaker === "owner") {
      const open = snap?.questions.find((q) => q.status === "open");
      return [
        "What happened while I was out?",
        ...(open ? [`Tell ${open.by} yes, Ava from next door can come over until five`] : ["Did anyone ask anything?"]),
        "Remember for guests: the plants get watered on Thursday",
        "Give Lee a dog walker pass for the pets for two days",
      ];
    }
    if (!isHere) return [pass ? `Hi, I'm ${person.name}. My code is ${pass.code.split("").join(" ")}` : `Hi, I'm ${person.name}`, "Emergency", "What's the Wi-Fi password?"];
    if (mine?.calls.some((c) => c.name === "routine_walk") && !/That's everything|stopped/.test(mine.speech)) return ["Next", "Say that again", "Back", "Stop"];
    if (mine?.card?.result && (mine.card.result as { note?: { steps?: unknown[] | null } }).note?.steps) return ["Walk me through it", "What can you help with?"];
    if (person.id === "lee") return ["When does Biscuit eat?", "Where's the leash?", "What's the Wi-Fi password?", "I'm heading out"];
    return ["What's the Wi-Fi password?", "When does Mila go to bed?", "Can Mila have a friend over?", "What's the alarm code?"];
  })();

  const deviceUrl = house && origin ? `${origin}/api/mcp?house=${house.id}` : "";
  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section aria-label="Simulated Alexa+ device" className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Who is speaking" className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs uppercase tracking-[0.14em] text-mute">Speaking</span>
          {PEOPLE.map((p) => (
            <button key={p.id} role="radio" aria-checked={person.id === p.id} onClick={() => setPerson(p)} className={`rounded-full border px-3.5 py-1.5 text-sm transition ${person.id === p.id ? "border-lamp bg-lamp text-[#1a130b]" : "border-line bg-panel text-ink hover:bg-panel-2"}`}>
              {p.name} <span className={person.id === p.id ? "text-[#1a130b]/70" : "text-mute"}>{p.role}</span>
            </button>
          ))}
        </div>

        <div className="rounded-[28px] border border-line bg-[#0c0a08] p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,.8)]">
          <div className="relative aspect-[16/10] overflow-hidden rounded-[18px] bg-[#14110e]">
            {cardHtml && card ? (
              <CardHost html={cardHtml} result={card} onToolCall={toolCall} onMessage={(t) => send(t, "tap")} />
            ) : (
              <div className="flex h-full flex-col justify-center px-8">
                <p className="text-sm uppercase tracking-[0.18em] text-mute">{snap?.here ? `${snap.here.name} is here` : "Locked"}</p>
                <p className="mt-2 max-w-md text-2xl font-semibold leading-tight text-ink sm:text-3xl">{busy ? "Thinking..." : person.speaker === "owner" ? "Ask what happened while you were out." : "Say your pass code, then ask anything about the house."}</p>
                <p className="mt-3 text-sm text-mute">Cards from Keeper&apos;s MCP server appear here, like on an Echo Show.</p>
              </div>
            )}
          </div>
          <div className="mx-auto mt-3 h-1.5 w-40 rounded-full" aria-hidden>
            <div className={`h-full w-full rounded-full ring-${ring}`} />
          </div>
        </div>

        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          {srOk && (
            <button type="button" onClick={listen} disabled={busy} aria-label={ring === "listen" ? "Stop listening" : "Speak to Keeper"} className={`grid size-12 shrink-0 place-items-center rounded-full border transition ${ring === "listen" ? "border-lamp bg-lamp text-[#1a130b]" : "border-line bg-panel text-ink hover:bg-panel-2"} disabled:opacity-50`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
          )}
          <label htmlFor="say" className="sr-only">Say something to Keeper as {person.name}</label>
          <input id="say" value={input} onChange={(e) => setInput(e.target.value)} placeholder={ring === "listen" ? "Listening..." : `Speak as ${person.name}`} maxLength={300} autoComplete="off" className="h-12 min-w-0 flex-1 rounded-full border border-line bg-panel px-5 text-base text-ink placeholder:text-mute focus:border-[#5a4a38] focus:outline-none" />
          <button type="submit" disabled={busy || !input.trim()} className="h-12 shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-[#14110e] transition hover:bg-white disabled:opacity-40">Send</button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy || !house} className="rounded-full border border-line bg-panel px-3.5 py-2 text-left text-sm text-ink transition hover:bg-panel-2 disabled:opacity-50">{s}</button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-label="Conversation and house">
        <div className="rounded-2xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Conversation</h2>
            <span className="text-xs text-mute">Each turn calls Keeper over MCP</span>
          </div>
          <div ref={log} className="max-h-[360px] min-h-[160px] space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {!turns.length && <p className="text-sm text-mute">Start as Priya, the sitter: say her code, then ask about the house. Switch to Sam to see what she asked. This house is private to your browser.</p>}
            {turns.map((t) => (
              <div key={t.id} className="space-y-1.5">
                <p className="text-sm"><span className="text-mute">{t.person.name}{t.via === "voice" ? " (voice)" : ""}:</span> {t.user}</p>
                {t.result && (
                  <>
                    <p className="text-[15px] leading-snug text-ink"><span className="mr-1.5 inline-block size-2 rounded-full bg-lamp align-middle" aria-hidden /> {t.result.speech}</p>
                    <details className="text-xs text-mute">
                      <summary className="cursor-pointer list-none select-none hover:text-ink">
                        {t.via === "tap" ? "From the card" : t.result.plan.source === "offline" ? "Planned by the offline matcher" : `Planned by ${t.result.plan.model?.split("/")[1]?.replace(":free", "") ?? "open model"}${t.result.plan.source === "cache" ? " (cached)" : ""}`}
                        {" · "}
                        {t.result.calls.map((c) => c.name).join(", ") || "no tool"}
                        {t.result.ms ? ` · ${(t.result.ms / 1000).toFixed(1)} s` : ""}
                      </summary>
                      <div className="mt-2 space-y-1.5 rounded-lg bg-[#14110e] p-2.5 font-mono text-[11px] leading-relaxed">
                        {t.result.plan.note && <p className="font-sans text-lamp">{t.result.plan.note}</p>}
                        {t.result.calls.map((c, i) => (
                          <p key={i} className="break-words"><span className={c.ok ? "text-ok" : "text-bad"}>tools/call</span> {c.name} {JSON.stringify(c.arguments)}{c.ms ? ` ${c.ms} ms` : ""}</p>
                        ))}
                        {t.result.mcp.protocolVersion && <p className="text-mute">MCP {t.result.mcp.protocolVersion} over Streamable HTTP, {t.result.mcp.connection === "owner" ? "owner" : "device"} connection</p>}
                      </div>
                    </details>
                  </>
                )}
                {t.error && <p className="text-sm text-bad">{t.error}</p>}
                {!t.result && !t.error && <p className="text-sm text-mute">...</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">The house, as Sam sees it</h2>
            <button onClick={reset} className="text-xs text-mute underline-offset-2 hover:text-ink hover:underline">Reset house</button>
          </div>
          <div className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-mute">Passes</h3>
              <ul className="space-y-1.5">
                {(snap?.passes ?? []).filter((p) => p.active).map((p) => (
                  <li key={p.code} className="leading-snug"><span className="text-lamp">{p.name}</span> {p.role} <span className="font-mono text-xs text-mute">{p.code}</span>{snap?.here?.name === p.name && <span className="ml-1.5 rounded-full border border-[#4a3a26] px-2 py-0.5 text-[11px] text-lamp">here</span>}</li>
                ))}
              </ul>
              <h3 className="mb-2 mt-4 text-xs uppercase tracking-wider text-mute">Private notes</h3>
              <p className="text-ink/90">{snap?.notes.filter((n) => n.share === "private").map((n) => n.title).join(", ") || "None"}</p>
              <h3 className="mb-2 mt-4 text-xs uppercase tracking-wider text-mute">Questions for Sam</h3>
              {snap?.questions.length ? (
                <ul className="space-y-1.5">{snap.questions.slice(0, 3).map((q) => <li key={q.id} className="leading-snug"><span className="text-lamp">{q.by}</span> {q.text} <span className="text-xs text-mute">{q.status}</span></li>)}</ul>
              ) : <p className="text-mute">None yet</p>}
            </div>
            <div>
              <h3 className="mb-2 text-xs uppercase tracking-wider text-mute">Visit log</h3>
              <ul className="space-y-1.5">
                {(snap?.activity ?? []).slice(0, 6).map((a, i) => (
                  <li key={i} className="leading-snug"><span className="text-lamp">{a.who ?? "Keeper"}</span> <span className="text-ink/90">{a.text}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panel px-4 py-4 text-sm">
          <h2 className="font-semibold">Connect your own MCP client</h2>
          <p className="mt-1 text-mute">The device link speaks for whoever&apos;s pass is active. Add the owner key as an <code className="font-mono text-xs">x-keeper-key</code> header to act as Sam.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-[#14110e] px-3 py-2 font-mono text-xs">{deviceUrl || "..."}</code>
            <button onClick={() => copy("url", deviceUrl)} disabled={!deviceUrl} className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs hover:bg-panel-2">{copied === "url" ? "Copied" : "Copy link"}</button>
            <button onClick={() => house && copy("key", house.key)} disabled={!house} className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs hover:bg-panel-2">{copied === "key" ? "Copied" : "Copy owner key"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
