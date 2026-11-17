// one-shot fetch + health check
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CHROME, MAX_SESSIONS } from "../../config.ts";
import { stats } from "../../sessions/manager.ts";
import { badRequest } from "../errors.ts";
import type { createRouter } from "../router.ts";

const run = promisify(execFile);
const started = Date.now();

export function miscRoutes(r: ReturnType<typeof createRouter>) {
  // throwaway browser, no session: v1 of the whole product
  r.get("/fetch", async (ctx) => {
    const url = ctx.query.get("url");
    if (!url) throw badRequest("missing ?url=");
    const { stdout } = await run(CHROME, ["--headless", "--dump-dom", url], { maxBuffer: 50 * 1024 * 1024, timeout: 60_000 });
    return { text: stdout };
  });

  // for load balancers + humans: is it up, how full is it
  r.get("/health", async () => ({ json: { ok: true, uptimeS: Math.round((Date.now() - started) / 1000), max: MAX_SESSIONS, ...stats() } }));
}
