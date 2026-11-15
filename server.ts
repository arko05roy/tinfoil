// tinfoil v2: sessions = a profile folder per agent
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const run = promisify(execFile);
const CHROME = process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

const PORT = Number(process.env.PORT ?? 4000);
const PROFILES = join(import.meta.dirname, "profiles");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (req.method === "POST" && reqUrl.pathname === "/sessions") {
    const id = randomUUID();
    mkdirSync(join(PROFILES, id), { recursive: true });
    res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ id }) + "\n");
    return;
  }

  if (reqUrl.pathname !== "/fetch") {
    res.writeHead(404).end("try POST /sessions, GET /fetch?url=...&session=...\n");
    return;
  }

  const session = reqUrl.searchParams.get("session");
  if (session && (!UUID.test(session) || !existsSync(join(PROFILES, session)))) {
    res.writeHead(404).end("no such session\n");
    return;
  }

  const target = reqUrl.searchParams.get("url");
  if (!target) {
    res.writeHead(400).end("missing ?url=\n");
    return;
  }

  try {
    const t0 = Date.now();
    const args = ["--headless", "--dump-dom", target];
    if (session) args.unshift(`--user-data-dir=${join(PROFILES, session)}`);
    const { stdout: html } = await run(CHROME, args, { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 });
    console.log(`rendered ${target}${session ? ` [${session.slice(0, 8)}]` : ""} in ${Date.now() - t0}ms`);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(html);
  } catch (err) {
    res.writeHead(502).end(`chrome failed: ${(err as Error).message}\n`);
  }
});

server.listen(PORT, () => console.log(`tinfoil v2 on http://localhost:${PORT}`));
