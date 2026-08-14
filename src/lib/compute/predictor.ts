import { createLogger } from '@/lib/logger';
import { ComputeCache } from './cache';
// @ts-ignore
import { OperationPipeline, PipelineStep, PipelineStage } from './pipeline';
import { ComputeEngine, ComputeBackend, ComputeConfig } from './engine';

const log = createLogger('compute-predictor');

interface BackendPerformance {
  backend: ComputeBackend;
  operation: string;
  inputSize: number;
  avgDurationMs: number;
  samples: number;
  successRate: number;
  lastTestedAt: number;
}

interface PredictionResult {
  recommended: ComputeBackend;
  confidence: number;
  estimatedDurationMs: number;
  alternatives: ComputeBackend[];
}

const PERFORMANCE_HISTORY_KEY = 'perf:history';
const HISTORY_MAX_ENTRIES = 1000;
const MIN_SAMPLES_FOR_PREDICTION = 3;
const CONFIDENCE_THRESHOLD = 0.7;

export class ComputePredictor {
  private performanceHistory: Map<string, BackendPerformance> = new Map();
  private engine: ComputeEngine;

  constructor(engine: ComputeEngine) {
    this.engine = engine;
  }

  async recordPerformance(
    backend: ComputeBackend,
    operation: string,
    input: Float32Array | Int32Array | number[],
    durationMs: number,
    success: boolean
  ): Promise<void> {
    const inputSize = input instanceof Float32Array || input instanceof Int32Array
      ? input.length
      : (input as number[]).length;

    const key = this.buildKey(backend, operation, inputSize);
    const existing = this.performanceHistory.get(key);

    const entry: BackendPerformance = existing || {
      backend,
      operation,
      inputSize,
      avgDurationMs: 0,
      samples: 0,
      successRate: 1,
      lastTestedAt: Date.now(),
    };

    entry.samples++;
    entry.avgDurationMs = (entry.avgDurationMs * (entry.samples - 1) + durationMs) / entry.samples;
    entry.successRate = (entry.successRate * (entry.samples - 1) + (success ? 1 : 0)) / entry.samples;
    entry.lastTestedAt = Date.now();

    this.performanceHistory.set(key, entry);

    if (this.performanceHistory.size > HISTORY_MAX_ENTRIES) {
      const entries = Array.from(this.performanceHistory.entries())
        .sort((a, b) => a[1].lastTestedAt - b[1].lastTestedAt);
      const toDelete = entries.slice(0, Math.floor(HISTORY_MAX_ENTRIES * 0.2));
      for (const [k] of toDelete) {
        this.performanceHistory.delete(k);
      }
    }
  }

  async predictBestBackend(
    operation: string,
    input: Float32Array | Int32Array | number[],
    availableBackends: ComputeBackend[]
  ): Promise<PredictionResult> {
    const inputSize = input instanceof Float32Array || input instanceof Int32Array
      ? input.length
      : (input as number[]).length;

    const scores: Array<{ backend: ComputeBackend; score: number; estimatedDurationMs: number; confidence: number }> = [];

    for (const backend of availableBackends) {
      const key = this.buildKey(backend, operation, inputSize);
      const perf = this.performanceHistory.get(key);

      if (perf && perf.samples >= MIN_SAMPLES_FOR_PREDICTION) {
        const score = (perf.successRate * 0.6) + ((1 / (perf.avgDurationMs + 1)) * 1000 * 0.4);
        scores.push({
          backend,
          score,
          estimatedDurationMs: Math.round(perf.avgDurationMs),
          confidence: Math.min(1, perf.samples / 20),
        });
      } else {
        const estimatedBase = this.getEstimatedBaseDuration(backend, operation, inputSize);
        scores.push({
          backend,
          score: estimatedBase.score,
          estimatedDurationMs: estimatedBase.durationMs,
          confidence: 0.2,
        });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0) {
      return {
        recommended: 'cpu' as ComputeBackend,
        confidence: 0,
        estimatedDurationMs: 1000,
        alternatives: [],
      };
    }

    const best = scores[0];
    return {
      recommended: best.backend,
      confidence: best.confidence,
      estimatedDurationMs: best.estimatedDurationMs,
      alternatives: scores.slice(1).map(s => s.backend),
    };
  }

  getPerformanceReport(): BackendPerformance[] {
    return Array.from(this.performanceHistory.values())
      .sort((a, b) => b.samples - a.samples)
      .slice(0, 50);
  }

  resetHistory(): void {
    this.performanceHistory.clear();
    log.info('Performance history reset');
  }

  private buildKey(backend: ComputeBackend, operation: string, inputSize: number): string {
    const bucketSize = this.getBucketSize(inputSize);
    return `${backend}:${operation}:${bucketSize}`;
  }

  private getBucketSize(inputSize: number): number {
    if (inputSize <= 64) return 64;
    if (inputSize <= 256) return 256;
    if (inputSize <= 1024) return 1024;
    if (inputSize <= 4096) return 4096;
    if (inputSize <= 16384) return 16384;
    if (inputSize <= 65536) return 65536;
    return 262144;
  }

  private getEstimatedBaseDuration(
    backend: ComputeBackend,
    operation: string,
    inputSize: number
  ): { durationMs: number; score: number } {
    const complexityByOperation: Record<string, number> = {
      vector_add: 1,
      vector_multiply: 1,
      sigmoid: 2,
      relu: 1,
      tanh: 2,
      softmax: 3,
      normalize: 2,
      matrix_multiply: 4,
      layer_norm: 3,
      attention: 5,
      conv2d: 4,
    };

    const complexity = complexityByOperation[operation] || 2;
    const logSize = Math.log2(Math.max(inputSize, 1));

// @ts-ignore
    const backendFactors: Record<ComputeBackend, number> = {
      webgpu: 0.01,
      webworker: 0.3,
      cpu: 1.0,
    };

    const factor = backendFactors[backend] || 1.0;
    const estimatedMs = Math.round(complexity * logSize * 10 * factor);
    const score = (1 / (estimatedMs + 1)) * 1000;

    return { durationMs: Math.max(1, estimatedMs), score };
  }
}

export function createComputePredictor(engine: ComputeEngine): ComputePredictor {
  return new ComputePredictor(engine);
}