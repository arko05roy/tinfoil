// tinfoil v3.1: a live browser per session, driven over CDP on a pipe (dies with us)
import { createServer, type IncomingMessage } from "node:http";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";

const run = promisify(execFile);
const CHROME = process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = Number(process.env.PORT ?? 4000);
const PROFILES = join(import.meta.dirname, "profiles");
rmSync(PROFILES, { recursive: true, force: true }); // sessions live in memory, so anything on disk at boot is garbage

// ---------- CDP client over a pipe: commands matched by id, events matched by name ----------
// a pipe is a raw byte stream, so every JSON message ends with a \0 byte
function connectCDP(toChrome: Writable, fromChrome: Readable) {
  let nextId = 1;
  const pending = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>(); // commands waiting for a reply
  const waiters: { event: string; sessionId?: string; ok: (v: any) => void }[] = [];     // code waiting for an event

  const onMessage = (msg: any) => {
    if (msg.id) {                                   // reply to one of our commands
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.fail(new Error(msg.error.message)); else p?.ok(msg.result);
    } else {                                        // event the browser yelled on its own
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.event === msg.method && w.sessionId === msg.sessionId) { w.ok(msg.params); waiters.splice(i, 1); }
      }
    }
  };

  let buf = "";
  fromChrome.on("data", (chunk) => {
    buf += chunk;
    let end;
    while ((end = buf.indexOf("\0")) >= 0) {        // may get half a message, or three at once
      onMessage(JSON.parse(buf.slice(0, end)));
      buf = buf.slice(end + 1);
    }
  });

  // sessionId = which target (tab) the message is for. none = the browser itself.
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((ok, fail) => {
      const id = nextId++;
      pending.set(id, { ok, fail });
      toChrome.write(JSON.stringify({ id, method, params, sessionId }) + "\0");
    });

  const waitFor = (event: string, sessionId?: string, ms = 30_000) =>
    new Promise<any>((ok, fail) => {
      const w = { event, sessionId, ok };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) { waiters.splice(i, 1); fail(new Error(`timed out waiting for ${event}`)); }
      }, ms);
    });

  return { send, waitFor };
}

// ---------- sessions: in memory, die with the server ----------
type Session = {
  id: string; proc: ChildProcess; profile: string;
  send: (method: string, params?: object) => Promise<any>;   // pre-stamped with the tab's sessionId
  waitFor: (event: string, ms?: number) => Promise<any>;
};
const sessions = new Map<string, Session>();

async function createSession(): Promise<Session> {
  const id = randomUUID();
  const profile = join(PROFILES, id);
  // fd 3 = commands into chrome, fd 4 = replies out. if we die, the OS closes these and chrome exits.
  const proc = spawn(CHROME, ["--headless", "--remote-debugging-pipe", "--window-size=1280,800", `--user-data-dir=${profile}`, "about:blank"], {
    stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
  });

  try {
    const browser = connectCDP(proc.stdio[3] as Writable, proc.stdio[4] as Readable);
    // the pipe talks to the browser itself. find its tab, attach, get a ticket (sessionId) for that tab.
    const { targetInfos } = await browser.send("Target.getTargets");
    const tab = targetInfos.find((t: any) => t.type === "page");
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId: tab.targetId, flatten: true });
    const send = (method: string, params: object = {}) => browser.send(method, params, sessionId);
    const waitFor = (event: string, ms?: number) => browser.waitFor(event, sessionId, ms);

    await send("Page.enable");
    const s: Session = { id, proc, profile, send, waitFor };
    sessions.set(id, s);
    proc.on("exit", () => { sessions.delete(id); rmSync(profile, { recursive: true, force: true }); });
    return s;
  } catch (err) {
    proc.kill();
    throw err;
  }
}

async function html(s: Session): Promise<string> {
  const r = await s.send("Runtime.evaluate", { expression: "document.documentElement.outerHTML", returnByValue: true });
  return r.result.value;
}

// selector -> center of the first match a human could actually click, or a reason why not.
// checks like a human would: does it exist, does it have a size, is something covering it?
async function locate(s: Session, selector: string): Promise<{ x: number; y: number } | { error: string }> {
  const r = await s.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const all = [...document.querySelectorAll(${JSON.stringify(selector)})];
      if (!all.length) return { error: "nothing matches" };
      const el = all.find((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
      if (!el) return { error: all.length + " match(es), none visible (0x0 or hidden)" };
      el.scrollIntoView({ block: "center", inline: "center" });
      const b = el.getBoundingClientRect();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      const hit = document.elementFromPoint(x, y);          // what a real click at (x,y) would land on
      if (!hit || !(el === hit || el.contains(hit))) {
        const who = hit ? hit.tagName.toLowerCase() + (hit.id ? "#" + hit.id : "") + (hit.classList[0] ? "." + hit.classList[0] : "") : "nothing";
        return { error: "covered by " + who };
      }
      return { x, y };
    })()`,
  });
  return r.result.value;
}

// a real click = move, press, release. sent as hardware-level input, so the browser marks it trusted.
async function click(s: Session, x: number, y: number) {
  await s.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

// a real keypress per character, into whatever element has focus
async function type(s: Session, text: string) {
  for (const ch of text) {
    await s.send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch });
    await s.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
  }
}

// special keys have no text, only identity: key name + physical code + legacy keycode
const KEYS: Record<string, { code: string; keyCode: number; text?: string; nav?: true }> = {
  Enter: { code: "Enter", keyCode: 13, text: "\r", nav: true },   // nav: can submit a form → worth waiting for
  Tab: { code: "Tab", keyCode: 9 },
  Backspace: { code: "Backspace", keyCode: 8 },
  Escape: { code: "Escape", keyCode: 27 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
};

async function press(s: Session, key: string) {
  const k = KEYS[key];
  const base = { key, code: k.code, windowsVirtualKeyCode: k.keyCode };
  await s.send("Input.dispatchKeyEvent", { type: "keyDown", ...base, ...(k.text && { text: k.text }) });
  await s.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

// run an action; if it kicks off a page load within 500ms, wait for that load to finish
async function settle<T>(s: Session, act: () => Promise<T>): Promise<T & { navigated: boolean }> {
  const started = s.waitFor("Page.frameStartedLoading", 500).then(() => true, () => false); // listen BEFORE acting
  const loaded = s.waitFor("Page.loadEventFired").catch(() => null);                          // catch: no nav = no load, don't crash
  const r = await act();
  const navigated = await started;
  if (navigated) await loaded;
  return { ...r, navigated };
}

// ---------- cleanup: browsers die with the server ----------
function killAll() {
  for (const s of sessions.values()) { s.proc.kill(); rmSync(s.profile, { recursive: true, force: true }); }
}
process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0)); // exit -> runs killAll

// ---------- HTTP API ----------
const body = async (req: IncomingMessage) => { let b = ""; for await (const c of req) b += c; return b; };

const server = createServer(async (req, res) => {
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
      const s = await createSession();
      console.log(`session ${s.id.slice(0, 8)} up in ${Date.now() - t0}ms (pid ${s.proc.pid})`);
      return json(201, { id: s.id });
    }
    if (!id && req.method === "GET") return json(200, [...sessions.keys()]);

    const s = sessions.get(id);
    if (!s) return text(404, "no such session\n");

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

server.listen(PORT, () => console.log(`tinfoil v3.1 on http://localhost:${PORT}`));
