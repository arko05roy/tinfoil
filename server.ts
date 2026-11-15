// tinfoil v3: a live browser per session, driven over CDP
import { createServer, type IncomingMessage } from "node:http";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const PORT = Number(process.env.PORT ?? 4000);
const PROFILES = join(import.meta.dirname, "profiles");
rmSync(PROFILES, { recursive: true, force: true }); // sessions live in memory, so anything on disk at boot is garbage
let nextDebugPort = 9300;

// ---------- CDP client: commands matched by id, events matched by name ----------
async function connectCDP(wsUrl: string) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.addEventListener("open", ok); ws.addEventListener("error", fail); });

  let nextId = 1;
  const pending = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>(); // commands waiting for a reply
  const waiters: { event: string; ok: (v: any) => void }[] = [];                          // code waiting for an event

  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id) {                                   // reply to one of our commands
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p?.fail(new Error(msg.error.message)); else p?.ok(msg.result);
    } else {                                        // event the browser yelled on its own
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].event === msg.method) { waiters[i].ok(msg.params); waiters.splice(i, 1); }
      }
    }
  });

  const send = (method: string, params: object = {}) =>
    new Promise<any>((ok, fail) => {
      const id = nextId++;
      pending.set(id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const waitFor = (event: string, ms = 30_000) =>
    new Promise<any>((ok, fail) => {
      const w = { event, ok };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) { waiters.splice(i, 1); fail(new Error(`timed out waiting for ${event}`)); }
      }, ms);
    });

  return { send, waitFor };
}

// ---------- sessions: in memory, die with the server ----------
type Session = { id: string; proc: ChildProcess; profile: string } & Awaited<ReturnType<typeof connectCDP>>;
const sessions = new Map<string, Session>();

async function createSession(): Promise<Session> {
  const id = randomUUID();
  const port = nextDebugPort++;
  const profile = join(PROFILES, id);
  const proc = spawn(CHROME, ["--headless", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

  try {
    // poll the "lobby" until the browser is up (max ~5s)
    let tabs: any[] | undefined;
    for (let i = 0; i < 50 && !tabs; i++) {
      try { tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(100); }
    }
    if (!tabs) throw new Error("browser never opened its debug port");

    const cdp = await connectCDP(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    const s: Session = { id, proc, profile, ...cdp };
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

server.listen(PORT, () => console.log(`tinfoil v3 on http://localhost:${PORT}`));
