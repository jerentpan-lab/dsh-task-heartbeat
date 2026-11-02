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

## Config

```yaml
- id: dsh-task-heartbeat
  name: dsh-task-heartbeat
  config:
    stateFile: "/absolute/path/tasks.json"
```

## License

MIT
