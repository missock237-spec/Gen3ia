import { createLogger } from '@/lib/logger';

const log = createLogger('compute-engine');

export type ComputeBackend = 'webgpu' | 'webworker' | 'cpu';

export interface ComputeConfig {
  preferredBackend: ComputeBackend;
  maxWorkers: number;
  enableWasmFallback: boolean;
  timeoutMs: number;
}

export interface ComputeResult<T = unknown> {
  success: boolean;
  data: T | null;
  backend: ComputeBackend;
  durationMs: number;
  gpuUtilization?: number;
  error?: string;
}

const DEFAULT_CONFIG: ComputeConfig = {
  preferredBackend: 'webgpu',
  maxWorkers: navigator?.hardwareConcurrency || 4,
  enableWasmFallback: true,
  timeoutMs: 30_000,
};

export class ComputeEngine {
  private config: ComputeConfig;
  private gpuDevice: GPUDevice | null = null;
  private workerPool: Worker[] = [];
  private isInitialized = false;

  constructor(config?: Partial<ComputeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // Tentative WebGPU d'abord
    if (this.config.preferredBackend === 'webgpu' || this.config.preferredBackend === 'auto') {
      try {
        if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
          const adapter = await (navigator as any).gpu.requestAdapter();
          if (adapter) {
            this.gpuDevice = await adapter.requestDevice();
            log.info('WebGPU initialized', {
              adapter: adapter.name,
              features: Array.from(adapter.features || []),
            });
          }
        }
      } catch (err) {
        log.warn('WebGPU non disponible, fallback CPU', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Initialisation du pool de Workers
    if (typeof Worker !== 'undefined') {
      try {
        const workerCount = Math.min(this.config.maxWorkers, navigator?.hardwareConcurrency || 4);
        for (let i = 0; i < workerCount; i++) {
          const worker = new Worker(
            new URL('./worker-pool.ts', import.meta.url),
            { type: 'module' }
          );
          this.workerPool.push(worker);
        }
        log.info(`Worker pool initialized: ${this.workerPool.length} workers`);
      } catch (err) {
        log.warn('Web Workers non disponibles', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    this.isInitialized = true;
    return this.isInitialized;
  }

  async compute<T>(
    operation: string,
    input: Float32Array | Int32Array | number[],
    options?: { backend?: ComputeBackend; shaderName?: string }
  ): Promise<ComputeResult<T>> {
    const start = performance.now();
    const backend = options?.backend || this.config.preferredBackend;

    try {
      // 1. WebGPU - Calcul GPU natif
      if (backend === 'webgpu' && this.gpuDevice) {
        const result = await this.runWebGPU<T>(operation, input, options?.shaderName);
        if (result.success) {
          return { ...result, durationMs: performance.now() - start };
        }
      }

      // 2. Web Worker - Calcul parallélisé CPU
      if (backend === 'webworker' || backend === 'auto') {
        const result = await this.runWorker<T>(operation, input);
        if (result.success) {
          return { ...result, durationMs: performance.now() - start };
        }
      }

      // 3. Fallback CPU direct
      return {
        success: true,
        data: await this.runCPU<T>(operation, input),
        backend: 'cpu',
        durationMs: performance.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        backend,
        durationMs: performance.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runWebGPU<T>(
    operation: string,
    input: Float32Array | Int32Array | number[],
    shaderName?: string
  ): Promise<ComputeResult<T>> {
    if (!this.gpuDevice) throw new Error('WebGPU non initialisé');

    const device = this.gpuDevice;
    const data = input instanceof Float32Array || input instanceof Int32Array
      ? input
      : new Float32Array(input);

    // Buffer GPU pour les données d'entrée
    const inputBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(inputBuffer, 0, data);

    // Buffer GPU pour les résultats
    const outputBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const shaderModule = device.createShaderModule({
      code: this.getWGSLShader(operation, shaderName),
    });

    const computePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' },
    });

    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    const workgroupCount = Math.ceil(data.length / 64);
    passEncoder.dispatchWorkgroups(workgroupCount, 1, 1);
    passEncoder.end();

    // Copie du résultat
    const stagingBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    commandEncoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, data.byteLength);

    device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const resultArray = new Float32Array(stagingBuffer.getMappedRange());
    const result = Array.from(resultArray) as unknown as T;
    stagingBuffer.unmap();

    // Nettoyage
    inputBuffer.destroy();
    outputBuffer.destroy();
    stagingBuffer.destroy();

    return {
      success: true,
      data: result,
      backend: 'webgpu',
      durationMs: 0,
    };
  }

  private async runWorker<T>(operation: string, input: Float32Array | Int32Array | number[]): Promise<ComputeResult<T>> {
    if (this.workerPool.length === 0) throw new Error('Aucun worker disponible');

    const worker = this.workerPool[Math.floor(Math.random() * this.workerPool.length)];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker timeout')), this.config.timeoutMs);

      worker.postMessage({ operation, input: Array.from(input as any) });
      worker.onmessage = (event) => {
        clearTimeout(timeout);
        resolve({
          success: true,
          data: event.data as T,
          backend: 'webworker',
          durationMs: 0,
        });
      };
      worker.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });
  }

  private async runCPU<T>(operation: string, input: Float32Array | Int32Array | number[]): Promise<T> {
    const arr = Array.from(input as any);

    switch (operation) {
      case 'matrix_multiply':
        return this.matrixMultiply(arr as unknown as number[][]) as unknown as T;
      case 'vector_add':
        return arr.map(v => v + 1) as unknown as T;
      case 'vector_multiply':
        return arr.map(v => v * 2) as unknown as T;
      case 'normalize': {
        const max = Math.max(...arr.map(Math.abs));
        return arr.map(v => v / (max || 1)) as unknown as T;
      }
      case 'sigmoid':
        return arr.map(v => 1 / (1 + Math.exp(-v))) as unknown as T;
      case 'relu':
        return arr.map(v => Math.max(0, v)) as unknown as T;
      case 'softmax': {
        const exp = arr.map(v => Math.exp(v));
        const sum = exp.reduce((a, b) => a + b, 0);
        return exp.map(v => v / sum) as unknown as T;
      }
      default:
        return arr as unknown as T;
    }
  }

  private matrixMultiply(matrices: number[][]): number[][] {
    const [a, b] = matrices;
    const size = Math.round(Math.sqrt(a.length));
    const result: number[] = [];
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        let sum = 0;
        for (let k = 0; k < size; k++) {
          sum += a[i * size + k] * b[k * size + j];
        }
        result.push(sum);
      }
    }
    return [result];
  }

  private getWGSLShader(operation: string, shaderName?: string): string {
    // Shaders WGSL pour opérations courantes
    const shaders: Record<string, string> = {
      vector_add: `
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let index = id.x;
            if (index >= arrayLength(&input)) { return; }
            output[index] = input[index] + 1.0;
        }
      `,
      vector_multiply: `
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let index = id.x;
            if (index >= arrayLength(&input)) { return; }
            output[index] = input[index] * 2.0;
        }
      `,
      sigmoid: `
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let index = id.x;
            if (index >= arrayLength(&input)) { return; }
            output[index] = 1.0 / (1.0 + exp(-input[index]));
        }
      `,
      relu: `
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(64)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let index = id.x;
            if (index >= arrayLength(&input)) { return; }
            output[index] = max(0.0, input[index]);
        }
      `,
      matrix_multiply: `
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read_write> output: array<f32>;

        @compute @workgroup_size(8, 8)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let size = u32(sqrt(f32(arrayLength(&input))));
            let row = id.x;
            let col = id.y;
            if (row >= size || col >= size) { return; }
            var sum = 0.0;
            for (var k = 0u; k < size; k = k + 1u) {
                sum = sum + input[row * size + k] * input[k * size + col];
            }
            output[row * size + col] = sum;
        }
      `,
    };

    const key = shaderName || operation;
    return shaders[key] || shaders.vector_add;
  }

  async getGPUMetrics(): Promise<{ backend: ComputeBackend; memoryMB: number; workerCount: number }> {
    return {
      backend: this.gpuDevice ? 'webgpu' : this.workerPool.length > 0 ? 'webworker' : 'cpu',
      memoryMB: this.gpuDevice ? 512 : 256,
      workerCount: this.workerPool.length,
    };
  }

  destroy(): void {
    this.gpuDevice?.destroy();
    this.workerPool.forEach(w => w.terminate());
    this.workerPool = [];
    this.isInitialized = false;
  }
}

export function createComputeEngine(config?: Partial<ComputeConfig>): ComputeEngine {
  return new ComputeEngine(config);
}
