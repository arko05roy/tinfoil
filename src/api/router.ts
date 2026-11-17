// tiny router: "POST /sessions/:id/click" → handler(ctx). no framework, ~40 lines.
import type { IncomingMessage, ServerResponse } from "node:http";
import { badRequest } from "./errors.ts";

export type Ctx = {
  req: IncomingMessage; res: ServerResponse;
  params: Record<string, string>; query: URLSearchParams;
  text: () => Promise<string>;
  json: () => Promise<any>;
};
export type Reply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> };
export type Handler = (ctx: Ctx) => Promise<Reply>;
type Route = { method: string; parts: string[]; handler: Handler };

export function createRouter() {
  const routes: Route[] = [];
  const add = (method: string, path: string, handler: Handler) => { routes.push({ method, parts: path.split("/").filter(Boolean), handler }); };

  // returns the handler + params, "method" if the path exists under another verb, or null
  const match = (method: string, path: string) => {
    const segs = path.split("/").filter(Boolean);
    let wrongMethod = false;
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      if (!r.parts.every((p, i) => p.startsWith(":") ? (params[p.slice(1)] = decodeURIComponent(segs[i])) : p === segs[i])) continue;
      if (r.method !== method) { wrongMethod = true; continue; }
      return { handler: r.handler, params };
    }
    return wrongMethod ? "method" as const : null;
  };

  return { get: (p: string, h: Handler) => add("GET", p, h), post: (p: string, h: Handler) => add("POST", p, h), delete: (p: string, h: Handler) => add("DELETE", p, h), match };
}

export async function readBody(req: IncomingMessage) { let b = ""; for await (const c of req) b += c; return b; }
export function parseJson(raw: string) {
  try { return raw ? JSON.parse(raw) : {}; } catch { throw badRequest("body must be valid JSON"); }
}
