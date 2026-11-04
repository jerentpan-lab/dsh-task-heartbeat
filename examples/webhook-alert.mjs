#!/usr/bin/env node
/**
 * B4 example: poll task heartbeats and POST stalled tasks to your own webhook.
 * Zero dependencies (Node >=18 global fetch).
 *
 * Usage:
 *   DSH_TASK_HEARTBEAT_FILE=~/.dsh/task-heartbeat.json \
 *   WEBHOOK_URL=https://example.invalid/hook \
 *   node examples/webhook-alert.mjs
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TaskStore } from '../src/core.js';

const file = process.env.DSH_TASK_HEARTBEAT_FILE || join(homedir(), '.dsh', 'task-heartbeat.json');
const url = process.env.WEBHOOK_URL;
if (!url) {
  console.error('WEBHOOK_URL is required (this example never posts anywhere by default)');
  process.exit(2);
}
const store = new TaskStore(file);
const { stalled, skew } = await store.check();
console.log(`[webhook-alert] stalled=${stalled.length} skew=${skew.length}`);
for (const task of stalled) {
  const body = {
    text: `task ${task.taskId} stalled (${task.stall_grade}, score ${task.stall_score})`,
    taskId: task.taskId,
    owner: task.owner,
    stalled_s: task.stalled_s,
    stall_score: task.stall_score,
    stall_grade: task.stall_grade,
  };
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  console.log(`[webhook-alert] ${task.taskId} -> HTTP ${res.status}`);
}
