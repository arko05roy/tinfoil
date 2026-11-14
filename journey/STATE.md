# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `node server.ts` (port 4000)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step
v0 = `GET /fetch?url=` → server-side fetch() → raw HTML. Works on example.com.
Broke on quotes.toscrape.com/js/: 0 quote divs; content is built by JS in the browser.

## Next step
User's call (pending): 
  1. jsdom (run JS in Node, fake DOM): cheap, expected to break on real sites
  2. real Chrome (drive it, read the finished DOM)
  3. other

## Concepts discovered
- client-side rendering vs SSR (curl gets the starting HTML only)
- browser = JS engine + DOM (live tree after scripts run)

## Debt
- none yet
