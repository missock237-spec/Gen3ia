// ============================================================
// Gen3ia Evolution Engine — Concurrency & crash recovery
// ============================================================
// Ensures at most `EVOLUTION_MAX_CONCURRENT` evolution runs execute
// at the same time, and that crashed runs are detected + recovered.
//
// Strategy: file-based mutex under `./node_modules/.cache/evolution/`
// (works on single-host Vercel + local dev; for multi-host we
// recommend setting `EVOLUTION_REDIS_URL` and switching to
// `setRedisClient(ioredis)` — left as a TODO in the migration doc).
// ============================================================

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '@/lib/logger';
import { LOCK_HEARTBEAT_MS, LOCK_TTL_MS, getEvolutionEnv } from './config';

const log = createLogger('evolution-concurrency');

const LOCK_DIR =
  process.env.EVOLUTION_LOCK_DIR || path.join(process.cwd(), 'node_modules', '.cache', 'evolution');

interface LockEntry {
  evolutionId: string;
  lockToken: string;
  acquiredAt: number;
  lastHeartbeat: number;
  pid: number;
}

function lockPath(id: string): string {
  return path.join(LOCK_DIR, `${id}.lock`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(LOCK_DIR, { recursive: true });
}

export async function acquireLock(evolutionId: string): Promise<string | null> {
  await ensureDir();
  const env = getEvolutionEnv();
  const limit = Math.max(1, env.EVOLUTION_MAX_CONCURRENT);

  // Count active locks
  const active = await listActiveLocks();
  if (active.length >= limit) {
    log.info('evolution concurrency limit reached', { active: active.length, limit });
    return null;
  }

  const token = `${evolutionId}-${Date.now()}-${process.pid}`;
  const entry: LockEntry = {
    evolutionId,
    lockToken: token,
    acquiredAt: Date.now(),
    lastHeartbeat: Date.now(),
    pid: process.pid,
  };

  try {
    // Use exclusive create — if file exists, this fails.
    const handle = await fs.open(lockPath(evolutionId), 'wx');
    await handle.writeFile(JSON.stringify(entry, null, 2));
    await handle.close();
    log.info('lock acquired', { evolutionId, token });
    return token;
  } catch (err) {
    // If the file already exists but is stale, reclaim it.
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      const existing = await readLock(evolutionId);
      if (existing && Date.now() - existing.lastHeartbeat > LOCK_TTL_MS) {
        log.warn('reclaiming stale lock', { evolutionId, staleSince: existing.lastHeartbeat });
        await fs.writeFile(lockPath(evolutionId), JSON.stringify(entry, null, 2));
        return token;
      }
    }
    log.warn('lock acquisition failed', { evolutionId, error: String(err) });
    return null;
  }
}

export async function releaseLock(evolutionId: string, token: string): Promise<void> {
  try {
    const entry = await readLock(evolutionId);
    if (!entry) return;
    if (entry.lockToken !== token) {
      log.warn('cannot release: token mismatch', { evolutionId, expected: token, actual: entry.lockToken });
      return;
    }
    await fs.unlink(lockPath(evolutionId)).catch(() => undefined);
    log.info('lock released', { evolutionId });
  } catch (err) {
    log.warn('releaseLock error', { evolutionId, error: String(err) });
  }
}

export async function heartbeat(evolutionId: string, token: string): Promise<void> {
  const entry = await readLock(evolutionId);
  if (!entry || entry.lockToken !== token) return;
  entry.lastHeartbeat = Date.now();
  try {
    await fs.writeFile(lockPath(evolutionId), JSON.stringify(entry, null, 2));
  } catch (err) {
    log.warn('heartbeat failed', { evolutionId, error: String(err) });
  }
}

export async function listActiveLocks(): Promise<LockEntry[]> {
  await ensureDir();
  try {
    const files = await fs.readdir(LOCK_DIR);
    const entries: LockEntry[] = [];
    for (const f of files) {
      if (!f.endsWith('.lock')) continue;
      try {
        const content = await fs.readFile(path.join(LOCK_DIR, f), 'utf8');
        const e = JSON.parse(content) as LockEntry;
        if (Date.now() - e.lastHeartbeat > LOCK_TTL_MS) {
          // Stale — reap it
          await fs.unlink(path.join(LOCK_DIR, f)).catch(() => undefined);
          continue;
        }
        entries.push(e);
      } catch {
        // skip unreadable
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function readLock(evolutionId: string): Promise<LockEntry | null> {
  try {
    const content = await fs.readFile(lockPath(evolutionId), 'utf8');
    return JSON.parse(content) as LockEntry;
  } catch {
    return null;
  }
}

// Start a background heartbeat loop for a given lock.
// Returns a stop function.
export function startHeartbeat(evolutionId: string, token: string): () => void {
  const interval = setInterval(() => {
    heartbeat(evolutionId, token).catch(() => undefined);
  }, LOCK_HEARTBEAT_MS);
  return () => clearInterval(interval);
}

// Detect crashed runs: scan all `running` evolution records whose
// lock has expired and mark them as `failed`.
// (Called by the orchestrator on startup, or by a cron route.)
export async function reapCrashedRuns(): Promise<string[]> {
  const reaped: string[] = [];
  try {
    const files = await fs.readdir(LOCK_DIR);
    for (const f of files) {
      if (!f.endsWith('.lock')) continue;
      try {
        const p = path.join(LOCK_DIR, f);
        const content = await fs.readFile(p, 'utf8');
        const e = JSON.parse(content) as LockEntry;
        if (Date.now() - e.lastHeartbeat > LOCK_TTL_MS) {
          await fs.unlink(p).catch(() => undefined);
          reaped.push(e.evolutionId);
          log.warn('reaped crashed run', { evolutionId: e.evolutionId });
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return reaped;
}
