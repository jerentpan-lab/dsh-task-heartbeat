import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/core.js';

test('B1: wall-clock rollback does not produce negative age or crash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-hb-clock-'));
  const file = join(dir, 'tasks.json');
  let t = 10_000;
  const store = new TaskStore(file, { now: () => t });
  await store.register({ taskId: 'a', owner: 'dsh', ttlS: 60 });
  t = 3_000; // clock jumps backwards
  const r = await store.check();
  assert.equal(r.stalled.length, 0);
  assert.ok(store.warnings.clockRollbackMs >= 7_000);

  // monotonic lastSeenMs is persisted: a fresh instance also clamps backwards
  const store2 = new TaskStore(file, { now: () => 1_000 });
  await store2.list();
  const r2 = await store2.check();
  assert.equal(r2.stalled.length, 0);
  assert.ok(store2.warnings.clockRollbackMs >= 9_000);
});

test('B2: stalled tasks get a 0-100 score and graded text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-hb-sla-'));
  const file = join(dir, 'tasks.json');
  let t = 1_000_000;
  const store = new TaskStore(file, { now: () => t });
  await store.register({ taskId: 'slow', owner: 'dsh', ttlS: 100 });
  t += 120_000; // second beat never comes
  const first = await store.check();
  assert.equal(first.stalled.length, 1);
  assert.equal(first.stalled[0].stall_score, 0);
  assert.equal(first.stalled[0].stall_grade, 'watch');
  t += 60_000; // stalled for 60s (ttl=100s) -> score 60, grade high
  const second = await store.check();
  assert.equal(second.stalled[0].stall_score, 60);
  assert.equal(second.stalled[0].stall_grade, 'high');
  t += 120_000; // total 180s -> capped at critical
  const third = await store.check();
  assert.equal(third.stalled[0].stall_score, 100);
  assert.equal(third.stalled[0].stall_grade, 'critical');
});
