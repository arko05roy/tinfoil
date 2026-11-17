// HTTP API: thin routing layer. parses requests, calls sessions/input, shapes responses.
import { createServer, type IncomingMessage } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CHROME } from "./config.ts";
import { sessions, createSession, FullError } from "./sessions.ts";
import { html, locate, click, type, press, settle, KEYS } from "./input.ts";

const run = promisify(execFile);
const body = async (req: IncomingMessage) => { let b = ""; for await (const c of req) b += c; return b; };

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const [root, id, action] = url.pathname.split("/").filter(Boolean);
  const text = (code: number, s: string) => res.writeHead(code, { "content-type": "text/plain; charset=utf-8" }).end(s);
  const json = (code: number, o: unknown) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(o) + "\n");

  try {
    // one-shot mode (v1): throwaway browser, no session
    if (root === "fetch" && req.method === "GET") {
      const target = url.searchParams.get("url");
      if (!target) return text(400, "missing ?url=\n");
      const { stdout } = await run(CHROME, ["--headless", "--dump-dom", target], { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 });
      return text(200, stdout);
    }

    if (root !== "sessions") return text(404, "try POST /sessions\n");

    if (!id && req.method === "POST") {
      const t0 = Date.now();
      try {
        const s = await createSession();
        console.log(`session ${s.id.slice(0, 8)} up in ${Date.now() - t0}ms (pid ${s.proc.pid})`);
        return json(201, { id: s.id });
      } catch (err) {
        if (!(err instanceof FullError)) throw err;
        res.setHeader("retry-after", "30");
        return json(429, { error: err.message });
      }
    }
    if (!id && req.method === "GET") return json(200, [...sessions.keys()]);

    const s = sessions.get(id);
    if (!s) return text(404, "no such session\n");
    s.lastUsed = Date.now(); // any touch = still alive

    if (!action && req.method === "DELETE") { s.proc.kill(); return json(200, { deleted: id }); }

    if (action === "goto" && req.method === "POST") {
      const target = url.searchParams.get("url");
      if (!target) return text(400, "missing ?url=\n");
      // start listening BEFORE navigating, or we might miss the event
      await Promise.all([s.waitFor("Page.loadEventFired"), s.send("Page.navigate", { url: target })]);
      return text(200, await html(s));
    }

    if (action === "content" && req.method === "GET") return text(200, await html(s));

    if ((action === "click" || action === "type") && req.method === "POST") {
      const b = JSON.parse((await body(req)) || "{}");
      let at = typeof b.x === "number" && typeof b.y === "number" ? { x: b.x, y: b.y } : null;
      if (b.selector) {
        const found = await locate(s, b.selector);
        if ("error" in found) return json(409, { error: `${b.selector}: ${found.error}` });
        at = found;
      }
      if (action === "click") {
        if (!at) return json(400, { error: "send {selector} or {x, y}" });
        const at2 = at;
        return json(200, await settle(s, async () => { await click(s, at2.x, at2.y); return { clicked: at2 }; }));
      }
      if (typeof b.text !== "string") return json(400, { error: "send {text, selector?}" });
      if (at) await click(s, at.x, at.y);           // focus the box first, like a human would
      await type(s, b.text);
      return json(200, { typed: b.text.length });
    }

    if (action === "press" && req.method === "POST") {
      const b = JSON.parse((await body(req)) || "{}");
      if (!KEYS[b.key]) return json(400, { error: `key must be one of: ${Object.keys(KEYS).join(", ")}` });
      if (!KEYS[b.key].nav) { await press(s, b.key); return json(200, { pressed: b.key, navigated: false }); } // can't navigate → no 500ms tax
      return json(200, await settle(s, async () => { await press(s, b.key); return { pressed: b.key }; }));
    }

    if (action === "eval" && req.method === "POST") {
      const r = await s.send("Runtime.evaluate", { expression: await body(req), returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return json(400, { error: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text });
      return json(200, { value: r.result.value });
    }

    return text(404, "unknown route\n");
  } catch (err) {
    return text(502, `browser error: ${(err as Error).message}\n`);
  }
});
