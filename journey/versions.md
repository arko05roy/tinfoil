# versions
- v0 "just curl it": fetch(url).text(). Works on static/SSR pages. Dies on client-side-rendered pages (gets the skeleton + scripts, no content).

- v1   spawn chrome --dump-dom per request (15s)
- v1.1 chrome-headless-shell (~2.5s)
- v2   POST /sessions + profile folder per session (persistent cookies only)
- v3   live browser per session over CDP WebSocket (port); in-memory Map
- v3.1 CDP over pipe; attach to tab target, route by sessionId; no orphans on kill -9
- v4   trusted click/type via Input.dispatchMouseEvent / dispatchKeyEvent
- v4.1 visibility + hit-test before click; 1280x800 window
