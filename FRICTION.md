# Friction log

Real friction from building Keeper for the Amazon Developer Hackathon "Build, Ship, Shape"
(Alexa+ track), Oct 20, 2026.

1. Identity on a shared device: MCP over Streamable HTTP gives the server a connection, not a
   person. There was no documented way for an Alexa+ MCP server to learn which household member
   is speaking, so Keeper separates the device link (guests, by spoken pass code) from the owner's
   connection (a key header standing in for account linking).
2. Privacy and tool results: anything a tool returns can be read aloud or shown on a card, so
   "don't reveal private notes" had to be enforced before search, not in the reply text. We also
   had to make the "not shared" and "not written down" replies identical so a guest can't probe.
3. Keyword search breaks on paraphrase: our held-out questions showed 6 of 13 answerable
   questions missed by search alone. A model resolver over only the visible notes helped (8 of 13)
   but the free open models we used were conservative and took 1.4 to 12.8 seconds per call.
4. Free model quota: the OpenRouter free tier is small, so the resolver is called only when search
   misses, results are cached, and every path has a no-model fallback.
5. Scripts and server-only modules: running the resolver eval outside Next.js needed the
   `react-server` import condition (for `server-only`) and an ESM script for top-level await.
