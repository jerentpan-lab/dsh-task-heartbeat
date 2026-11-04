import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { TaskStore } from '../src/core.js';

const N = 50;

function beatWorker(stateFile) {
  const core = new URL('../src/core.js', import.meta.url).href;
  const code = `import { parentPort, workerData } from 'node:worker_threads';
import { TaskStore } from ${JSON.stringify(core)};
const store = new TaskStore(workerData.file, { lockRetries: 4000, lockStaleMs: 60_000 });
await store.beat('shared', 'worker');
parentPort.postMessage('ok');`;
  return new Promise((resolve) => {
    const w = new Worker(code, { eval: true, workerData: { file: stateFile } });
    const timer = setTimeout(() => { w.terminate(); resolve({ ok: false, reason: 'timeout' }); }, 90_000);
    w.once('message', (m) => { clearTimeout(timer); resolve({ ok: m === 'ok' }); });
    w.once('error', (e) => { clearTimeout(timer); resolve({ ok: false, reason: String(e.message || e) }); });
  });
}

test(`B3: ${N} concurrent beaters: no deadlock, no lost writes`, { timeout: 150_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-hb-conc-'));
  const file = join(dir, 'tasks.json');
  const store = new TaskStore(file);
  await store.register({ taskId: 'shared', owner: 'dsh', ttlS: 600 });

  const results = await Promise.all(Array.from({ length: N }, () => beatWorker(file)));
  const ok = results.filter((r) => r.ok).length;
  assert.equal(ok, N, `expected ${N}/${N} worker beats, got ${ok}: ${JSON.stringify(results.filter((r) => !r.ok).slice(0, 3))}`);

  const tasks = await store.load();
  assert.ok(tasks.shared, 'shared task still present and parseable');
  assert.ok(tasks.shared.beats >= N, `expected >=${N} recorded beats, got ${tasks.shared.beats}`);
  assert.equal(tasks.shared.status, 'running');
  assert.equal(store.warnings.corrupted, null);
});
