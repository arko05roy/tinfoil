# decisions
- TypeScript on Node 26, zero deps, native type stripping. Reason: Puppeteer/CDP ecosystem lives here, and the reference repo (Steel) is TS, so side-by-side reveals are easy.
- Name: tinfoil.

## 2026-11-15
- Real Chrome over jsdom. Binary: chrome-headless-shell (11.5s -> 0.5s startup vs full Chrome).
- Sessions: POST /sessions returns a server-owned uuid (not agent-picked names).
- Session registry: in-memory Map, sessions die with the server (DB + reconcile deferred).
- CDP over pipe, not port: browsers die with the server even on kill -9. Cost: no external Puppeteer/DevTools attach.
- Click/type target: both selector and x,y (HTML-reading and screenshot agents).
- Check visibility before clicking; fail loudly with a reason. Default window 1280x800.

## Special keys = separate /press action (not {Enter} inside type text)
## Nav wait: listen 500ms, wait for load only if nav started. Only nav-capable actions (click, Enter) pay it — user: "for certain ones we wait, others instant". Agent override flag skipped.
## Single file for now: split by concern when it hurts (~500-800 lines / pooling lands).

## v5: cap + janitor (2026-11-17)
- Rate limit alone = controls flow, box dies from stock (1 leak/min never trips it). Chose: cap the tub.
- MAX_SESSIONS=20/box, 429 + retry-after when full (not a queue). `starting` counter so parallel POSTs can't sneak past.
- Idle timeout 5min (since last use, not since created → busy agents survive) + max life 30min (stops zombie loops pinging forever).
- Measured: ~150MB/blank session, cold start 110–460ms.

## v5.1: warm pool (2026-11-17)
- POOL_SIZE=5 warm chromes, count toward MAX_SESSIONS (they eat RAM whether claimed or not).
- Pool empty → cold boot (not fail, not wait).
- DELETE/reap → KILL, never reuse. Reused chrome leaks cookies/localStorage/IndexedDB/cache/service workers → Agent B in Agent A's bank. Fresh = isolation for free.
- Clocks (idle/max-life) start at claim, not boot. Refill after claim + after any exit.
