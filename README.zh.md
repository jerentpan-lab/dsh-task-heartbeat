# dsh-task-heartbeat（任务进展心跳）

盯着「任务有没有推进」，而不是「进程还活着」。登记长任务，每完成一步 beat 一次；
超过 `ttl_s` 没有 beat 就当停滞。

动机：Agent 可能活着但已经卡死。进程在跑不代表有进展。

## 安装

```bash
dsh plugin --profile web add dsh-task-heartbeat
```

## 工具

- `task_register { taskId, owner, expect?, ttlS? }`：登记任务
- `task_beat { taskId, note? }`：上报进展
- `task_check`：列出停滞任务
- `task_list`：列出全部
- `task_done { taskId }`：标记完成，不再巡检

## 配置

```yaml
- id: dsh-task-heartbeat
  name: dsh-task-heartbeat
  config:
    stateFile: "/absolute/path/tasks.json"
```

## License

MIT
