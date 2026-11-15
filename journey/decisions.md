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
