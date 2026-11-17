# tinfoil

A browser API for AI agents, built from zero: an agent makes HTTP calls, and tinfoil drives a real headless Chromium for it over the Chrome DevTools Protocol (CDP).

## Run

```bash
npm install
npm start            # http://localhost:4000
npm run dev          # restart on file change
npm run typecheck
```

Needs Node 24+ (runs TypeScript directly, no build step) and a Chromium binary. Point `CHROME` at one if the default Playwright cache path doesn't exist.

## API

| Route | What it does |
|---|---|
| `GET /fetch?url=` | One-shot: throwaway browser, returns the rendered HTML |
| `POST /sessions` | Start a browser. `201 {id}`, or `429` when the box is full |
| `GET /sessions` | List live session ids |
| `DELETE /sessions/:id` | Kill a session |
| `POST /sessions/:id/goto?url=` | Navigate, wait for load, return HTML |
| `GET /sessions/:id/content` | Current HTML |
| `POST /sessions/:id/click` | `{selector}` or `{x,y}`. Real trusted click; `409` if hidden or covered |
| `POST /sessions/:id/type` | `{text, selector?}` |
| `POST /sessions/:id/press` | `{key}`: Enter, Tab, Backspace, Escape, arrow keys |
| `POST /sessions/:id/eval` | Body is JS; returns `{value}` |

`click` and `press Enter` return `navigated: true|false` and wait for the page load when one happens.

## Config (env vars)

| Var | Default | |
|---|---|---|
| `PORT` | 4000 | |
| `MAX_SESSIONS` | 20 | Chromes per box; beyond this → 429 |
| `IDLE_MS` | 300000 | Kill sessions with no requests for this long |
| `MAX_LIFE_MS` | 1800000 | Hard lifetime ceiling per session |
| `CHROME` | Playwright headless shell | Path to the Chromium binary |

## Layout

```
src/
  main.ts      entry: start server + janitor, kill browsers on exit
  config.ts    every knob, env-overridable
  cdp.ts       CDP client over a pipe (commands by id, events by name)
  sessions.ts  spawn chrome per session, admission cap, idle/max-life janitor
  input.ts     locate/click/type/press + settle (wait for navigation)
  http.ts      routes
experiments/   throwaway learning scripts
journey/       build log: decisions, design, versions
```
