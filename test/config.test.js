import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, validateConfig } from '../src/config.js';
import { apply } from '../src/index.js';

test('G1: example config validates and unknown key is readable error', async () => {
  const example = JSON.parse(await readFile(new URL('../config.example.json', import.meta.url), 'utf8'));
  assert.equal(validateConfig(example).config.defaultTtlS, 900);
  assert.throws(() => validateConfig({ nope: 1 }), (e) => e instanceof ConfigError && /unknown key "nope"/.test(e.message));
  assert.throws(() => validateConfig({ stateFile: '' }), /stateFile: must be a non-empty string or null/);
  assert.throws(() => validateConfig({ defaultTtlS: 0 }), /defaultTtlS: must be a finite number > 0/);
});

test('G1: defaultTtlS applies when register omits ttlS', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-hb-cfg-'));
  const tools = [];
  const ctx = { tools: { register: (t) => tools.push(t) } };
  apply(ctx, { stateFile: join(dir, 'tasks.json'), defaultTtlS: 120 });
  await tools.find((t) => t.name === 'task_register').execute({ taskId: 'cfg', owner: 'dsh' });
  const list = await tools.find((t) => t.name === 'task_list').execute({});
  assert.equal(list.cfg.ttlS, 120);
});
