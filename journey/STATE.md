# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `node server.ts` (port 4000)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step
v1 = server spawns headless Chromium (`--headless --dump-dom`) per request via execFile.
JS quotes page: 10 quotes (v0 got 0). Milestone technically hit. But ~15s per request.

## Next step
User guesses WHY it's 15s, then decide what to do about it.

## Concepts discovered
- client-side rendering vs SSR (curl gets the starting HTML only)
- browser = JS engine + DOM (live tree after scripts run)
- spawning a process (server launches another program, reads its stdout)

## Debt
- Chromium path hardcoded to Playwright cache (override with CHROME env)
