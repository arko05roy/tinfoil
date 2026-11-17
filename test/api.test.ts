// end-to-end: boots the real server on a spare port with real chromes, hits it over HTTP.
// run: npm test   (needs network for example.com)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const PORT = 4999;
const base = `http://localhost:${PORT}`;
let srv: ChildProcess;

before(async () => {
  srv = spawn(process.execPath, [join(import.meta.dirname, "..", "src", "index.ts")], {
    env: { ...process.env, PORT: String(PORT), MAX_SESSIONS: "3", POOL_SIZE: "1" }, stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/health`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server never came up");
});
after(() => { srv.kill("SIGTERM"); });

const post = (path: string, body?: unknown) => fetch(base + path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

test("health reports capacity", async () => {
  const h = await (await fetch(`${base}/health`)).json();
  assert.equal(h.ok, true);
  assert.equal(h.max, 3);
});

test("unknown route → 404 JSON, wrong verb → 405", async () => {
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  assert.equal((await fetch(`${base}/sessions`, { method: "PUT" })).status, 405);
});

test("session: goto, click navigates, keys, eval, delete", async () => {
  const { id } = await (await post("/sessions")).json();
  assert.match(await (await post(`/sessions/${id}/goto`, { url: "https://example.com" })).text(), /Example Domain/);
  const c = await (await post(`/sessions/${id}/click`, { selector: "a" })).json();
  assert.equal(c.navigated, true);
  assert.deepEqual(await (await post(`/sessions/${id}/press`, { key: "ArrowDown" })).json(), { pressed: "ArrowDown", navigated: false });
  assert.equal((await post(`/sessions/${id}/press`, { key: "F13" })).status, 400);
  assert.equal((await post(`/sessions/${id}/click`, { selector: "#does-not-exist" })).status, 409);
  assert.deepEqual(await (await fetch(`${base}/sessions/${id}/eval`, { method: "POST", body: "1 + 1" })).json(), { value: 2 });
  assert.equal((await fetch(`${base}/sessions/${id}`, { method: "DELETE" })).status, 200);
  assert.equal((await fetch(`${base}/sessions/${id}/content`)).status, 404);
});

test("cap: past MAX_SESSIONS → 429 with retry-after", async () => {
  const codes: number[] = [];
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) { const r = await post("/sessions"); codes.push(r.status); if (r.ok) ids.push((await r.json()).id); }
  assert.ok(codes.includes(429), `expected a 429, got ${codes}`);
  const r = await post("/sessions");
  assert.equal(r.headers.get("retry-after"), "30");
  await Promise.all(ids.map((id) => fetch(`${base}/sessions/${id}`, { method: "DELETE" })));
});

test("bad JSON body → 400", async () => {
  const { id } = await (await post("/sessions")).json();
  const r = await fetch(`${base}/sessions/${id}/click`, { method: "POST", body: "{nope" });
  assert.equal(r.status, 400);
  await fetch(`${base}/sessions/${id}`, { method: "DELETE" });
});
