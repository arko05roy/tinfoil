# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `node server.ts` (port 4000)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step
v3.1: CDP over --remote-debugging-pipe (fd 3/4, \0-delimited) instead of a port. Pipe = browser-level
connection, so we Target.attachToTarget(flatten) the tab and stamp messages with its sessionId.
Verified: cookies + live JS state survive; session up in ~139ms; kill -9 on server -> browser dies too.
Routes: POST /sessions, GET /sessions, POST /sessions/:id/goto?url=, GET .../content, POST .../eval, DELETE.

## Next step
Pick next pressure: real agent actions (click/type) vs. many sessions at once (limits, idle timeout).

## Concepts discovered
- client-side rendering vs SSR (curl gets the starting HTML only)
- browser = JS engine + DOM (live tree after scripts run)
- headless vs headless shell (no window vs engine-only build)
- profile folder = browser memory on disk; session vs persistent cookies
- measure before fixing (empty page vs real page split)
- CDP: browser runs an API; HTTP lobby + WebSocket per tab; commands (id) vs events (no id)
- orphan processes (parent dies -> adopted by pid 1)
- DB = note about the world, not the world -> reconcile
- SIGKILL cannot be caught; cleanup must live outside the process
- fate-sharing: pipe mode, OS closes the pipe on parent death, browser exits
- CDP targets + multiplexing (one connection, sessionId per tab)
- spawning a process (server launches another program, reads its stdout)

## Debt
- Chromium path hardcoded to Playwright cache (override with CHROME env)
- no session limit / idle timeout; no way for external Puppeteer/DevTools to attach (pipe mode)
