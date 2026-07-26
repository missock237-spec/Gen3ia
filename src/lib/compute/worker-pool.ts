// Worker Pool — exécuté dans un Web Worker (thread séparé)
// Ce fichier est importé par engine.ts et chargé comme Worker

interface WorkerMessage {
  operation: string;
  input: number[];
  id: string;
}

interface WorkerResponse {
  id: string;
  result: number[];
  durationMs: number;
  error?: string;
}

// Opérations mathématiques optimisées
function matrixMultiply(a: number[], b: number[], size: number): number[] {
  const result = new Array(size * size).fill(0);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let sum = 0;
      for (let k = 0; k < size; k++) {
        sum += a[i * size + k] * b[k * size + j];
      }
      result[i * size + j] = sum;
    }
  }
  return result;
}

function conv2d(input: number[], kernel: number[], inputSize: number, kernelSize: number): number[] {
  const outputSize = inputSize - kernelSize + 1;
  const result = new Array(outputSize * outputSize).fill(0);
  for (let i = 0; i < outputSize; i++) {
    for (let j = 0; j < outputSize; j++) {
      let sum = 0;
      for (let ki = 0; ki < kernelSize; ki++) {
        for (let kj = 0; kj < kernelSize; kj++) {
          sum += input[(i + ki) * inputSize + (j + kj)] * kernel[ki * kernelSize + kj];
        }
      }
      result[i * outputSize + j] = sum;
    }
  }
  return result;
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exp = arr.map(v => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(v => v / sum);
}

function layerNorm(arr: number[], gamma: number[] = [], beta: number[] = []): number[] {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  const std = Math.sqrt(variance + 1e-5);
  return arr.map((v, i) => {
    const normalized = (v - mean) / std;
    return normalized * (gamma[i] || 1) + (beta[i] || 0);
  });
}

function attention(query: number[], key: number[], value: number[], dim: number): number[] {
  const seqLen = query.length / dim;
  const scores = new Array(seqLen * seqLen).fill(0);
  for (let i = 0; i < seqLen; i++) {
    for (let j = 0; j < seqLen; j++) {
      let sum = 0;
      for (let k = 0; k < dim; k++) {
        sum += query[i * dim + k] * key[j * dim + k];
      }
      scores[i * seqLen + j] = sum / Math.sqrt(dim);
    }
  }
  const attn = softmax(scores);
  const result = new Array(seqLen * dim).fill(0);
  for (let i = 0; i < seqLen; i++) {
    for (let j = 0; j < dim; j++) {
      let sum = 0;
      for (let k = 0; k < seqLen; k++) {
        sum += attn[i * seqLen + k] * value[k * dim + j];
      }
      result[i * dim + j] = sum;
    }
  }
  return result;
}

function executeOperation(operation: string, input: number[]): number[] {
  switch (operation) {
    case 'matrix_multiply_4x4':
      return matrixMultiply(input.slice(0, 16), input.slice(16, 32), 4);
    case 'matrix_multiply_8x8':
      return matrixMultiply(input.slice(0, 64), input.slice(64, 128), 8);
    case 'matrix_multiply_16x16':
      return matrixMultiply(input.slice(0, 256), input.slice(256, 512), 16);
    case 'vector_add':
      return input.map(v => v + 1);
    case 'vector_multiply':
      return input.map(v => v * 2);
    case 'sigmoid':
      return input.map(v => 1 / (1 + Math.exp(-v)));
    case 'relu':
      return input.map(v => Math.max(0, v));
    case 'tanh':
      return input.map(v => Math.tanh(v));
    case 'softmax':
      return softmax(input);
    case 'normalize': {
      const max = Math.max(...input.map(Math.abs));
      return input.map(v => v / (max || 1));
    }
    case 'layer_norm':
      return layerNorm(input);
    case 'attention': {
      const dim = Math.round(Math.sqrt(input.length / 3));
      const total = dim * dim;
      return attention(input.slice(0, total), input.slice(total, 2 * total), input.slice(2 * total), dim);
    }
    case 'conv2d_3x3':
      return conv2d(input.slice(0, 64), input.slice(64, 73), 8, 3);
    case 'conv2d_5x5':
      return conv2d(input.slice(0, 256), input.slice(256, 281), 16, 5);
    default: {
      // Par défaut: multiplier chaque élément par 2
      return input.map(v => v * 2);
    }
  }
}

// Handler des messages
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { operation, input, id } = event.data;
  const start = performance.now();

  try {
    const result = executeOperation(operation, input);
    const durationMs = performance.now() - start;

    const response: WorkerResponse = { id, result, durationMs };
    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      result: [],
      durationMs: performance.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
};

export {};
