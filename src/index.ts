// tinfoil: a browser API for AI agents. entry point: wire it up, clean up on exit.
import { PORT } from "./config.ts";
import { server } from "./api/server.ts";
import { killAll, refill, startJanitor } from "./sessions/manager.ts";
import { log } from "./log.ts";
import pkg from "../package.json" with { type: "json" };

process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0)); // exit → runs killAll

startJanitor();
refill(); // warm the pool before the first customer shows up
server.listen(PORT, () => log.info("tinfoil.up", { version: pkg.version, url: `http://localhost:${PORT}` }));
