// ============================================================
// TRAINING PIPELINE — Orchestration de fine-tuning
// ------------------------------------------------------------
//  Permet à Gen3ia d'offrir du fine-tuning (à la NVIDIA Nemo / Triton):
//    - Versioning des datasets
//    - Soumission de jobs de fine-tuning (LoRA, QLoRA, full)
//    - Suivi des runs (status, loss, metrics, logs)
//    - Backend abstrait (AutoTrain, LoRA-server, ou cluster distant)
//    - Modèle fine-tuné automatiquement enregistré dans le Model Registry
//
//  Persistance: Firestore (collections "training_datasets", "training_runs").
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { modelRegistry } from '@/lib/model-registry';

const log = createLogger('training-pipeline');

// ─── Types ────────────────────────────────────────────────────────────────

export type DatasetFormat = 'jsonl' | 'csv' | 'parquet' | 'hf-dataset';
export type DatasetStatus = 'draft' | 'validated' | 'deprecated';

export interface TrainingDataset {
  id: string;
  name: string;
  description?: string;
  format: DatasetFormat;
  /** Nombre d'exemples */
  size: number;
  /** Hugging Face dataset ID (si source HF hub) */
  hfDatasetId?: string;
  /** URL de stockage (GCS / S3 / Firebase Storage) */
  storageUrl?: string;
  /** Métadonnées: schema, splits, hash MD5 */
  metadata?: Record<string, unknown>;
  /** Tags libres */
  tags?: string[];
  status: DatasetStatus;
  ownerId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TrainingMethod = 'lora' | 'qlora' | 'full' | 'dpo' | 'ppo' | 'sft';
export type TrainingRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface TrainingHyperparams {
  method: TrainingMethod;
  /** LoRA rank (pour lora/qlora) */
  loraRank?: number;
  /** LoRA alpha */
  loraAlpha?: number;
  learningRate: number;
  numEpochs: number;
  perDeviceBatchSize: number;
  gradientAccumulationSteps?: number;
  warmupSteps?: number;
  maxSeqLength?: number;
  /** Modèle de base à fine-tuner */
  baseModelId: string;
  /** GPU type requis (A100, H100, T4, ...) */
  gpuType?: string;
  /** Nombre de GPUs */
  numGpus?: number;
  /** Quantization (4bit | 8bit | none) */
  quantization?: '4bit' | '8bit' | 'none';
}

export interface TrainingRun {
  id: string;
  /** ID du dataset */
  datasetId: string;
  /** ID utilisateur */
  ownerId: string;
  /** Hyperparamètres */
  hyperparams: TrainingHyperparams;
  /** Statut */
  status: TrainingRunStatus;
  /** Logs (stdout du process de training) */
  logs?: string;
  /** Métriques: loss, eval_loss, lr, epoch — collected per step */
  metrics?: Array<{
    step: number;
    epoch: number;
    loss: number;
    evalLoss?: number;
    learningRate: number;
    timestamp: string;
  }>;
  /** Nom du modèle final produit */
  outputModelName?: string;
  /** ID dans le Model Registry du modèle produit */
  outputModelRegistryId?: string;
  /** URL de stockage des checkpoints */
  checkpointUrl?: string;
  /** Erreur éventuelle */
  errorMessage?: string;
  /** Progression (0..100) */
  progress?: number;
  /** Timestamps */
  queuedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Service ──────────────────────────────────────────────────────────────

class TrainingPipelineService {
  // ─── Datasets ─────────────────────────────────────────────────────────

  async createDataset(params: {
    name: string;
    description?: string;
    format: DatasetFormat;
    size: number;
    hfDatasetId?: string;
    storageUrl?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
    ownerId: string;
  }): Promise<TrainingDataset> {
    const now = new Date();
    const id = `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const dataset: TrainingDataset = {
      id,
      name: params.name,
      description: params.description,
      format: params.format,
      size: params.size,
      hfDatasetId: params.hfDatasetId,
      storageUrl: params.storageUrl,
      metadata: params.metadata,
      tags: params.tags ?? [],
      status: 'draft',
      ownerId: params.ownerId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await db.trainingDataset.create({ data: dataset as never }).catch((e: unknown) => {
      log.warn('dataset_create_failed', { id, error: e instanceof Error ? e.message : '' });
    });

    log.info('dataset_created', { id, name: params.name, format: params.format });
    return dataset;
  }

  async getDataset(id: string): Promise<TrainingDataset | null> {
    const doc = (await db.trainingDataset.findUnique({ where: { id } }).catch(() => null)) as
      | Record<string, unknown>
      | null;
    return doc as unknown as TrainingDataset | null;
  }

  async listDatasets(ownerId: string, limit = 50): Promise<TrainingDataset[]> {
    const docs = (await db.trainingDataset.findMany({
      where: [{ field: 'ownerId', op: '==', value: ownerId }],
      limit,
    }).catch(() => [])) as unknown as Array<Record<string, unknown>>;
    return docs as unknown as TrainingDataset[];
  }

  async validateDataset(id: string): Promise<void> {
    await db.trainingDataset.update({
      where: { id },
      data: { status: 'validated', updatedAt: new Date() } as never,
    }).catch(() => undefined);
    log.info('dataset_validated', { id });
  }

  // ─── Runs ────────────────────────────────────────────────────────────

  async submitRun(params: {
    datasetId: string;
    ownerId: string;
    hyperparams: TrainingHyperparams;
  }): Promise<TrainingRun> {
    const dataset = await this.getDataset(params.datasetId);
    if (!dataset) {
      throw new Error(`Dataset introuvable: ${params.datasetId}`);
    }
    if (dataset.status !== 'validated') {
      throw new Error('Le dataset doit être validé avant fine-tuning');
    }

    const now = new Date();
    const id = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const run: TrainingRun = {
      id,
      datasetId: params.datasetId,
      ownerId: params.ownerId,
      hyperparams: params.hyperparams,
      status: 'queued',
      metrics: [],
      progress: 0,
      queuedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.trainingRun.create({ data: run as never }).catch((e: unknown) => {
      log.warn('run_submit_failed', { id, error: e instanceof Error ? e.message : '' });
    });

    log.info('run_queued', {
      id,
      datasetId: params.datasetId,
      method: params.hyperparams.method,
      baseModelId: params.hyperparams.baseModelId,
    });
    return run;
  }

  async getRun(id: string): Promise<TrainingRun | null> {
    const doc = (await db.trainingRun.findUnique({ where: { id } }).catch(() => null)) as
      | Record<string, unknown>
      | null;
    return doc as unknown as TrainingRun | null;
  }

  async listRuns(ownerId: string, limit = 50): Promise<TrainingRun[]> {
    const docs = (await db.trainingRun.findMany({
      where: [{ field: 'ownerId', op: '==', value: ownerId }],
      limit,
    }).catch(() => [])) as unknown as Array<Record<string, unknown>>;
    return docs as unknown as TrainingRun[];
  }

  /**
   * Met à jour le statut d'un run (appelée par le worker / scheduler GPU).
   */
  async updateRunStatus(
    id: string,
    status: TrainingRunStatus,
    extra?: Partial<TrainingRun>,
  ): Promise<void> {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
      ...(extra ?? {}),
    };

    if (status === 'running' && !extra?.startedAt) {
      updates.startedAt = new Date();
    }
    if ((status === 'completed' || status === 'failed' || status === 'cancelled') && !extra?.completedAt) {
      updates.completedAt = new Date();
    }

    await db.trainingRun.update({
      where: { id },
      data: updates as never,
    }).catch(() => undefined);
    log.info('run_status_updated', { id, status });
  }

  /**
   * Ajoute un point de métrique (loss, eval_loss, lr, epoch) à un run.
   * Appelée par le worker de training à chaque step.
   */
  async appendMetric(
    runId: string,
    metric: { step: number; epoch: number; loss: number; evalLoss?: number; learningRate: number },
  ): Promise<void> {
    const run = await this.getRun(runId);
    if (!run) return;
    const newMetrics = [...(run.metrics ?? []), { ...metric, timestamp: new Date().toISOString() }];

    // Calculer la progression (estimation basée sur epoch / numEpochs)
    const numEpochs = run.hyperparams.numEpochs || 1;
    const progress = Math.min(100, Math.round((metric.epoch / numEpochs) * 100));

    await db.trainingRun.update({
      where: { id: runId },
      data: {
        metrics: newMetrics,
        progress,
        updatedAt: new Date(),
      } as never,
    }).catch(() => undefined);

    log.info('metric_appended', { runId, step: metric.step, loss: metric.loss, progress });
  }

  /**
   * Finalise un run complété: enregistre le modèle dans le Model Registry.
   */
  async finalizeRun(runId: string, output: { modelName: string; checkpointUrl?: string; metadata?: Record<string, unknown> }): Promise<TrainingRun | null> {
    const run = await this.getRun(runId);
    if (!run) return null;

    // Enregistrer dans le Model Registry
    const registryEntry = await modelRegistry.upsert({
      name: output.modelName,
      providerModelId: output.modelName,
      provider: 'custom',
      type: 'llm',
      capabilities: ['chat', 'completion', 'function-calling'],
      contextWindow: null,
      pricing: { isFree: false },
      license: 'proprietary',
      tags: ['fine-tuned', `base:${run.hyperparams.baseModelId}`, `method:${run.hyperparams.method}`],
      description: `Modèle fine-tuné à partir de ${run.hyperparams.baseModelId} via ${run.hyperparams.method}`,
      status: 'active',
    });

    const updated: TrainingRun = {
      ...run,
      status: 'completed',
      outputModelName: output.modelName,
      outputModelRegistryId: registryEntry.id,
      checkpointUrl: output.checkpointUrl,
      progress: 100,
      completedAt: new Date(),
      updatedAt: new Date(),
    };

    await db.trainingRun.update({
      where: { id: runId },
      data: updated as never,
    }).catch(() => undefined);

    log.info('run_finalized', { runId, outputModelName: output.modelName, registryId: registryEntry.id });
    return updated;
  }

  /**
   * Stats admin: nombre de runs par statut.
   */
  async getStats(): Promise<{ total: number; byStatus: Record<string, number>; totalDatasets: number }> {
    const all = await db.trainingRun.findMany({ limit: 500 }).catch(() => []);
    const datasets = await db.trainingDataset.findMany({ limit: 500 }).catch(() => []);

    const byStatus: Record<string, number> = {};
    for (const r of all as Array<Record<string, unknown>>) {
      const s = String(r.status ?? 'unknown');
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }

    return {
      total: all.length,
      byStatus,
      totalDatasets: datasets.length,
    };
  }
}

export const trainingPipeline = new TrainingPipelineService();
export default trainingPipeline;
