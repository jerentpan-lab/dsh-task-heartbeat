#!/usr/bin/env node
/** G5 demo: register a task, beat it, then show stall detection + SLA score. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/core.js';
const store = new TaskStore(join(mkdtempSync(join(tmpdir(), 'hb-demo-')), 'tasks.json'));
await store.register({ taskId: 'demo', owner: 'demo', ttlS: 1 });
console.log('registered demo (ttl=1s), no beat yet');
const first = await store.check();
console.log('immediately:', JSON.stringify(first.stalled.map((t) => ({ grade: t.stall_grade, score: t.stall_score, stalled_s: t.stalled_s }))));
await new Promise((r) => setTimeout(r, 1200));
const second = await store.check();
console.log('after 1.2s:', JSON.stringify(second.stalled.map((t) => ({ grade: t.stall_grade, score: t.stall_score, stalled_s: t.stalled_s }))));
await store.beat('demo', 'still working');
const third = await store.check();
console.log('after beat:', third.stalled.length === 0 ? 'healthy' : JSON.stringify(third.stalled));
