# tinfoil

**A browser API for AI agents.** Your agent makes plain HTTP calls; tinfoil runs real, isolated headless Chromium for it: trusted clicks, keyboard, auto-waiting on navigation, capped and self-cleaning sessions, and a warm pool so sessions start in milliseconds.

```bash
curl -XPOST localhost:4000/sessions                          # {"id":"…"}  (~5ms from warm pool)
curl -XPOST "localhost:4000/sessions/$ID/goto?url=https://example.com"
curl -XPOST localhost:4000/sessions/$ID/click -d '{"selector":"a"}'   # {"navigated":true,…}
curl -XDELETE localhost:4000/sessions/$ID
```

## Quickstart

```bash
npm install
cp .env.example .env     # optional, every value has a default
npm start                # http://localhost:4000
npm run check            # typecheck + end-to-end tests (real chromes)
```

Needs Node 24+ (runs TypeScript directly, no build step) and a Chromium binary. Set `CHROME` if the default Playwright cache path doesn't exist.

**API reference → [docs/api.md](docs/api.md)** · Config → [.env.example](.env.example) · Changes → [CHANGELOG.md](CHANGELOG.md)

## How it works

- **One Chromium per session, never reused.** Cookies and storage can't leak between agents.
- **Driven over CDP on a pipe.** If tinfoil dies, the OS closes the pipe and every browser exits. No orphans.
- **Admission control.** `MAX_SESSIONS` counts claimed + warm + booting Chromes. Past it you get `429` + `retry-after`.
- **Janitor.** Reaps sessions after `IDLE_MS` without requests, or after `MAX_LIFE_MS` total.
- **Warm pool.** `POOL_SIZE` booted Chromes wait inside the cap, so a claim takes ~1–9ms vs ~450ms cold.

## Layout

```
src/
  index.ts              entry: start server, janitor, pool; kill browsers on exit
  config.ts             every knob (env-overridable)
  log.ts                structured one-line logs
  cdp/client.ts         CDP over a pipe: commands by id, events by name, fail-fast on close
  sessions/manager.ts   boot, warm pool, admission cap, janitor, kill
  browser/actions.ts    locate / click / type / press / settle
  api/
    server.ts           match → handle → reply; the one place errors become HTTP
    router.ts           tiny path router (:params), body parsing
    errors.ts           HttpError + helpers
    routes/sessions.ts  /sessions/*
    routes/misc.ts      /health, /fetch
test/api.test.ts        end-to-end against real Chromium
docs/                   API reference
playground/             throwaway experiments
journey/                build log: decisions, design, benchmarks
```
