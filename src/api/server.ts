// HTTP layer: match route → run handler → write reply. all errors become {error} JSON here, nowhere else.
import { createServer } from "node:http";
import { createRouter, readBody, parseJson } from "./router.ts";
import { HttpError } from "./errors.ts";
import { sessionRoutes } from "./routes/sessions.ts";
import { miscRoutes } from "./routes/misc.ts";
import { log } from "../log.ts";

const router = createRouter();
sessionRoutes(router);
miscRoutes(router);

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const send = (status: number, body: string, type: string, headers: Record<string, string> = {}) =>
    res.writeHead(status, { "content-type": type, ...headers }).end(body);
  const sendJson = (status: number, o: unknown, headers?: Record<string, string>) => send(status, JSON.stringify(o) + "\n", "application/json", headers);

  try {
    const m = router.match(req.method ?? "GET", url.pathname);
    if (m === "method") throw new HttpError(405, `${req.method} not allowed on ${url.pathname}`);
    if (!m) throw new HttpError(404, `no route ${req.method} ${url.pathname}`);

    let bodyP: Promise<string> | undefined; // body stream can only be read once → memoize
    const text = () => (bodyP ??= readBody(req));
    const reply = await m.handler({
      req, res, params: m.params, query: url.searchParams, text,
      json: async () => parseJson(await text()),
    });

    const status = reply.status ?? 200;
    if (reply.text !== undefined) return send(status, reply.text, "text/plain; charset=utf-8", reply.headers);
    return sendJson(status, reply.json ?? {}, reply.headers);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(err.status, { error: err.message }, err.headers);
    log.error("browser.error", { path: url.pathname, err: (err as Error).message });
    return sendJson(502, { error: `browser error: ${(err as Error).message}` });
  }
});
