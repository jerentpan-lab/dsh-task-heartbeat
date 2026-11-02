import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../src/index.js';

test('apply registers tools and lifecycle works', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-hb-apply-'));
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, { stateFile: join(dir, 'tasks.json') });
  assert.deepEqual(tools.map((t) => t.name).sort(), ['task_beat', 'task_check', 'task_done', 'task_list', 'task_register']);
  await tools.find((t) => t.name === 'task_register').execute({ taskId: 'a', owner: 'dsh', ttlS: 60 });
  const r = await tools.find((t) => t.name === 'task_check').execute({});
  assert.equal(r.count, 0);
});
