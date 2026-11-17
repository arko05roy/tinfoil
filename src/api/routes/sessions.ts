// /sessions/*: create, list, kill, and drive a browser.
import { createSession, getSession, killSession, listSessions, FullError } from "../../sessions/manager.ts";
import { html, locate, click, type, press, settle, KEYS } from "../../browser/actions.ts";
import { HttpError, badRequest, conflict, notFound } from "../errors.ts";
import type { Ctx, createRouter } from "../router.ts";
import { log } from "../../log.ts";

// look up the session and mark it alive (resets the idle clock)
function use(ctx: Ctx) {
  const s = getSession(ctx.params.id);
  if (!s) throw notFound("no such session");
  s.lastUsed = Date.now();
  return s;
}

export function sessionRoutes(r: ReturnType<typeof createRouter>) {
  r.post("/sessions", async () => {
    const t0 = Date.now();
    try {
      const s = await createSession();
      log.info("session.created", { id: s.id.slice(0, 8), ms: Date.now() - t0, pid: s.proc.pid });
      return { status: 201, json: { id: s.id } };
    } catch (err) {
      if (err instanceof FullError) throw new HttpError(429, err.message, { "retry-after": "30" });
      throw err;
    }
  });

  r.get("/sessions", async () => ({ json: listSessions() }));

  r.delete("/sessions/:id", async (ctx) => {
    const s = use(ctx);
    killSession(s);
    return { json: { deleted: s.id } };
  });

  r.post("/sessions/:id/goto", async (ctx) => {
    const s = use(ctx);
    const url = ctx.query.get("url") ?? (await ctx.json()).url;
    if (!url) throw badRequest("send ?url= or {url}");
    // start listening BEFORE navigating, or we might miss the event
    await Promise.all([s.waitFor("Page.loadEventFired"), s.send("Page.navigate", { url })]);
    return { text: await html(s) };
  });

  r.get("/sessions/:id/content", async (ctx) => ({ text: await html(use(ctx)) }));

  // {selector} → find a clickable spot like a human would, or {x,y} → raw coordinates
  async function target(ctx: Ctx, b: any) {
    const s = use(ctx);
    if (b.selector) {
      const found = await locate(s, b.selector);
      if ("error" in found) throw conflict(`${b.selector}: ${found.error}`);
      return { s, at: found };
    }
    if (typeof b.x === "number" && typeof b.y === "number") return { s, at: { x: b.x, y: b.y } };
    return { s, at: null };
  }

  r.post("/sessions/:id/click", async (ctx) => {
    const { s, at } = await target(ctx, await ctx.json());
    if (!at) throw badRequest("send {selector} or {x, y}");
    return { json: await settle(s, async () => { await click(s, at.x, at.y); return { clicked: at }; }) };
  });

  r.post("/sessions/:id/type", async (ctx) => {
    const b = await ctx.json();
    if (typeof b.text !== "string") throw badRequest("send {text, selector?}");
    const { s, at } = await target(ctx, b);
    if (at) await click(s, at.x, at.y); // focus the box first, like a human would
    await type(s, b.text);
    return { json: { typed: b.text.length } };
  });

  r.post("/sessions/:id/press", async (ctx) => {
    const s = use(ctx);
    const { key } = await ctx.json();
    if (!KEYS[key]) throw badRequest(`key must be one of: ${Object.keys(KEYS).join(", ")}`);
    if (!KEYS[key].nav) { await press(s, key); return { json: { pressed: key, navigated: false } }; } // can't navigate → no 500ms tax
    return { json: await settle(s, async () => { await press(s, key); return { pressed: key }; }) };
  });

  r.post("/sessions/:id/eval", async (ctx) => {
    const s = use(ctx);
    const r = await s.send("Runtime.evaluate", { expression: await ctx.text(), returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw badRequest(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return { json: { value: r.result.value } };
  });
}
