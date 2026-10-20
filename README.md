# Keeper

**The house manual Alexa+ reads to whoever is home, and only what they're allowed to hear.**

When you go away, someone else runs your home for a few days: a sitter, a dog walker, a parent
helping out. Today the knowledge lives in a fridge note, a long text thread, and your phone,
which rings at 9 PM with "what's the wifi again?" and "is Mila allowed peanut butter?".

Keeper is a self-hosted **MCP server for Alexa+**. The owner tells Alexa+ what the house needs
(notes, routines, who is coming), and gives each person a short **pass**: a spoken code, the parts of
the manual it covers, and when it expires. Whoever is home just asks. Keeper answers in the
owner's own words, walks routines one step at a time, and sends anything it can't answer back to
the owner, who answers by voice. The next time that person asks, Keeper tells them.

Built for the Amazon Developer Hackathon "Build, Ship, Shape", Alexa+ track.

Live: https://keeper-lake-iota.vercel.app (simulated Alexa+ web app) · MCP endpoint: `/api/mcp`

## What it does

- **Passes, not accounts.** "Give Lee a dog walker pass for the pets for two days." Lee says his
  code to the device and hears only pet and emergency notes until the pass ends.
- **Private by default.** New notes are private until the owner shares them. A guest who asks
  about something private hears exactly the same words as for something that isn't written down,
  so the reply never reveals that a private note exists.
- **Routines, one step at a time.** "Walk me through bedtime" keeps its place across turns:
  next, back, repeat, stop.
- **Questions go home.** Unanswered questions are logged for the owner ("Priya asked: can Mila
  have a friend over?"). The owner answers by voice; the answer is delivered on the guest's next
  turn and saved as a shared note so it's covered next time.
- **Emergency first.** Emergency numbers and the address are always available, even before
  anyone says a code.
- **A card on screen devices.** Every tool links an MCP Apps card (`ui://keeper/house-card.html`)
  that shows the answer, the routine step, the pass, or the owner's recap.

## Architecture

```
 Alexa+ (or the simulator on the web page)
   │  Streamable HTTP, MCP 2025-11-25
   ▼
 /api/mcp  ── mcp-handler + @modelcontextprotocol/server
   │  connection → house id (device link) + owner key (owner's connection only)
   ▼
 src/lib/mcp-server.ts   15 tools, 1 prompt, 1 MCP Apps resource
   │
   ├─ src/lib/house.ts    audiences, passes, notes, routines, questions, recap (pure, tested)
   │    └─ src/lib/search.ts    BM25 over the notes this person may hear (private notes are
   │                            filtered out before search, so they are never candidates)
   ├─ src/lib/resolver.ts  only when search misses: a free open model sees the same visible notes
   │                       and picks one or none; Keeper speaks the owner's note verbatim
   └─ src/lib/store.ts     one JSON document per house in a private Vercel Blob store, with a
                           per-house lock; local files in development
```

The web page is a **simulated Alexa+ web app**: you choose who is speaking (Priya the sitter,
Lee the dog walker, or Sam the owner), type or speak, and each turn is planned (a free open model
on OpenRouter, or an offline intent matcher when that is unavailable) into real MCP tool calls
against the same `/api/mcp` endpoint Alexa+ would use. The side panel shows the house as Sam
sees it: passes, open questions, and the activity log.

### Tools

| Tool | Who | What |
| --- | --- | --- |
| `visit_start` | anyone | Say a pass code to start a visit. Five wrong codes in 10 minutes locks guessing. |
| `visit_end` | guest | End the visit. |
| `house_ask` | guest, owner | Answer from the notes this person may hear, or route the question to the owner. |
| `routine_walk` | guest, owner | Start, next, back, repeat, or stop a step-by-step routine. |
| `emergency_info` | anyone | Emergency numbers and the address. |
| `house_manual` | guest, owner | What this person can ask about. |
| `note_add`, `note_update`, `note_remove` | owner | Write the manual; share or unshare a note. |
| `pass_create`, `pass_revoke`, `pass_list` | owner | Who can hear what, and until when. |
| `questions_open`, `question_answer` | owner | See and answer what guests asked. |
| `house_recap` | owner | What happened while you were out. |

Prompt: `sitter_handoff` (a guided walk through setting up a pass and the notes it needs).

### Security model, and what is simulated

- The **device link** (`/api/mcp?house=…`) speaks for whoever has an active pass on it. It can
  never change the manual.
- The **owner key** (header `x-keeper-key`) makes a connection the owner's. In a real Alexa+
  deployment this is the place for account linking (OAuth) and voice recognition of the owner; the
  simulator gives you the key once, in your browser, for your own demo house.
- Spoken codes are four digits so they are easy to say; the lockout above limits guessing.
- The resolver's prompt contains only the notes the current person may hear, and its choice is
  ignored unless it names one of those notes (tested in `test/resolver.test.ts`).

## How well it answers (measured)

The question sets in `test/fixtures/questions.ts` are fixed. The search thresholds were set on the
**development** set; the **held-out** set was written after the thresholds were frozen and scored
once, unedited. `pnpm eval` reproduces the search numbers; `pnpm eval:resolver` reruns the model
pass (one free model call per case, so results can vary from run to run).

| | Development (40) | Held-out (20) |
| --- | --- | --- |
| Answerable, right note (search only) | 24 / 24 | 6 / 13 |
| Answerable, right note (search, then resolver on misses) | not run | 8 / 13 |
| Private or out-of-pass questions routed to the owner | 9 / 10 | 5 / 5 (search) · 5 / 5 (with resolver) |
| Not in the manual, routed to the owner | 4 / 6 | 2 / 2 (search) · 2 / 2 (with resolver) |
| Replies containing private or out-of-pass text | 0 | 0 |

The development misses were three wrong shared notes, not leaks: "Is it okay if I take a bath?"
got Mila's bedtime routine (which mentions her bath), "What should I make for dinner?" got
Biscuit's dinner, and Lee's "How do I open the back door?" got the walking note (the leash hangs
by the back door). The held-out results show the honest limit: paraphrases like "How many scoops
for Biscuit?" or "Is it garbage day tomorrow?" are missed, and the model resolver is deliberately
conservative (it recovered 2 of 7 and picked no wrong notes). A miss is never silent: it becomes a
question for the owner, and the owner's answer is saved so the next person is covered.

Raw results: `eval/results.json`, `eval/resolver-heldout.json`.

## Run it

```
pnpm install
pnpm dev          # http://localhost:3000, simulator and /api/mcp
pnpm test         # vitest: house logic, privacy, planner, resolver, and real MCP over HTTP
pnpm eval         # writes eval/results.json
```

Optional environment (see `.env.example`): `OPENROUTER_API_KEY` for the model planner and
resolver, `BLOB_READ_WRITE_TOKEN` for persistent houses.

To connect a real MCP client, use the device link from the page's Connect panel
(`https://<host>/api/mcp?house=<id>`); add the header `x-keeper-key: <owner key>` for the owner's
connection.

## The demo house

Everything in the demo is fictional: Sam's house at 14 Alder Lane, Mila (6), Biscuit the dog,
Priya the sitter, Lee the dog walker. Phone numbers use the reserved 555-01xx range.

## Built with AI assistance

Keeper was designed and written with AI coding assistance. The demo video's narration is a
synthetic voice (Piper, LJ Speech voice). All evaluation numbers above come from the scripts in
this repository.

## License

MIT
