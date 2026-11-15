# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `node server.ts` (port 4000)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step
v4: agent actions. POST /sessions/:id/click {selector}|{x,y}, POST .../type {text, selector?}.
Selector -> scrollIntoView + bounding-rect center; then CDP Input.dispatchMouseEvent (move/press/release)
and Input.dispatchKeyEvent per char. Page sees isTrusted=true clicks, keydowns, input events.
(Pipe mode, targets/sessionId, live sessions: see v3.1. Routes also: goto, content, eval, DELETE.)

## Next step
User picks: special keys (Enter/Tab), screenshots for vision agents, waiting after click-navigations, or session limits.

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
- trusted vs synthetic events: only browser-level input gets isTrusted=true; real input is coordinates + hit testing
- spawning a process (server launches another program, reads its stdout)

## Debt
- click that triggers navigation returns before the new page loads
- type() only does printable chars (no Enter/Tab/arrows)
- Chromium path hardcoded to Playwright cache (override with CHROME env)
- no session limit / idle timeout; no way for external Puppeteer/DevTools to attach (pipe mode)
