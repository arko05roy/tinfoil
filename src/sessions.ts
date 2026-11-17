// sessions: one chrome per session, in memory, die with the server.
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { connectCDP } from "./cdp.ts";
import { CHROME, IDLE_MS, MAX_LIFE_MS, MAX_SESSIONS, PROFILES } from "./config.ts";

export type Session = {
  id: string; proc: ChildProcess; profile: string;
  createdAt: number; lastUsed: number;
  send: (method: string, params?: object) => Promise<any>;   // pre-stamped with the tab's sessionId
  waitFor: (event: string, ms?: number) => Promise<any>;
};

export const sessions = new Map<string, Session>();
let starting = 0; // chromes mid-boot count against the cap too, or 50 parallel POSTs all sneak past

rmSync(PROFILES, { recursive: true, force: true }); // sessions live in memory, so anything on disk at boot is garbage

export class FullError extends Error {}

// admission control: refuse before spawning anything
export async function createSession(): Promise<Session> {
  if (sessions.size + starting >= MAX_SESSIONS) throw new FullError(`full: ${MAX_SESSIONS} sessions max, delete one or retry later`);
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
    sessions.set(id, s);
    proc.on("exit", () => { sessions.delete(id); rmSync(profile, { recursive: true, force: true }); });
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
      if (why) { console.log(`session ${s.id.slice(0, 8)} reaped (${why})`); s.proc.kill(); }
    }
  }, 5_000).unref();
}

// browsers die with the server
export function killAll() {
  for (const s of sessions.values()) { s.proc.kill(); rmSync(s.profile, { recursive: true, force: true }); }
}
