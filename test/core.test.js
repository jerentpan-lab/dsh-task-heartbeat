import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore, validateTaskId, validateTtl } from '../src/core.js';

async function freshStore(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-hb-'));
  return new TaskStore(join(dir, 'tasks.json'), options);
}

test('register/beat/done lifecycle', async () => {
  const store = await freshStore();
  const t = await store.register({ taskId: 't1', owner: 'dsh', expect: 'done', ttlS: 60 });
  assert.equal(t.status, 'running');
  assert.equal(t.beats, 1);
  const b = await store.beat('t1', 'step 2');
  assert.equal(b.beats, 2);
  const d = await store.done('t1');
  assert.equal(d.status, 'done');
});

test('concurrent registers do not lose updates (audit H1)', async () => {
  const store = await freshStore();
  await Promise.all([
    store.register({ taskId: 'a', owner: 'dsh' }),
    store.register({ taskId: 'b', owner: 'dsh' }),
    store.register({ taskId: 'c', owner: 'dsh' }),
  ]);
  const list = await store.list();
  assert.deepEqual(Object.keys(list).sort(), ['a', 'b', 'c']);
});

test('concurrent beats keep all increments (audit H1)', async () => {
  const store = await freshStore();
  await store.register({ taskId: 'x', owner: 'dsh' });
  await Promise.all([store.beat('x'), store.beat('x'), store.beat('x')]);
  const list = await store.list();
  assert.equal(list.x.beats, 4);
});

test('stall detection uses last beat age vs ttl and persists stalledAt', async () => {
  const clock = { ms: 1_000_000 };
  const store = await freshStore({ now: () => clock.ms });
  await store.register({ taskId: 't1', owner: 'dsh', ttlS: 10 });
  clock.ms += 5_000;
  let r = await store.check();
  assert.equal(r.stalled.length, 0);
  clock.ms += 10_000;
  r = await store.check();
  assert.equal(r.stalled.length, 1);
  assert.equal(r.stalled[0].stalled_s, 15);
  const firstStalledAt = r.stalled[0].stalledAt;
  assert.ok(firstStalledAt);
  clock.ms += 5_000;
  r = await store.check();
  assert.equal(r.stalled[0].stalledAt, firstStalledAt, 'stalledAt must be stable across checks');
});

test('done tasks are never reported stalled', async () => {
  const clock = { ms: 2_000_000 };
  const store = await freshStore({ now: () => clock.ms });
  await store.register({ taskId: 't2', owner: 'dsh', ttlS: 5 });
  await store.done('t2');
  clock.ms += 60_000;
  const r = await store.check();
  assert.equal(r.stalled.length, 0);
});

test('beat after done is rejected unless reopened (audit H4)', async () => {
  const store = await freshStore();
  await store.register({ taskId: 't3', owner: 'dsh' });
  await store.done('t3');
  await assert.rejects(() => store.beat('t3'), /already done/);
  const back = await store.beat('t3', 'late', { reopen: true });
  assert.equal(back.status, 'running');
});

test('duplicate register is rejected unless forced (audit H8)', async () => {
  const store = await freshStore();
  await store.register({ taskId: 't4', owner: 'dsh' });
  await assert.rejects(() => store.register({ taskId: 't4', owner: 'dsh' }), /already running/);
  const forced = await store.register({ taskId: 't4', owner: 'dsh', force: true });
  assert.equal(forced.restarts, 1);
});

test('ttl must be positive finite (audit H3)', async () => {
  const store = await freshStore();
  await assert.rejects(() => store.register({ taskId: 't5', owner: 'dsh', ttlS: 0 }), /positive/);
  await assert.rejects(() => store.register({ taskId: 't5', owner: 'dsh', ttlS: -1 }), /positive/);
  assert.throws(() => validateTtl(Number.NaN), /positive/);
});

test('taskId prototype keys and path chars are rejected (audit H3b)', async () => {
  assert.throws(() => validateTaskId('__proto__'), /taskId must/);
  assert.throws(() => validateTaskId('../etc/passwd'), /taskId must/);
  assert.throws(() => validateTaskId('a/b'), /taskId must/);
  const store = await freshStore();
  await assert.rejects(() => store.register({ taskId: '__proto__', owner: 'dsh' }), /taskId must/);
});

test('corrupt state file is quarantined and tools keep working (audit H5)', async () => {
  const store = await freshStore();
  await store.register({ taskId: 'ok', owner: 'dsh' });
  await writeFile(store.file, '{oops', 'utf8');
  const list = await store.list();
  assert.deepEqual(Object.keys(list), []);
  assert.ok(store.warnings.corrupted, 'corruption must be reported');
  const t = await store.register({ taskId: 'new', owner: 'dsh' });
  assert.equal(t.taskId, 'new');
});

test('clock skew is reported separately from stalls (audit H2)', async () => {
  const clock = { ms: 3_000_000 };
  const store = await freshStore({ now: () => clock.ms });
  await store.register({ taskId: 'sk', owner: 'dsh', ttlS: 10 });
  const list = await store.list();
  const future = new Date(clock.ms + 60 * 60 * 1000).toISOString();
  list.sk.lastBeat = future;
  const raw = JSON.parse(await readFile(store.file, 'utf8'));
  raw.sk.lastBeat = future;
  await writeFile(store.file, JSON.stringify(raw), 'utf8');
  const r = await store.check();
  assert.equal(r.stalled.length, 0);
  assert.equal(r.skew.length, 1);
});

test('persistence survives reload', async () => {
  const store = await freshStore();
  await store.register({ taskId: 't9', owner: 'dsh' });
  const second = new TaskStore(store.file);
  const list = await second.list();
  assert.ok(list.t9);
});
