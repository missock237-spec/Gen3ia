import { createLogger } from '@/lib/logger';
import { ComputeEngine, ComputeBackend, ComputeConfig, ComputeResult, createComputeEngine } from './engine';
import { ComputeCache, createComputeCache } from './cache';
import { OperationPipeline, createOperationPipeline } from './pipeline';
import { ComputePredictor, createComputePredictor } from './predictor';

const log = createLogger('compute-engine-v2');

export interface ComputeRequest<T = unknown> {
  operation: string;
  input: Float32Array | Int32Array | number[];
  options?: {
    backend?: ComputeBackend;
    shaderName?: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
    cacheTTLMs?: number;
    useCache?: boolean;
    usePredictor?: boolean;
    pipeline?: OperationPipeline;
    progressive?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: number, partial: unknown) => void;
  };
}

export interface ComputeBatchRequest {
  operations: ComputeRequest[];
  options?: {
    backend?: ComputeBackend;
    useCache?: boolean;
    usePredictor?: boolean;
  };
}

export interface ComputeEngineV2Config extends ComputeConfig {
  maxCacheEntries: number;
  maxCacheSizeMB: number;
  enablePredictor: boolean;
  enableProgressive: boolean;
  defaultPipeline: boolean;
}

const DEFAULT_V2_CONFIG: ComputeEngineV2Config = {
  preferredBackend: 'webgpu',
  maxWorkers: 4,
  enableWasmFallback: true,
  timeoutMs: 30_000,
  maxCacheEntries: 1000,
  maxCacheSizeMB: 50,
  enablePredictor: true,
  enableProgressive: true,
  defaultPipeline: true,
};

function computeRequestHash(request: ComputeRequest): string {
  const { operation, input, options } = request;
  const inputArr = input instanceof Float32Array || input instanceof Int32Array
    ? Array.from(input.slice(0, 32))
    : (input as number[]).slice(0, 32);
  const inputLength = input instanceof Float32Array || input instanceof Int32Array
    ? input.length
    : (input as number[]).length;
  return `${operation}:${inputLength}:${inputArr.join(',')}:${options?.shaderName || ''}:${options?.backend || ''}`;
}

function computeBatchHash(requests: ComputeRequest[]): string {
  return requests.map(r => computeRequestHash(r)).join('|');
}

export class ComputeEngineV2 {
  private config: ComputeEngineV2Config;
  private engine: ComputeEngine;
  private cache: ComputeCache;
  private predictor: ComputePredictor | null = null;
  private pipelines: Map<string, OperationPipeline> = new Map();
  private initialized = false;
  private totalOperations = 0;
  private cacheHits = 0;
  private predictionHits = 0;

  constructor(config?: Partial<ComputeEngineV2Config>) {
    const cpuCores = typeof navigator !== 'undefined' && navigator?.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
    this.config = { ...DEFAULT_V2_CONFIG, maxWorkers: cpuCores, ...config };
    this.engine = createComputeEngine({
      preferredBackend: this.config.preferredBackend,
      maxWorkers: this.config.maxWorkers,
      enableWasmFallback: this.config.enableWasmFallback,
      timeoutMs: this.config.timeoutMs,
    });
    this.cache = createComputeCache({
      maxEntries: this.config.maxCacheEntries,
      maxSizeMB: this.config.maxCacheSizeMB,
    });
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    const engineReady = await this.engine.initialize();
    if (!engineReady) {
      log.warn('Engine initialization returned false, continuing with defaults');
    }

    this.predictor = this.config.enablePredictor ? createComputePredictor(this.engine) : null;

    if (this.config.defaultPipeline) {
      const defaultPipeline = OperationPipeline.createDefaultPipeline('*');
      this.pipelines.set('*', defaultPipeline);
    }

    this.initialized = true;
    log.info('ComputeEngineV2 initialized', {
      backend: this.getActiveBackend(),
      cacheEnabled: true,
      predictorEnabled: !!this.predictor,
      progressiveEnabled: this.config.enableProgressive,
    });

    return true;
  }

  async compute<T = unknown>(request: ComputeRequest): Promise<ComputeResult<T>> {
    if (!this.initialized) await this.initialize();

    this.totalOperations++;
    const startTime = performance.now();

    const { operation, input, options } = request;
    const useCache = options?.useCache !== false;
    const usePredictor = options?.usePredictor !== false && !!this.predictor;

    if (useCache) {
      const hash = computeRequestHash(request);
      const cached = this.cache.get<ComputeResult<T>>(hash);
      if (cached) {
        this.cacheHits++;
        log.info('Cache hit', { operation, size: input.length });
        return cached;
      }
    }

// @ts-ignore — type narrowing pending, see refactor ticket
    let selectedBackend: ComputeBackend = options?.backend || this.config.preferredBackend;
    let predictionConfidence = 0;

// @ts-ignore — type narrowing pending, see refactor ticket
    if (usePredictor && this.predictor && selectedBackend === 'auto') {
      const availableBackends: ComputeBackend[] = ['webgpu', 'webworker', 'cpu'];
      const prediction = await this.predictor.predictBestBackend(operation, input, availableBackends);
      selectedBackend = prediction.recommended;
      predictionConfidence = prediction.confidence;

      if (predictionConfidence >= 0.7) {
        this.predictionHits++;
        log.info('Predictor chose backend', {
          backend: selectedBackend,
          confidence: predictionConfidence,
          estimatedMs: prediction.estimatedDurationMs,
        });
      }
    }

    const pipeline = options?.pipeline || this.pipelines.get(operation) || this.pipelines.get('*');

    let result: ComputeResult<T>;

    if (pipeline && selectedBackend !== 'cpu') {
      log.info('Executing with pipeline', { operation, backend: selectedBackend });

      const pipelineResult = await pipeline.execute<T>(input, selectedBackend, operation);

      if (pipelineResult.success) {
        result = {
          success: true,
// @ts-ignore — type narrowing pending, see refactor ticket
          data: pipelineResult.data,
          backend: selectedBackend,
          durationMs: Math.round(pipelineResult.totalDurationMs),
        };
      } else {
        log.warn('Pipeline failed, falling back to direct computation', {
          operation,
          error: pipelineResult.error,
        });
        result = await this.engine.compute<T>(operation, input, { backend: selectedBackend });
      }

      if (this.predictor) {
        await this.predictor.recordPerformance(
          selectedBackend,
          operation,
          input,
          pipelineResult.totalDurationMs,
          pipelineResult.success
        );
      }
    } else {
      result = await this.engine.compute<T>(operation, input, { backend: selectedBackend });

      if (this.predictor) {
        await this.predictor.recordPerformance(
          selectedBackend,
          operation,
          input,
          result.durationMs,
          result.success
        );
      }
    }

    if (useCache && result.success) {
      const hash = computeRequestHash(request);
      this.cache.set(hash, result, options?.priority || 'normal', options?.cacheTTLMs);
    }

    return result;
  }

  async computeBatch<T = unknown>(request: ComputeBatchRequest): Promise<ComputeResult<T>[]> {
    if (!this.initialized) await this.initialize();

    const startTime = performance.now();
    const { operations, options } = request;

    log.info(`Executing batch: ${operations.length} operations`);

    const useCache = options?.useCache !== false;

    const results: ComputeResult<T>[] = [];
    const toCompute: Array<{ index: number; request: ComputeRequest }> = [];

    if (useCache) {
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        const hash = computeRequestHash(op);
        const cached = this.cache.get<ComputeResult<T>>(hash);
        if (cached) {
          this.cacheHits++;
          results[i] = cached;
        } else {
          toCompute.push({ index: i, request: op });
        }
      }
    } else {
      for (let i = 0; i < operations.length; i++) {
        toCompute.push({ index: i, request: operations[i] });
      }
    }

    if (toCompute.length > 0) {
      const batchSize = options?.backend === 'webworker'
// @ts-ignore — type narrowing pending, see refactor ticket
        ? Math.min(toCompute.length, this.config.maxWorkers * 2)
        : Math.min(toCompute.length, 4);

      for (let i = 0; i < toCompute.length; i += batchSize) {
        const batch = toCompute.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(item => this.compute<T>({
            ...item.request,
            options: { ...item.request.options, useCache: false, usePredictor: false },
          }))
        );

        for (let j = 0; j < batch.length; j++) {
          results[batch[j].index] = batchResults[j];
        }
      }
    }

    log.info('Batch completed', {
      total: operations.length,
      computed: toCompute.length,
      cached: operations.length - toCompute.length,
      totalDurationMs: Math.round(performance.now() - startTime),
    });

    return results;
  }

  registerPipeline(name: string, pipeline: OperationPipeline): void {
    this.pipelines.set(name, pipeline);
    log.info('Pipeline registered', { name });
  }

  getPipeline(name: string): OperationPipeline | undefined {
    return this.pipelines.get(name);
  }

  getCache(): ComputeCache {
    return this.cache;
  }

  getEngine(): ComputeEngine {
    return this.engine;
  }

  getPredictor(): ComputePredictor | null {
    return this.predictor;
  }

  getActiveBackend(): ComputeBackend {
    return this.engine.gpuDevice ? 'webgpu'
      : this.engine.workerPool.length > 0 ? 'webworker'
      : 'cpu';
  }

  getStats(): {
    totalOperations: number;
    cacheHits: number;
    predictionHits: number;
    activeBackend: ComputeBackend;
    cacheStats: ReturnType<ComputeCache['getStats']>;
    registeredPipelines: string[];
  } {
    return {
      totalOperations: this.totalOperations,
      cacheHits: this.cacheHits,
      predictionHits: this.predictionHits,
      activeBackend: this.getActiveBackend(),
      cacheStats: this.cache.getStats(),
      registeredPipelines: Array.from(this.pipelines.keys()),
    };
  }

  cleanup(): void {
    const removed = this.cache.cleanup();
    if (removed > 0) log.info('Cache cleaned up', { removed });
  }

  destroy(): void {
    this.cache.clear();
    this.pipelines.clear();
    this.engine.destroy();
    this.initialized = false;
    log.info('ComputeEngineV2 destroyed');
  }
}

export function createComputeEngineV2(config?: Partial<ComputeEngineV2Config>): ComputeEngineV2 {
  return new ComputeEngineV2(config);
}