# dsh-task-heartbeat

[![npm version](https://img.shields.io/npm/v/dsh-task-heartbeat)](https://www.npmjs.com/package/dsh-task-heartbeat) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> Author: jetpan (npm) ↔ jerentpan-lab (GitHub) | [npm package](https://www.npmjs.com/package/dsh-task-heartbeat) | [GitHub repo](https://github.com/jerentpan-lab/dsh-task-heartbeat) | install from GitHub: `dsh plugin --profile web add github:jerentpan-lab/dsh-task-heartbeat`


Watch task **progress**, not process liveness. Register long tasks, beat after each
meaningful step, and get a stalled list when the last beat is older than `ttl_s`.

Motivation: an agent can be alive and still stuck. A task that has not produced a beat
for 15 minutes is stalled even if the process is running.

## Install

```bash
dsh plugin --profile web add dsh-task-heartbeat
```

Run a check from the host every 5 minutes (examples in the README of the repo):

```bash
python3 - <<'PY'   # or any scheduler
# call task_check via your DSH session / CLI
PY
```

## Tools

- `task_register { taskId, owner, expect?, ttlS? }`
- `task_beat { taskId, note? }`
- `task_check` — list stalled tasks
- `task_list`
- `task_done { taskId }`

## Config (0.2.0)

```json
{ "stateFile": "~/.dsh/task-heartbeat.json", "defaultTtlS": 900 }
```

- `stateFile`: heartbeat state file (default `~/.dsh/task-heartbeat.json`, env `DSH_TASK_HEARTBEAT_FILE`).
- `defaultTtlS`: default stall threshold for `task_register` when `ttlS` is omitted.
- Unknown keys / invalid values throw a readable `ConfigError`.
- Example: `config.example.json`. Run `npm run verify` for tests + pack checks.

## Demo

```bash
node examples/demo.mjs
```

## Bench

`node bench/bench.mjs` writes `bench/RESULTS.md`. Each beat is a durable fsync'ed write (~97ms/beat on this host); use `task_beat` at your task's natural cadence.

## Troubleshooting (error table)

| Symptom | Cause | Fix |
|---|---|---|
| `ConfigError ... unknown key` | typo/unsupported config key | use `config.example.json` |
| `ConfigError ... defaultTtlS` | not a finite number > 0 | use seconds, e.g. 900 |
| `taskId must match ...` | illegal id characters | `[A-Za-z0-9_-]{1,64}` only |
| `register: owner is required` | missing owner | pass `owner` |
| `register: task ... already running` | duplicate live task | use `force:true` to restart |
| `ttlS must be a positive finite number` | bad ttl | pass seconds > 0 |
| `could not acquire lock ...` | another process holds the lock >30s | retry; check for stale lock file |
| `state corrupt` warning | JSON unreadable | corrupt file quarantined (`*.corrupt-*`), tools keep working |
| `clockRollbackMs` warning | wall clock went backwards | monotonic clamp keeps ages non-negative |

## Verify

```bash
npm run verify
```

## License

MIT
