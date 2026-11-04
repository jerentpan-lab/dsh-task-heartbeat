# Changelog

## 0.2.0 (2026-11-04)
- G1: config validation (`src/config.js`) with readable `ConfigError`; `config.example.json`.
- G2: `npm run verify` = tests + `npm pack` content/size/safety checks; GitHub Actions workflow.
- B1: monotonic clock clamp (wall-clock rollback safe; persisted `_lastSeenMs`).
- B2: stall SLA score 0-100 + `stall_grade` (watch/warn/high/critical).
- B3: 50-worker concurrency test (no deadlock, beats preserved).
- B4: `examples/webhook-alert.mjs` for your own notification hook.
- G3: `bench/bench.mjs` + `bench/RESULTS.md` (P50/P95).
- G4: README error table (每失败路径一句话诊断).
- G5: runnable `examples/demo.mjs`.

## 0.1.1 (2026-11-02)
- Hardened after three-party audit (Hermes/Buddy/DSH). See ../AUDIT-2026-11-02.md.
- Fail-safe routing, literal-only user rules, negation handling, word boundaries.
- Concurrency locks, corrupt-state quarantine, UTC strict timestamps, ttl validation.
- Append-only event log, pointer whitelist, reproducible sampling seed.

## 0.1.0
- Initial MVP.
