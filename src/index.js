/**
 * dsh-task-heartbeat — progress heartbeats and stall detection for long tasks.
 * Config: { stateFile?: string }
 * Audit-hardened 2026-11-02 (three-party review).
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_TTL_S, TaskStore } from './core.js';
import { validateConfig } from './config.js';

export const name = 'dsh-task-heartbeat';
export const inject = ['tools'];

let defineTool;
let degraded = false;
try {
  ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
} catch (err) {
  if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
  console.warn('[dsh-task-heartbeat] @deepseek-ai/dsh-tools not found, running unvalidated (tests only).');
  defineTool = (options) => ({ ...options });
  degraded = true;
}

export function apply(ctx, rawConfig = {}) {
  const { config } = validateConfig(rawConfig);
  const stateFile =
    config.stateFile || process.env.DSH_TASK_HEARTBEAT_FILE || join(homedir(), '.dsh', 'task-heartbeat.json');
  const store = new TaskStore(stateFile);

  const out = {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };

  ctx.tools.register(
    defineTool({
      name: 'task_register',
      description:
        'Register a long-running task for stall detection. Refuses to overwrite a running task unless force:true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id: [A-Za-z0-9_-]{1,64}.' },
        owner: { type: 'string', required: true, description: 'Task owner.' },
        expect: { type: 'string', description: 'What outcome counts as progress.' },
        ttlS: { type: 'number', description: `Stall threshold in seconds (positive, default ${DEFAULT_TTL_S}).` },
        force: { type: 'boolean', description: 'Restart an existing running task.' },
      },
      output: out,
      async execute(args = {}) {
        return store.register({ ttlS: config.defaultTtlS, ...args });
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'task_beat',
      description: 'Record progress for a task. Rejected if the task is already done unless reopen:true.',
      parameters: {
        taskId: { type: 'string', required: true, description: 'Task id.' },
        note: { type: 'string', description: 'Progress note.' },
        reopen: { type: 'boolean', description: 'Reopen a done task.' },
      },
      output: out,
      async execute(args = {}) {
        return store.beat(args.taskId, args.note, { reopen: args.reopen === true });
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'task_check',
      description:
        'List stalled tasks (lastBeat older than ttl). Includes stalled_s (age) and stalledFor_s (since first detection).',
      parameters: {},
      output: out,
      async execute() {
        const { stalled, skew } = await store.check();
        return { stalled, count: stalled.length, clock_skew: skew, warnings: store.warnings };
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'task_list',
      description: 'List all tasks and their last beats.',
      parameters: {},
      output: out,
      async execute() {
        return store.list();
      },
    })
  );

  ctx.tools.register(
    defineTool({
      name: 'task_done',
      description: 'Mark a task done (idempotent).',
      parameters: { taskId: { type: 'string', required: true, description: 'Task id.' } },
      output: out,
      async execute(args = {}) {
        return store.done(args.taskId);
      },
    })
  );

  return { store, stateFile, degraded, config };
}
