# Changelog

## 0.6.0 (2026-11-17)
- Product layout: `src/{api,sessions,browser,cdp}`, tiny router, typed `HttpError`, structured logs.
- `GET /health` (capacity: active / warm / booting).
- All errors are JSON `{error}`. `405` on wrong method. Invalid JSON → `400` instead of `502`.
- `goto` also accepts `{"url"}` in the body.
- Fix: a deleted or reaped session is unlisted immediately (no requests into a dying browser).
- Fix: when a browser dies, in-flight CDP calls fail at once instead of hanging up to 30s.
- `npm test`: end-to-end suite. `.env` support via `.env.example`.

## 0.5.1
- Warm pool (`POOL_SIZE`, default 5), counted inside the cap. Used browsers are killed, never reused.

## 0.5.0
- Admission cap (`MAX_SESSIONS`, `429` + `retry-after`), idle + max-lifetime janitor.
