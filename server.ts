// tinfoil v0: "just curl it"
import { createServer } from "node:http";

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
    const upstream = await fetch(target);
    const html = await upstream.text();
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(html);
  } catch (err) {
    res.writeHead(502).end(`fetch failed: ${(err as Error).message}\n`);
  }
});

server.listen(PORT, () => console.log(`tinfoil v0 on http://localhost:${PORT}`));
