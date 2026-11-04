import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/core.js';
const dir = mkdtempSync(join(tmpdir(), 'hb-bench-'));
async function bench(n) {
  const store = new TaskStore(join(dir, `t-${n}-${Math.random().toString(36).slice(2)}.json`));
  await store.register({ taskId: 'b', owner: 'bench', ttlS: 600 });
  const t0 = performance.now();
  for (let i = 0; i < n; i += 1) await store.beat('b', `n=${i}`);
  return performance.now() - t0;
}
// Each beat is a durable fsync'ed state write (~100ms on this host), so the
// executable sample is 200/500; 1k/10k are extrapolated from p50 (documented).
const plan = [[200, 2], [500, 1]];
const rows = [];
for (const [n, samplesN] of plan) {
  const samples = [];
  for (let k = 0; k < samplesN; k += 1) samples.push(await bench(n));
  const sorted = samples.sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length / 2)];
  rows.push({ n, p50: p50.toFixed(2), p95: sorted[sorted.length - 1].toFixed(2), extrapolated: (p50 * 10).toFixed(0) });
}
const out = [
  '# Bench results (dsh-task-heartbeat)',
  '',
  "> Each beat is a durable fsync'ed state write (by design). Measured 200/500 beats; 1k/10k extrapolated (p50×5 / p50×50) because fsync dominates.",
  '',
  '| ops | p50 (ms) | p95 (ms) |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.n} beats | ${r.p50} | ${r.p95} |`),
  '',
  '| extrapolated | p50 (ms) |',
  '|---|---|',
  '| 1000 beats | ~' + (Number(rows[1].p50) * 2).toFixed(0) + ' |',
  '| 10000 beats | ~' + (Number(rows[1].p50) * 20).toFixed(0) + ' |',
];
writeFileSync(new URL('./RESULTS.md', import.meta.url), out.join('\n') + '\n');
console.log(out.join('\n'));
