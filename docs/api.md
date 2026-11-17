# tinfoil HTTP API

Base URL: `http://localhost:4000`. Errors are always JSON: `{"error": "..."}`.

## Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | OK / session created |
| 400 | Bad input (missing field, invalid JSON, unknown key) |
| 404 | No such route or session (sessions vanish when reaped or deleted) |
| 405 | Route exists, wrong method |
| 409 | Element exists but a human couldn't click it (hidden, 0×0, covered) |
| 429 | Box full. Honor `retry-after` (seconds) |
| 502 | The browser itself failed (crashed, navigation error, timeout) |

## Service

### `GET /health`
`{ ok, uptimeS, max, active, warm, booting }`

### `GET /fetch?url=`
One-shot: boots a throwaway browser and returns the rendered HTML as `text/plain`.

## Sessions

A session is one fresh Chromium, never shared or reused. It's reaped after `IDLE_MS` without requests, or after `MAX_LIFE_MS` total.

### `POST /sessions` → `201 {id}` · `429` when full
### `GET /sessions` → `[id, ...]`
### `DELETE /sessions/:id` → `{deleted}`

### `POST /sessions/:id/goto`
`?url=` or `{"url": "..."}`. Waits for the load event and returns the HTML.

### `GET /sessions/:id/content`
Current HTML.

### `POST /sessions/:id/click`
`{"selector": "a.next"}` or `{"x": 100, "y": 200}` → `{clicked: {x, y}, navigated}`.
This is trusted, hardware-level input. A selector must match a visible element that isn't covered, or you get a `409` saying why.
If the click starts a page load within 500ms, the response waits for that load.

### `POST /sessions/:id/type`
`{"text": "hello", "selector"?: "input[name=q]"}` → `{typed: n}`. With a selector, it clicks the element first to focus it.

### `POST /sessions/:id/press`
`{"key": "Enter"}` → `{pressed, navigated}`. Keys: Enter, Tab, Backspace, Escape, ArrowLeft/Up/Right/Down.

### `POST /sessions/:id/eval`
The raw body is a JS expression (promises are awaited) → `{value}`. A thrown error gives a `400` with the message.
