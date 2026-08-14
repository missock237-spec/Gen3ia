import { createLogger } from '@/lib/logger';
import { ComputeBackend } from './engine';

const log = createLogger('compute-pipeline');

enum PipelineStage {
  INPUT_VALIDATION = 'input_validation',
  DATA_PREPARATION = 'data_preparation',
  COMPUTATION = 'computation',
  POST_PROCESSING = 'post_processing',
  RESULT_ASSEMBLY = 'result_assembly',
}

export interface PipelineStep<T = unknown, R = unknown> {
  name: string;
  stage: PipelineStage;
  execute: (input: T, context: PipelineContext) => Promise<R>;
  timeoutMs: number;
  retryCount: number;
  fallback?: (input: T, context: PipelineContext, error: Error) => Promise<R>;
}

export interface PipelineContext {
  operation: string;
  backend: ComputeBackend;
  inputSize: number;
  startTime: number;
  stepResults: Map<string, unknown>;
  abortSignal: AbortSignal;
  metadata: Record<string, unknown>;
}

export interface PipelineResult<T> {
  success: boolean;
  data: T | null;
  steps: PipelineStepResult[];
  totalDurationMs: number;
  backend: ComputeBackend;
  error?: string;
  partialResult?: T;
}

interface PipelineStepResult {
  name: string;
  stage: PipelineStage;
  durationMs: number;
  success: boolean;
  error?: string;
  retries: number;
  outputSize?: number;
}

const DEFAULT_STEP_TIMEOUT_MS = 15_000;
const DEFAULT_STEP_RETRIES = 2;

export class OperationPipeline {
  private steps: PipelineStep[] = [];
  private abortController: AbortController = new AbortController();

  constructor(steps?: PipelineStep[]) {
    if (steps) this.steps = steps;
  }

  addStep(step: PipelineStep): void {
    const existingIndex = this.steps.findIndex(s => s.name === step.name);
    if (existingIndex >= 0) {
      this.steps[existingIndex] = step;
    } else {
      this.steps.push(step);
    }
  }

  removeStep(name: string): boolean {
    const index = this.steps.findIndex(s => s.name === name);
    if (index >= 0) {
      this.steps.splice(index, 1);
      return true;
    }
    return false;
  }

  getSteps(): PipelineStep[] {
    return [...this.steps];
  }

  getStepsByStage(stage: PipelineStage): PipelineStep[] {
    return this.steps.filter(s => s.stage === stage);
  }

  clearSteps(): void {
    this.steps = [];
  }

  abort(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
    log.warn('Pipeline aborted');
  }

  async execute<T>(initialInput: unknown, backend: ComputeBackend, operation: string): Promise<PipelineResult<T>> {
    const startTime = performance.now();
    const stepResults: PipelineStepResult[] = [];
    const contextResults = new Map<string, unknown>();

    const context: PipelineContext = {
      operation,
      backend,
      inputSize: this.estimateSize(initialInput),
      startTime: Date.now(),
      stepResults: contextResults,
      abortSignal: this.abortController.signal,
      metadata: {},
    };

    const orderedSteps = this.steps.sort((a, b) => {
      const order: Record<PipelineStage, number> = {
        [PipelineStage.INPUT_VALIDATION]: 0,
        [PipelineStage.DATA_PREPARATION]: 1,
        [PipelineStage.COMPUTATION]: 2,
        [PipelineStage.POST_PROCESSING]: 3,
        [PipelineStage.RESULT_ASSEMBLY]: 4,
      };
      return (order[a.stage] || 0) - (order[b.stage] || 0);
    });

    let currentInput: unknown = initialInput;
    let lastSuccessfulOutput: unknown = null;

    for (const step of orderedSteps) {
      if (this.abortController.signal.aborted) {
        return {
          success: false,
          data: null,
          steps: stepResults,
          totalDurationMs: performance.now() - startTime,
          backend,
          error: 'Pipeline aborted',
          partialResult: lastSuccessfulOutput as T | undefined,
        };
      }

      const stepStart = performance.now();
      let stepSuccess = false;
      let stepError: string | undefined;
      let stepOutput: unknown = null;
      let retriesUsed = 0;

      for (let attempt = 0; attempt <= Math.max(step.retryCount, DEFAULT_STEP_RETRIES); attempt++) {
        if (attempt > 0) retriesUsed++;

        try {
          const timeoutMs = step.timeoutMs || DEFAULT_STEP_TIMEOUT_MS;
          const result = await this.executeWithTimeout(step, currentInput, context, timeoutMs);
          stepOutput = result;
          stepSuccess = true;
          contextResults.set(step.name, result);
          lastSuccessfulOutput = result;
          break;
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          if (attempt < Math.max(step.retryCount, DEFAULT_STEP_RETRIES)) {
            const backoffMs = Math.min(100 * Math.pow(2, attempt), 2000);
            log.warn(`Pipeline step ${step.name} failed, retrying`, {
              attempt: attempt + 1,
              maxRetries: Math.max(step.retryCount, DEFAULT_STEP_RETRIES),
              backoffMs,
              error: errMsg,
            });
            await new Promise(r => setTimeout(r, backoffMs));
          } else if (step.fallback) {
            try {
              const fallbackError = error instanceof Error ? error : new Error(String(error));
              stepOutput = await step.fallback(currentInput, context, fallbackError);
              stepSuccess = true;
              contextResults.set(step.name, stepOutput);
              lastSuccessfulOutput = stepOutput;
              log.info(`Pipeline step ${step.name} fallback succeeded`);
            } catch (fallbackError) {
              stepError = `Fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`;
            }
          } else {
            stepError = errMsg;
          }
        }
      }

      const stepDuration = performance.now() - stepStart;
      stepResults.push({
        name: step.name,
        stage: step.stage,
        durationMs: Math.round(stepDuration),
        success: stepSuccess,
        error: stepError,
        retries: retriesUsed,
        outputSize: stepSuccess ? this.estimateSize(stepOutput) : undefined,
      });

      if (!stepSuccess) {
        return {
          success: false,
          data: null,
          steps: stepResults,
          totalDurationMs: performance.now() - startTime,
          backend,
          error: `Pipeline failed at step ${step.name}: ${stepError}`,
          partialResult: lastSuccessfulOutput as T | undefined,
        };
      }

      currentInput = stepOutput;
    }

    return {
      success: true,
      data: currentInput as T,
      steps: stepResults,
      totalDurationMs: performance.now() - startTime,
      backend,
    };
  }

  async executeBatch<T>(
    inputs: unknown[],
    backend: ComputeBackend,
    operation: string
  ): Promise<PipelineResult<T>[]> {
    log.info(`Executing batch pipeline: ${inputs.length} inputs`);

    const results: PipelineResult<T>[] = [];
    const batchSize = Math.min(inputs.length, backend === 'cpu' ? 4 : backend === 'webworker' ? 8 : 16);

    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(input => this.execute<T>(input, backend, operation))
      );
      results.push(...batchResults);

      if (i + batchSize < inputs.length) {
        log.info(`Batch progress: ${Math.min(i + batchSize, inputs.length)}/${inputs.length}`);
      }
    }

    return results;
  }

  private async executeWithTimeout(
    step: PipelineStep,
    input: unknown,
    context: PipelineContext,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step ${step.name} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      step.execute(input, context)
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private estimateSize(data: unknown): number {
    if (data === null || data === undefined) return 0;
    if (typeof data === 'number') return 8;
    if (typeof data === 'boolean') return 4;
    if (typeof data === 'string') return data.length * 2;
    if (data instanceof Float32Array || data instanceof Int32Array) return data.byteLength;
    if (Array.isArray(data)) {
      return data.reduce((sum, item) => sum + this.estimateSize(item), 0);
    }
    if (typeof data === 'object') {
      try {
        return JSON.stringify(data).length * 2;
      } catch {
        return 1024;
      }
    }
    return 64;
  }

  static createDefaultPipeline(operation: string): OperationPipeline {
    const pipeline = new OperationPipeline();

    pipeline.addStep({
      name: 'validate_input',
      stage: PipelineStage.INPUT_VALIDATION,
      execute: async (input: unknown) => {
        if (input === null || input === undefined) {
          throw new Error('Input cannot be null or undefined');
        }
        if (Array.isArray(input) && input.length === 0) {
          throw new Error('Input array cannot be empty');
        }
        if (input instanceof Float32Array && input.length === 0) {
          throw new Error('Float32Array input cannot be empty');
        }
        return input;
      },
      timeoutMs: 1000,
      retryCount: 1,
    });

    pipeline.addStep({
      name: 'prepare_data',
      stage: PipelineStage.DATA_PREPARATION,
      execute: async (input: unknown) => {
        if (input instanceof Float32Array || input instanceof Int32Array) {
          return input;
        }
        if (Array.isArray(input)) {
          return new Float32Array(input);
        }
        if (typeof input === 'number') {
          return new Float32Array([input]);
        }
        throw new Error(`Unsupported input type for operation ${operation}: ${typeof input}`);
      },
      timeoutMs: 2000,
      retryCount: 1,
    });

    pipeline.addStep({
      name: 'compute',
      stage: PipelineStage.COMPUTATION,
      execute: async (input: unknown) => {
        return input;
      },
      timeoutMs: 20000,
      retryCount: 2,
    });

    pipeline.addStep({
      name: 'normalize_result',
      stage: PipelineStage.POST_PROCESSING,
      execute: async (input: unknown) => {
        return input;
      },
      timeoutMs: 2000,
      retryCount: 1,
    });

    return pipeline;
  }
}

export function createOperationPipeline(steps?: PipelineStep[]): OperationPipeline {
  return new OperationPipeline(steps);
}