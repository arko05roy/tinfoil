# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `node server.ts` (port 4000)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step
v4.1: locate() = first visible match + elementFromPoint hit-test, returns 409 with a reason instead of
clicking ghosts. Browser window 1280x800 (800x600 default gave Wikipedia's mobile layout, search 0x0).
Wikipedia: typing "Alan Turing" fills the box + triggers autocomplete. Can't submit: no Enter key.
(v4 = trusted click/type via CDP Input. v3.1 = pipe mode + targets/sessionId. See versions.md.)

## Next step (paused here for lunch)
Open question to user: why didn't "\n" act like Enter? Is Enter a character or something else?
Then: special keys (Enter/Tab/arrows), then wait-after-click-navigation, then read Turing's page.

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
- headless != neutral: viewport size changes the site you get (mobile layout)
- actionability: visible + not covered (hit test) before clicking; fail loudly
- trusted vs synthetic events: only browser-level input gets isTrusted=true; real input is coordinates + hit testing
- spawning a process (server launches another program, reads its stdout)

## Debt
- click that triggers navigation returns before the new page loads
- type() only does printable chars (no Enter/Tab/arrows)
- Chromium path hardcoded to Playwright cache (override with CHROME env)
- no session limit / idle timeout; no way for external Puppeteer/DevTools to attach (pipe mode)

## Notebook page (verbatim, rewritten 2026-11-16 w/ companies)
```
═══ BROWSER API FOR AGENTS ═══
1. FETCH
   curl → initial HTML only
   sites build page w/ JS (CSR)
   ∴ need real browser (headless chromium)
   → Firecrawl, ScrapingBee
     moat: crawl queue, md cleanup, proxies
2. CONTROL  (CDP)
   CDP = DevTools API of the browser
   cmd {id} → reply {same id}
   event {no id} → pushed to you
   1 conn, many tabs → sessionId/tab
   → Puppeteer
3. LIFECYCLE  (fate-sharing)
   prob: kill -9 server → orphan browsers (SIGKILL can't be caught)
   fix:  CDP over pipe; parent dies → OS closes pipe → EOF → browser exits
   DB = note ≠ world → reconcile
4. CLICKING  (actionability)
   visible? + elementFromPoint hit-test; fail → 409
   el.click() → isTrusted=false → bot; CDP Input @x,y → trusted
   viewport matters (800x600 → mobile)
   → Playwright auto-wait
─── SCALE ─── chromium ≈ 100s MB → cap sess/host
─── COMPANIES ─── infra → Steel, Browserbase, Browserless; agents → Browser Use, Skyvern
(blank: Enter/nav-wait, sessions, stealth)
```
Reserved bottom third: Enter/nav-wait, sessions+pooling, stealth.

## Interview weak spots
- said "kill -9 fixes it" (it's the problem; pipe is the fix)
- confused trusted input with humanized mouse paths (stealth, not built yet)
