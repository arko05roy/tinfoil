# tinfoil — STATE

Building our own Steel (browser API for AI agents) from zero. Reference repo (READ-ONLY): ~/Desktop/browser
Lang: TypeScript, Node 26 (runs .ts natively, no build). Run: `npm start` (port 4000). Code in src/ (main, config, cdp, sessions, input, http)

## Milestone (session 1)
Agent hits our server over HTTP, says "go to this URL", gets the page back as text.

## Last step (2026-11-17)
v5: cap 20/box (429+retry-after), idle 5min + max-life 30min janitor. Restructured into src/ + package.json/tsconfig/README.
v5.1: warm pool 5 (counts toward cap), empty → cold boot, used chrome KILLED never reused. claim 1–9ms vs ~450ms cold.
Scale drill done (discussion, in design.md): ~100 boxes/10k, CPU bites first, redis control plane, heartbeat TTL, 410 Gone.

## Next step
v5.1 pool DONE. Next: notebook ⑤ (cap+janitor+pool+kill-not-reuse), user says it out loud first; recall quiz on ④+ still owed.

## Concepts discovered
- rate limit = flow, cap = stock (box dies from stock)
- idle timeout (since last use) + max lifetime (zombie loops)
- admission control (refuse before spawning; count booting ones too)
- warm pool: pool size ≈ burst size; never reuse (state leaks between customers)
- control plane vs data plane; stateless routing (box in id) vs lookup table
- heartbeat w/ TTL = failure detection without a watcher; 410 Gone vs 502
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
- key identity: key/code/keyCode vs text; special keys have no text
- trusted vs synthetic events: only browser-level input gets isTrusted=true; real input is coordinates + hit testing
- spawning a process (server launches another program, reads its stdout)

## Debt
- settle(): fixed 500ms window; SPA pushState navs invisible (navigated:false lie); JS nav >500ms missed → reads old page; dangling load waiters time out after 30s
- KEYS table small (8 keys), no modifiers (Ctrl/Shift)
- Chromium path hardcoded to Playwright cache (override with CHROME env)
- no session limit / idle timeout; no way for external Puppeteer/DevTools to attach (pipe mode)

## Notebook page (verbatim, rewritten 2026-11-16 w/ companies)
```
① SCRAPER = headless chromium + read text (curl=1st HTML only, CSR)
   [YOU HAVE FIRECRAWL (baby) NOW]
② SCRAPER + CDP: cmd{id}→reply, event{no id}; 1 pipe many tabs → sessionId
   [YOU HAVE PUPPETEER NOW]
③ PUPPETEER + HTTP server + pipe: kill -9→orphans (SIGKILL uncatchable);
   pipe → parent dies → EOF → chrome exits; DB = note ≠ world → reconcile
   [YOU HAVE BROWSERLESS NOW]
④ BROWSERLESS + safe trusted clicks: visible + elementFromPoint else 409;
   el.click()=isTrusted false; CDP Input @x,y real; viewport matters
   [YOU HAVE STEEL v0 NOW (Playwright-grade clicks)]
   scale: chrome ~100s MB → cap sess/host
⑤ STEEL v0 + sessions + stealth → BROWSERBASE (blank, coming)
④+ STEEL v0 + keys + nav-wait
   key = key"Enter"+code+keyCode13(+text"\r"); "\n" no such key→ignored
   printable: text does the work; special = identity only → table
   settle: listen BEFORE act; frameStartedLoading ≤500ms? → wait load
   only click/Enter wait; arrows instant (0.5s→8ms ×200 presses)
   breaks: SPA pushState=no load→lies; JS nav >500ms→stale page
   [YOU HAVE PLAYWRIGHT-STYLE AUTO-WAIT NOW]
```
Reserved remaining: sessions+pooling, stealth (~1/4 page left, compress hard).

## Interview weak spots
- said "kill -9 fixes it" (it's the problem; pipe is the fix)
- confused trusted input with humanized mouse paths (stealth, not built yet)
