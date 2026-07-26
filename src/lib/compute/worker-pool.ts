// Worker Pool — exécuté dans un Web Worker (thread séparé)

interface WorkerMessage {
  operation: string;
  input: number[];
  id: string;
}

interface WorkerResponse {
  id: string;
  result?: number[];
  durationMs: number;
  error?: string;
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exp = arr.map(v => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(v => v / sum);
}

function executeOperation(operation: string, input: number[]): number[] {
  switch (operation) {
    case 'vector_add': return input.map(v => v + 1);
    case 'vector_multiply': return input.map(v => v * 2);
    case 'sigmoid': return input.map(v => 1 / (1 + Math.exp(-v)));
    case 'relu': return input.map(v => Math.max(0, v));
    case 'tanh': return input.map(v => Math.tanh(v));
    case 'softmax': return softmax(input);
    case 'normalize': { const max = Math.max(...input.map(Math.abs)); return input.map(v => v / (max || 1)); }
    default: return input.map(v => v * 2);
  }
}

// self.onmessage est natif dans les Workers — pas besoin de cast
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { operation, input, id } = event.data;
  const start = performance.now();

  try {
    const result = executeOperation(operation, input);
    const durationMs = performance.now() - start;
    const response: WorkerResponse = { id, result, durationMs };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      durationMs: performance.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

export {};