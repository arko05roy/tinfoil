// tinfoil v1: "just spawn chrome"
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const CHROME = process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const PORT = Number(process.env.PORT ?? 4000);

const server = createServer(async (req, res) => {
  const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (reqUrl.pathname !== "/fetch") {
    res.writeHead(404).end("try GET /fetch?url=...\n");
    return;
  }

  const target = reqUrl.searchParams.get("url");
  if (!target) {
    res.writeHead(400).end("missing ?url=\n");
    return;
  }

  try {
    const t0 = Date.now();
    const { stdout: html } = await run(CHROME, ["--headless", "--dump-dom", target], { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 });
    console.log(`rendered ${target} in ${Date.now() - t0}ms`);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(html);
  } catch (err) {
    res.writeHead(502).end(`chrome failed: ${(err as Error).message}\n`);
  }
});

server.listen(PORT, () => console.log(`tinfoil v1 on http://localhost:${PORT}`));
