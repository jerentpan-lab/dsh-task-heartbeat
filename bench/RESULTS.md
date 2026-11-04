# Bench results (dsh-task-heartbeat)

> Each beat is a durable fsync'ed state write (by design). Measured 200/500 beats; 1k/10k extrapolated (p50×5 / p50×50) because fsync dominates.

| ops | p50 (ms) | p95 (ms) |
|---|---|---|
| 200 beats | 19432.51 | 19432.51 |
| 500 beats | 45967.42 | 45967.42 |

| extrapolated | p50 (ms) |
|---|---|
| 1000 beats | ~91935 |
| 10000 beats | ~919348 |
