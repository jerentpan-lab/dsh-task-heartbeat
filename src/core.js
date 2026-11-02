/**
 * Task progress registry with heartbeat-based stall detection.
 * Audit-hardened 2026-11-02:
 * - in-process mutex + O_EXCL lock file (cross-process), stale lock reclaim
 * - fsync before rename; corrupt state quarantined, never bricks the tools
 * - taskId validation (no path chars, no prototype keys), null-prototype store
 * - beat after done rejected unless reopened; register refuses silent overwrite
 * - ttl must be a positive finite number; clock-skew detected separately
 */
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DEFAULT_TTL_S = 900;
export const CLOCK_SKEW_MS = 5 * 60 * 1000;
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function nowIso(nowMs) {
  return new Date(nowMs).toISOString();
}

function parseIsoStrict(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s)) return NaN;
  return Date.parse(s);
}

export function validateTaskId(taskId) {
  const id = String(taskId ?? '').trim();
  if (!TASK_ID_RE.test(id)) {
    throw new Error('taskId must match /^[A-Za-z0-9_-]{1,64}$/ (no path/prototype characters)');
  }
  if (['__proto__', 'constructor', 'prototype'].includes(id)) {
    throw new Error('taskId must not be a prototype key (__proto__/constructor/prototype)');
  }
  return id;
}

export function validateTtl(ttlS) {
  const t = Number(ttlS);
  if (!Number.isFinite(t) || t <= 0) throw new Error('ttlS must be a positive finite number');
  return t;
}

class Mutex {
  constructor() { this.tail = Promise.resolve(); }
  run(fn) {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(() => {}, () => {});
    return next;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function atomicWrite(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fh = await open(tmp, 'w');
  try {
    await fh.writeFile(JSON.stringify(data, null, 1), 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, file);
  try {
    const dh = await open(dirname(file), 'r');
    try { await dh.sync(); } finally { await dh.close(); }
  } catch { /* directory fsync is best-effort (platform dependent) */ }
}

export class TaskStore {
  constructor(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') throw new Error('TaskStore: filePath is required');
    this.file = filePath;
    this.lockFile = `${filePath}.lock`;
    this.now = options.now || (() => Date.now());
    this.lockStaleMs = options.lockStaleMs ?? 30_000;
    this.lockRetries = options.lockRetries ?? 100;
    this.mutex = new Mutex();
    this.warnings = { corrupted: null, clockSkew: [] };
  }

  async _acquireLock() {
    for (let i = 0; i < this.lockRetries; i += 1) {
      try {
        const fh = await open(this.lockFile, 'wx');
        await fh.writeFile(JSON.stringify({ pid: process.pid, ts: nowIso(this.now()) }), 'utf8');
        await fh.close();
        return true;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        try {
          const st = await stat(this.lockFile);
          if (this.now() - st.mtimeMs > this.lockStaleMs) {
            await unlink(this.lockFile).catch(() => {});
            continue;
          }
        } catch { /* lock vanished: retry */ }
        await sleep(Math.min(50, 5 + i * 2));
      }
    }
    throw new Error(`TaskStore: could not acquire lock ${this.lockFile}`);
  }

  async _releaseLock() {
    await unlink(this.lockFile).catch(() => {});
  }

  async _withLock(fn) {
    return this.mutex.run(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await this._acquireLock();
      try {
        return await fn();
      } finally {
        await this._releaseLock();
      }
    });
  }

  /** Read state; corrupt files are quarantined and reported, never fatal. */
  async _readState() {
    let raw;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return { tasks: {}, corrupt: null };
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      await rename(this.file, backup).catch(() => {});
      this.warnings.corrupted = { backup, error: String(err.message || err) };
      return { tasks: {}, corrupt: this.warnings.corrupted };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const backup = `${this.file}.corrupt-${Date.now()}`;
      await rename(this.file, backup).catch(() => {});
      this.warnings.corrupted = { backup, error: 'state root is not a JSON object' };
      return { tasks: {}, corrupt: this.warnings.corrupted };
    }
    const tasks = Object.create(null);
    for (const [k, v] of Object.entries(parsed)) {
      if (!TASK_ID_RE.test(k) || !v || typeof v !== 'object') continue;
      tasks[k] = Object.assign(Object.create(null), v);
    }
    return { tasks, corrupt: null };
  }

  async _writeState(tasks) {
    const plain = {};
    for (const k of Object.keys(tasks)) plain[k] = tasks[k];
    await atomicWrite(this.file, plain);
  }

  async load() {
    const { tasks } = await this._readState();
    return tasks;
  }

  async register({ taskId, owner, expect, ttlS = DEFAULT_TTL_S, note = '', force = false }) {
    const id = validateTaskId(taskId);
    if (!owner || !String(owner).trim()) throw new Error('register: owner is required');
    const ttl = validateTtl(ttlS);
    return this._withLock(async () => {
      const { tasks } = await this._readState();
      const existing = tasks[id];
      if (existing && existing.status !== 'done' && !force) {
        throw new Error(`register: task ${id} is already running (use force:true to restart)`);
      }
      const ts = nowIso(this.now());
      tasks[id] = Object.assign(Object.create(null), {
        taskId: id,
        owner: String(owner),
        expect: String(expect ?? ''),
        start: ts,
        firstStart: existing?.firstStart || ts,
        lastBeat: ts,
        ttlS: ttl,
        status: 'running',
        beats: 1,
        restarts: (existing?.restarts || 0) + (existing ? 1 : 0),
        note: String(note ?? ''),
        stalledAt: null,
      });
      await this._writeState(tasks);
      return tasks[id];
    });
  }

  async beat(taskId, note = '', { reopen = false } = {}) {
    const id = validateTaskId(taskId);
    return this._withLock(async () => {
      const { tasks } = await this._readState();
      const task = tasks[id];
      if (!task) throw new Error(`beat: unknown taskId ${id}`);
      if (task.status === 'done' && !reopen) throw new Error(`beat: task ${id} is already done (use reopen:true)`);
      task.lastBeat = nowIso(this.now());
      task.beats = (task.beats || 0) + 1;
      task.status = 'running';
      task.stalledAt = null;
      if (note) task.note = String(note);
      await this._writeState(tasks);
      return task;
    });
  }

  async done(taskId) {
    const id = validateTaskId(taskId);
    return this._withLock(async () => {
      const { tasks } = await this._readState();
      const task = tasks[id];
      if (!task) throw new Error(`done: unknown taskId ${id}`);
      if (task.status !== 'done') {
        task.status = 'done';
        task.lastBeat = nowIso(this.now());
        task.stalledAt = null;
        await this._writeState(tasks);
      }
      return task;
    });
  }

  async list() {
    return this._withLock(async () => {
      const { tasks } = await this._readState();
      return tasks;
    });
  }

  /** Detect stalls; persists stalledAt (first detection) for stable reporting. */
  async check() {
    return this._withLock(async () => {
      const { tasks } = await this._readState();
      const now = this.now();
      const stalled = [];
      const skew = [];
      let changed = false;
      for (const task of Object.values(tasks)) {
        if (task.status === 'done') continue;
        const last = parseIsoStrict(task.lastBeat);
        if (!Number.isFinite(last)) continue;
        if (last - now > CLOCK_SKEW_MS) {
          skew.push({ taskId: task.taskId, lastBeat: task.lastBeat, skewMs: last - now });
          continue;
        }
        const ageS = Math.floor((now - last) / 1000);
        if (ageS > (task.ttlS || DEFAULT_TTL_S)) {
          if (!task.stalledAt) { task.stalledAt = nowIso(now); changed = true; }
          const stalledForS = Math.floor((now - parseIsoStrict(task.stalledAt)) / 1000);
          stalled.push({ ...task, stalled_s: ageS, stalledFor_s: stalledForS });
        }
      }
      if (changed) await this._writeState(tasks);
      this.warnings.clockSkew = skew;
      return { stalled, skew };
    });
  }
}
