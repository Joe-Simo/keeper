import { Simulator } from "@/components/simulator";

const REPO = "https://github.com/Joe-Simo/keeper";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-16 pt-8 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-[#241d16] text-lamp" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11 12 5l8 6v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M12 13v3" /></svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Keeper</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-mute">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href={REPO} className="hover:text-ink">GitHub</a>
        </nav>
      </header>

      <section className="mt-10 max-w-3xl">
        <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">The house manual Alexa+ reads to your sitter.</h1>
        <p className="mt-4 text-lg leading-relaxed text-mute">
          Keeper is a self-hosted MCP server. You tell it the things a sitter, guest, or dog walker always asks. They say their pass code to the Echo and ask in their own words. Keeper answers only from the notes their pass covers, walks them through bedtime step by step, and sends you anything it can&apos;t answer.
        </p>
      </section>

      <section className="mt-10" aria-label="Try Keeper">
        <Simulator />
      </section>

      <section id="how" className="mt-16 grid gap-6 sm:grid-cols-3">
        {[
          { h: "A pass, not a password list", p: "Sam gives Priya a sitter pass and Lee a dog walker pass: a 4-digit code, the sections it covers, and an end time. Lee can hear Biscuit's dinner, not the Wi-Fi." },
          { h: "Private means never a candidate", p: "A guest's question is searched only against notes their pass covers. Private notes are filtered out before the search runs, and a miss and a private hit get the same words." },
          { h: "Questions find their way home", p: "Anything the manual can't answer goes to Sam. Sam answers by voice, Priya hears it on her next turn, and the answer becomes a shared note for the next guest." },
        ].map((x) => (
          <div key={x.h} className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="font-semibold">{x.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">{x.p}</p>
          </div>
        ))}
      </section>

      <footer className="mt-14 border-t border-line pt-6 text-xs leading-relaxed text-mute">
        <p>
          This page simulates Alexa+ in the browser: an open model on OpenRouter plans each turn (with an offline matcher as fallback), your browser speaks the reply, and every action goes through Keeper&apos;s MCP endpoint at <code className="font-mono">/api/mcp</code> (Streamable HTTP, MCP 2025-11-25). Answers come only from the written notes, never from the model. The house, people, and phone numbers are fictional. Keeper is not made by or affiliated with Amazon.
        </p>
      </footer>
    </main>
  );
}
