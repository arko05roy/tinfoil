
## Scale drill: 10k concurrent sessions (2026-11-17, discussion only, not built)
- 64GB box: 60GB / 0.4GB real page ≈ 150 sess/box RAM-wise. CPU (16 cores, ~10 chromes/core) bites first for ACTIVE agents. Plan ~70% → ~100/box → ~100 boxes.
- Routing: control plane (redis sessionId→box) vs data plane (box's chrome). Alt: box in id (box42-abc), stateless, can't migrate.
- Box dies: heartbeat key w/ TTL (expiry = dead, no watcher). Agents get 410 Gone (not 502 → retry loop). Reconcile redis mappings. Live session lost (RAM state); persist cookies/storage to S3 → recreate logged in.
