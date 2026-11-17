// tinfoil: a browser API for AI agents. entry point: wire it up, clean up on exit.
import { PORT } from "./config.ts";
import { server } from "./http.ts";
import { killAll, refill, startJanitor } from "./sessions.ts";

process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => process.exit(0)); // exit → runs killAll

startJanitor();
refill(); // warm the pool before the first customer shows up
server.listen(PORT, () => console.log(`tinfoil v5 on http://localhost:${PORT}`));
