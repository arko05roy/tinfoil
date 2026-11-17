// session lifecycle: boot chromes, keep a warm pool, admit/refuse, reap. one chrome per session, never reused.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { connectCDP } from "../cdp/client.ts";
import { log } from "../log.ts";
import { CHROME, IDLE_MS, MAX_LIFE_MS, MAX_SESSIONS, POOL_SIZE, PROFILES } from "../config.ts";

export type Session = {
  id: string; proc: ChildProcess; profile: string;
  createdAt: number; lastUsed: number;
  send: (method: string, params?: object) => Promise<any>;   // pre-stamped with the tab's sessionId
  waitFor: (event: string, ms?: number) => Promise<any>;
};

const sessions = new Map<string, Session>();        // claimed by an agent
const pool: Session[] = [];                          // booted, unclaimed, never touched by anyone
let starting = 0; // chromes mid-boot count against the cap too, or 50 parallel POSTs all sneak past
const total = () => sessions.size + pool.length + starting; // every chrome on this box

rmSync(PROFILES, { recursive: true, force: true }); // sessions live in memory, so anything on disk at boot is garbage

export class FullError extends Error {}

export const getSession = (id: string) => sessions.get(id);
// unlist first so no new request can reach it, then kill. exit handler does the disk cleanup.
export function killSession(s: Session) { sessions.delete(s.id); s.proc.kill(); }
export const listSessions = () => [...sessions.keys()];
export const stats = () => ({ active: sessions.size, warm: pool.length, booting: starting });

// warm chrome if we have one (~0ms), else cold boot. either way it's fresh: chromes are never reused.
export async function createSession(): Promise<Session> {
  let s = pool.shift();
  if (!s) {
    if (total() >= MAX_SESSIONS) throw new FullError(`full: ${MAX_SESSIONS} sessions max, delete one or retry later`);
    s = await boot();
  }
  s.createdAt = s.lastUsed = Date.now(); // clocks start at claim, not at boot
  sessions.set(s.id, s);
  refill();
  return s;
}

// top the pool back up to POOL_SIZE, without ever pushing the box past MAX_SESSIONS
export function refill() {
  while (pool.length + starting < POOL_SIZE && total() < MAX_SESSIONS) {
    boot().then((s) => pool.push(s), (e) => log.error("pool.boot_failed", { err: e.message }));
  }
}

async function boot(): Promise<Session> {
  starting++;
  try { return await spawnSession(); } finally { starting--; }
}

async function spawnSession(): Promise<Session> {
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
    const s: Session = { id, proc, profile, send, waitFor, createdAt: Date.now(), lastUsed: Date.now() };
    proc.on("exit", () => {
      sessions.delete(id);
      const i = pool.indexOf(s); if (i >= 0) pool.splice(i, 1); // a warm one can crash too
      rmSync(profile, { recursive: true, force: true });
      refill();                                                  // freed a slot → maybe warm another
    });
    return s;
  } catch (err) {
    proc.kill();
    throw err;
  }
}

// janitor: every 5s, kill anything idle too long or alive too long. kill → exit handler cleans up.
export function startJanitor() {
  setInterval(() => {
    const now = Date.now();
    for (const s of sessions.values()) {
      const why = now - s.lastUsed > IDLE_MS ? "idle" : now - s.createdAt > MAX_LIFE_MS ? "max-life" : null;
      if (why) { log.info("session.reaped", { id: s.id.slice(0, 8), why }); killSession(s); }
    }
  }, 5_000).unref();
}

// browsers die with the server
export function killAll() {
  for (const s of [...sessions.values(), ...pool]) { s.proc.kill(); rmSync(s.profile, { recursive: true, force: true }); }
}
