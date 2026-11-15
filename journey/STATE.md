# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `node server.ts` (port 4000)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step
v1.1: chrome-headless-shell (startup 11.5s -> 0.5s). v2: POST /sessions -> uuid; /fetch?session= uses
--user-data-dir=profiles/<id>. Persistent cookies survive; session cookies die (browser dies per request).

## Next step
"Current tab" can't live in a folder (page JS state, typed text, scroll). User decides how to keep it.

## Concepts discovered
- client-side rendering vs SSR (curl gets the starting HTML only)
- browser = JS engine + DOM (live tree after scripts run)
- headless vs headless shell (no window vs engine-only build)
- profile folder = browser memory on disk; session vs persistent cookies
- measure before fixing (empty page vs real page split)
- spawning a process (server launches another program, reads its stdout)

## Debt
- Chromium path hardcoded to Playwright cache (override with CHROME env)
- sessions never deleted; profiles/ grows forever
