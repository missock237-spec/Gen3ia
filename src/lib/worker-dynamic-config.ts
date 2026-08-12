/* Config des workers dynamique par agent, lue via la façade db (Firestore).
 * Conforme façade : findMany avec where FirestoreWhereOp[] + select string[]. */
import { db } from "./db";

export interface WorkerConfig {
  agentId: string;
  minWorkers: number;
  maxWorkers: number;
  concurrency: number;
  queue: string;
  cron?: string;
  active: boolean;
  updatedAt?: string;
}

export const DEFAULT_WORKER_CONFIG: Omit<WorkerConfig, "agentId"> = {
  minWorkers: 1,
  maxWorkers: 4,
  concurrency: 2,
  queue: "default",
  active: true,
};

const COLLECTION = "agent_config";
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { cfg: WorkerConfig; at: number }>();

function serialize(agentId: string, overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return { agentId, ...DEFAULT_WORKER_CONFIG, ...overrides };
}

export async function getWorkerConfig(agentId: string): Promise<WorkerConfig> {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;

  const rows = await db.findMany({
    where: [{ field: "agentId", op: "==", value: agentId }] as never,
    select: ["minWorkers", "maxWorkers", "concurrency", "queue", "cron", "active"] as never,
    collection: COLLECTION as never,
  });
  const doc = Array.isArray(rows) ? rows[0] : rows;

  const cfg = doc ? { agentId, ...(doc as object) } : serialize(agentId);
  if (doc) cache.set(agentId, { cfg: cfg as WorkerConfig, at: Date.now() });
  return cfg as WorkerConfig;
}

export function desiredWorkers(cfg: WorkerConfig, pendingJobs: number): number {
  if (!cfg.active) return 0;
  const ratio = Math.ceil(pendingJobs / cfg.concurrency);
  return Math.min(cfg.maxWorkers, Math.max(cfg.minWorkers, ratio));
}

export function invalidateCache(agentId: string) { cache.delete(agentId); }
