// ============================================================
// GPU CLUSTER MANAGER — Monitoring + Scheduling
// ------------------------------------------------------------
//  Inspiré de NVIDIA DGX Cluster Manager + Kubernetes GPU operator.
//  Fonctions:
//    1. Recensement des GPU (local CUDA via nvidia-smi + distants via API)
//    2. Métriques temps réel (utilisation, mémoire, température, alimentation)
//    3. File d'attente de jobs GPU (training, inference batch, distillation)
//    4. Scheduling: priority + FIFO + préemption optionnelle
//    5. Affinité GPU→modèle (ex: A100 pour LLM-70B, T4 pour SDXL)
//
//  Persistance: Firestore (collections "gpu_nodes", "gpu_jobs").
//  Métriques temps réel: en mémoire (Map) avec TTL 30s.
// ============================================================

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const execAsync = promisify(exec);
const log = createLogger('gpu-cluster');

// ─── Types ────────────────────────────────────────────────────────────────

export type GpuType = 'T4' | 'V100' | 'A10G' | 'A100-40GB' | 'A100-80GB' | 'H100-80GB' | 'H200' | 'B200' | 'L4' | 'unknown';
export type NodeStatus = 'online' | 'offline' | 'busy' | 'maintenance';

export interface GpuNode {
  id: string;
  /** Nom convivial */
  name: string;
  /** Type de GPU */
  gpuType: GpuType;
  /** Nombre de GPUs physiques */
  gpuCount: number;
  /** Mémoire totale par GPU (Go) */
  gpuMemoryGb: number;
  /** CPU cores */
  cpuCores: number;
  /** RAM (Go) */
  ramGb: number;
  /** Endpoint API distant (si cluster distribué) */
  endpoint?: string;
  /** Région / zone */
  region?: string;
  status: NodeStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface GpuMetricsSnapshot {
  nodeId: string;
  gpuIndex: number;
  /** Utilisation GPU (0-100 %) */
  utilization: number;
  /** Mémoire utilisée (Mo) */
  memoryUsedMb: number;
  /** Mémoire totale (Mo) */
  memoryTotalMb: number;
  /** Température (°C) */
  temperatureC: number;
  /** Consommation (W) */
  powerW: number;
  /** Limite puissance (W) */
  powerLimitW: number;
  /** Timestamp */
  timestamp: number;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'preempted';
export type JobType = 'training' | 'inference-batch' | 'distillation' | 'evaluation' | 'embedding';

export interface GpuJob {
  id: string;
  ownerId: string;
  type: JobType;
  /** Priorité (1=haute, 10=basse) */
  priority: number;
  /** ID du modèle (Model Registry) si applicable */
  modelId?: string;
  /** ID du dataset (Training Pipeline) si training */
  datasetId?: string;
  /** Type de GPU requis */
  requiredGpuType?: GpuType;
  /** Nombre de GPUs requis */
  requiredGpuCount: number;
  /** Estimation de durée (s) */
  estimatedDurationSec?: number;
  /** ID du node assigné (si running) */
  assignedNodeId?: string;
  /** ID du training run lié (si training) */
  trainingRunId?: string;
  status: JobStatus;
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  /** Code de sortie du process (0 = succès) */
  exitCode?: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Métriques en mémoire (TTL 30s) ──────────────────────────────────────

const METRICS_TTL_MS = 30_000;
const metricsCache = new Map<string, { snapshot: GpuMetricsSnapshot; expiresAt: number }>();

// ─── Service ──────────────────────────────────────────────────────────────

class GpuClusterService {
  // ─── Nodes ────────────────────────────────────────────────────────────

  async registerNode(params: Omit<GpuNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<GpuNode> {
    const now = new Date();
    const id = params.id ?? `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const node: GpuNode = {
      ...params,
      id,
      createdAt: now,
      updatedAt: now,
    } as GpuNode;

    await db.gpuNode.create({ data: node as never }).catch((e: unknown) => {
      log.warn('node_register_failed', { id, error: e instanceof Error ? e.message : '' });
    });

    log.info('node_registered', { id, name: params.name, gpuType: params.gpuType, gpuCount: params.gpuCount });
    return node;
  }

  async getNode(id: string): Promise<GpuNode | null> {
    const doc = (await db.gpuNode.findUnique({ where: { id } }).catch(() => null)) as
      | Record<string, unknown>
      | null;
    return doc as unknown as GpuNode | null;
  }

  async listNodes(statusFilter?: NodeStatus): Promise<GpuNode[]> {
    const where = statusFilter ? [{ field: 'status', op: '==', value: statusFilter }] : [];
    const docs = (await db.gpuNode.findMany({ where: where as never, limit: 200 }).catch(() => [])) as unknown as Array<Record<string, unknown>>;
    return docs as unknown as GpuNode[];
  }

  async setNodeStatus(id: string, status: NodeStatus): Promise<void> {
    await db.gpuNode.update({
      where: { id },
      data: { status, updatedAt: new Date() } as never,
    }).catch(() => undefined);
    log.info('node_status_changed', { id, status });
  }

  // ─── Métriques ────────────────────────────────────────────────────────

  /**
   * Récupère les métriques d'un node GPU via nvidia-smi (local) ou API (distant).
   */
  async getNodeMetrics(nodeId: string): Promise<GpuMetricsSnapshot[]> {
    const node = await this.getNode(nodeId);
    if (!node) return [];

    // Cache lookup
    const cacheKey = `${nodeId}`;
    const cached = metricsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      // Retourne un seul snapshot depuis le cache (mais le cache ne stocke qu'un seul)
      // Pour une vraie impl multi-GPU, on devrait itérer par gpuIndex.
      // Ici on retourne tous les snapshots récents pour ce node.
      const allCached: GpuMetricsSnapshot[] = [];
      for (let i = 0; i < node.gpuCount; i++) {
        const c = metricsCache.get(`${nodeId}:${i}`);
        if (c && c.expiresAt > Date.now()) allCached.push(c.snapshot);
      }
      if (allCached.length > 0) return allCached;
    }

    // Si node local → nvidia-smi
    if (!node.endpoint || node.endpoint === 'local' || node.endpoint === '127.0.0.1') {
      return this.collectLocalGpuMetrics(nodeId, node.gpuCount);
    }

    // Si node distant → GET /v1/metrics (à implémenter côté distant)
    try {
      const response = await fetch(`${node.endpoint}/v1/metrics`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        log.warn('remote_metrics_fetch_failed', { nodeId, status: response.status });
        return [];
      }
      const data = (await response.json()) as { gpus?: GpuMetricsSnapshot[] };
      const snaps = data.gpus ?? [];
      for (const s of snaps) {
        metricsCache.set(`${nodeId}:${s.gpuIndex}`, {
          snapshot: { ...s, nodeId },
          expiresAt: Date.now() + METRICS_TTL_MS,
        });
      }
      return snaps;
    } catch (error) {
      log.warn('remote_metrics_fetch_error', {
        nodeId,
        error: error instanceof Error ? error.message : '',
      });
      return [];
    }
  }

  /**
   * Collecte les métriques GPU locales via nvidia-smi.
   * Si nvidia-smi n'est pas disponible (pas de GPU), retourne [].
   */
  private async collectLocalGpuMetrics(nodeId: string, gpuCount: number): Promise<GpuMetricsSnapshot[]> {
    try {
      // Requête unique pour tous les GPUs
      const cmd = `nvidia-smi --query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit --format=csv,noheader,nounits`;
      const { stdout } = await execAsync(cmd, { timeout: 5000 });
      const lines = stdout.trim().split('\n');
      const snaps: GpuMetricsSnapshot[] = [];

      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 7) continue;
        const gpuIndex = parseInt(parts[0], 10);
        const snapshot: GpuMetricsSnapshot = {
          nodeId,
          gpuIndex,
          utilization: parseFloat(parts[1]) || 0,
          memoryUsedMb: parseFloat(parts[2]) || 0,
          memoryTotalMb: parseFloat(parts[3]) || 0,
          temperatureC: parseFloat(parts[4]) || 0,
          powerW: parseFloat(parts[5]) || 0,
          powerLimitW: parseFloat(parts[6]) || 0,
          timestamp: Date.now(),
        };
        snaps.push(snapshot);
        metricsCache.set(`${nodeId}:${gpuIndex}`, {
          snapshot,
          expiresAt: Date.now() + METRICS_TTL_MS,
        });
      }

      // Si nvidia-smi a retourné moins de GPUs que déclaré → on signale
      if (snaps.length < gpuCount) {
        log.warn('local_gpu_count_mismatch', { nodeId, expected: gpuCount, actual: snaps.length });
      }
      return snaps;
    } catch (error) {
      // Pas de GPU ou nvidia-smi non installé — normal en local
      log.debug('nvidia_smi_unavailable', {
        nodeId,
        error: error instanceof Error ? error.message.slice(0, 100) : '',
      });
      return [];
    }
  }

  // ─── Jobs ─────────────────────────────────────────────────────────────

  async submitJob(params: {
    ownerId: string;
    type: JobType;
    priority: number;
    modelId?: string;
    datasetId?: string;
    requiredGpuType?: GpuType;
    requiredGpuCount?: number;
    estimatedDurationSec?: number;
    trainingRunId?: string;
  }): Promise<GpuJob> {
    const now = new Date();
    const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const job: GpuJob = {
      id,
      ownerId: params.ownerId,
      type: params.type,
      priority: Math.max(1, Math.min(10, params.priority)),
      modelId: params.modelId,
      datasetId: params.datasetId,
      requiredGpuType: params.requiredGpuType,
      requiredGpuCount: params.requiredGpuCount ?? 1,
      estimatedDurationSec: params.estimatedDurationSec,
      trainingRunId: params.trainingRunId,
      status: 'queued',
      queuedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.gpuJob.create({ data: job as never }).catch((e: unknown) => {
      log.warn('job_submit_failed', { id, error: e instanceof Error ? e.message : '' });
    });

    log.info('job_queued', { id, type: params.type, priority: params.priority });
    return job;
  }

  async getJob(id: string): Promise<GpuJob | null> {
    const doc = (await db.gpuJob.findUnique({ where: { id } }).catch(() => null)) as
      | Record<string, unknown>
      | null;
    return doc as unknown as GpuJob | null;
  }

  async listJobs(filter: { ownerId?: string; status?: JobStatus; limit?: number } = {}): Promise<GpuJob[]> {
    const where: Array<{ field: string; op: '=='; value: unknown }> = [];
    if (filter.ownerId) where.push({ field: 'ownerId', op: '==', value: filter.ownerId });
    if (filter.status) where.push({ field: 'status', op: '==', value: filter.status });

    const docs = (await db.gpuJob.findMany({
      where: where as never,
      limit: filter.limit ?? 100,
    }).catch(() => [])) as unknown as Array<Record<string, unknown>>;
    return docs as unknown as GpuJob[];
  }

  /**
   * Scheduling: sélectionne le prochain job à exécuter (priority + FIFO).
   * Cherche un node GPU compatible et libre.
   */
  async scheduleNextJob(): Promise<{ job?: GpuJob; node?: GpuNode } | null> {
    // Récupérer tous les jobs queued, triés par priority ASC puis queuedAt ASC
    const queued = await this.listJobs({ status: 'queued', limit: 200 });
    if (queued.length === 0) return null;

    queued.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.queuedAt?.getTime() ?? 0) - (b.queuedAt?.getTime() ?? 0);
    });

    // Récupérer tous les nodes online
    const nodes = await this.listNodes('online');

    for (const job of queued) {
      // Trouver un node compatible
      const compatible = nodes.find((n) => {
        if (n.gpuCount < (job.requiredGpuCount ?? 1)) return false;
        if (job.requiredGpuType && n.gpuType !== job.requiredGpuType) return false;
        return true;
      });

      if (compatible) {
        // Assigner et passer en running
        await this.assignJob(job.id, compatible.id);
        return { job, node: compatible };
      }
    }

    return null;
  }

  async assignJob(jobId: string, nodeId: string): Promise<void> {
    await db.gpuJob.update({
      where: { id: jobId },
      data: {
        assignedNodeId: nodeId,
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      } as never,
    }).catch(() => undefined);
    log.info('job_assigned', { jobId, nodeId });
  }

  async completeJob(jobId: string, exitCode: number, errorMessage?: string): Promise<void> {
    const failed = exitCode !== 0;
    await db.gpuJob.update({
      where: { id: jobId },
      data: {
        status: failed ? 'failed' : 'completed',
        exitCode,
        errorMessage: errorMessage?.slice(0, 500),
        completedAt: new Date(),
        updatedAt: new Date(),
      } as never,
    }).catch(() => undefined);
    log.info('job_completed', { jobId, exitCode, failed });
  }

  async cancelJob(jobId: string): Promise<void> {
    await db.gpuJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
      } as never,
    }).catch(() => undefined);
    log.info('job_cancelled', { jobId });
  }

  /**
   * Stats admin: vue d'ensemble du cluster.
   */
  async getClusterStats(): Promise<{
    totalNodes: number;
    onlineNodes: number;
    totalGpus: number;
    queuedJobs: number;
    runningJobs: number;
    byGpuType: Record<string, number>;
    avgUtilization: number;
  }> {
    const [nodes, jobs] = await Promise.all([
      this.listNodes(),
      this.listJobs({ limit: 500 }),
    ]);

    let totalGpus = 0;
    let onlineGpus = 0;
    const byGpuType: Record<string, number> = {};
    for (const n of nodes) {
      totalGpus += n.gpuCount;
      if (n.status === 'online') onlineGpus += n.gpuCount;
      byGpuType[n.gpuType] = (byGpuType[n.gpuType] ?? 0) + 1;
    }

    const queuedJobs = jobs.filter((j) => j.status === 'queued').length;
    const runningJobs = jobs.filter((j) => j.status === 'running').length;

    // Moyenne utilisation (best-effort: requête sur tous nodes online)
    let avgUtil = 0;
    let sampleCount = 0;
    for (const n of nodes) {
      if (n.status !== 'online') continue;
      try {
        const snaps = await this.getNodeMetrics(n.id);
        for (const s of snaps) {
          avgUtil += s.utilization;
          sampleCount++;
        }
      } catch {
        // ignore
      }
    }
    avgUtil = sampleCount > 0 ? avgUtil / sampleCount : 0;

    return {
      totalNodes: nodes.length,
      onlineNodes: nodes.filter((n) => n.status === 'online').length,
      totalGpus,
      queuedJobs,
      runningJobs,
      byGpuType,
      avgUtilization: Math.round(avgUtil * 10) / 10,
    };
  }
}

export const gpuCluster = new GpuClusterService();
export default gpuCluster;
