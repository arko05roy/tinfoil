# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `node server.ts` (port 4000)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step
v3: live browser per session, driven over raw CDP (WebSocket). In-memory Map, dies with server (user's call).
Routes: POST /sessions, GET /sessions, POST /sessions/:id/goto?url=, GET .../content, POST .../eval, DELETE.
Verified: session cookies + live JS state survive across requests; Ctrl+C kills browsers; profiles wiped at boot.
BROKEN: kill -9 on server -> browser orphaned (parent pid 1).

## Next step
User guesses why cleanup didn't run on kill -9, and how a browser could notice its parent died.

## Concepts discovered
- client-side rendering vs SSR (curl gets the starting HTML only)
- browser = JS engine + DOM (live tree after scripts run)
- headless vs headless shell (no window vs engine-only build)
- profile folder = browser memory on disk; session vs persistent cookies
- measure before fixing (empty page vs real page split)
- CDP: browser runs an API; HTTP lobby + WebSocket per tab; commands (id) vs events (no id)
- orphan processes (parent dies -> adopted by pid 1)
- DB = note about the world, not the world -> reconcile
- spawning a process (server launches another program, reads its stdout)

## Debt
- Chromium path hardcoded to Playwright cache (override with CHROME env)
- orphaned browsers on hard crash (kill -9)
- no session limit / idle timeout; ports just increment from 9300
