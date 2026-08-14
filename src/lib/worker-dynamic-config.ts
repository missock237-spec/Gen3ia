// ============================================================
// Gen3ia — Config des workers dynamique par agent
// ============================================================
//  Rend la config des workers scalable : lue depuis le document agent
//  (collections 'agents', via la façade Firestore db.agent), mise en
//  cache avec TTL, surchargeable au runtime. Conforme à l'API réelle
//  db.<modèle>.findUnique({ where: { id }, select }) — PAS db.findMany()
//  au top niveau.
// ============================================================
import { db } from '@/lib/db';

// Champs de config attendus sur le document agent. Valeurs par défaut
// conservatrices si absents (évite tout scaling sauvage).
export interface WorkerConfig {
  agentId: string;
  minWorkers: number;
  maxWorkers: number;
  concurrency: number;
  queue: string;
  cron?: string;
  active: boolean;
}

export const DEFAULT_WORKER_CONFIG: Omit<WorkerConfig, 'agentId'> = {
  minWorkers: 1,
  maxWorkers: 4,
  concurrency: 2,
  queue: 'agent-execution',
  active: true,
};

// Cache mémoire avec TTL (30s) pour limiter les lectures Firestore.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { cfg: WorkerConfig; at: number }>();

export function serializeConfig(agentId: string, agentRecord: Record<string, unknown>): WorkerConfig {
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.max(1, Math.floor(v)) : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

  return {
    agentId,
    minWorkers: num(agentRecord.workerMinWorkers, DEFAULT_WORKER_CONFIG.minWorkers),
    maxWorkers: num(agentRecord.workerMaxWorkers, DEFAULT_WORKER_CONFIG.maxWorkers),
    concurrency: num(agentRecord.workerConcurrency, DEFAULT_WORKER_CONFIG.concurrency),
    queue: typeof agentRecord.workerQueue === 'string' && agentRecord.workerQueue
      ? agentRecord.workerQueue
      : DEFAULT_WORKER_CONFIG.queue,
    cron: typeof agentRecord.cron === 'string' ? agentRecord.cron : undefined,
    active: bool(agentRecord.autoActive, DEFAULT_WORKER_CONFIG.active),
  };
}

/** Lit la config worker d'un agent depuis son document Firestore (avec cache TTL). */
export async function getWorkerConfig(agentId: string): Promise<WorkerConfig> {
  const hit = cache.get(agentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.cfg;

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: [
      'workerMinWorkers',
      'workerMaxWorkers',
      'workerConcurrency',
      'workerQueue',
      'cron',
      'autoActive',
    ],
  });

  const cfg = serializeConfig(agentId, (agent ?? {}) as Record<string, unknown>);
  cache.set(agentId, { cfg, at: Date.now() });
  return cfg;
}

/**
 * Nombre de workers souhaités selon la charge de jobs pendants.
 * Respecte [minWorkers, maxWorkers], ratio = ceil(pending / concurrency).
 */
export function desiredWorkers(cfg: WorkerConfig, pendingJobs: number): number {
  if (!cfg.active) return 0;
  const ratio = Math.ceil(pendingJobs / cfg.concurrency);
  return Math.min(cfg.maxWorkers, Math.max(cfg.minWorkers, ratio));
}

/** Invalide le cache (après mise à jour de la config d'un agent). */
export function invalidateWorkerConfig(agentId: string): void {
  cache.delete(agentId);
}

export function __clearWorkerConfigCacheForTests(): void {
  cache.clear();
}
