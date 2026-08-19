// ============================================================
// RESOURCE GUARD — Protection contre l'epuisement des ressources
// Timeouts, limites de taille, guards pour boucles et recursion
// ============================================================

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_MAX_STRING_LENGTH = 100000;
const DEFAULT_MAX_ARRAY_SIZE = 1000;
const DEFAULT_MAX_CONCURRENT = 10;

export class ResourceGuard {
  private timeoutMs: number;
  private maxIterations: number;
  private maxStringLength: number;
  private maxArraySize: number;

  constructor(opts?: {
    timeoutMs?: number;
    maxIterations?: number;
    maxStringLength?: number;
    maxArraySize?: number;
  }) {
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxIterations = opts?.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.maxStringLength = opts?.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
    this.maxArraySize = opts?.maxArraySize ?? DEFAULT_MAX_ARRAY_SIZE;
  }

  /**
   * Execute une fonction asynchrone avec un timeout.
   */
  async withTimeout<T>(fn: () => Promise<T>, customTimeoutMs?: number): Promise<T> {
    const timeout = customTimeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timeout apres ${timeout}ms`)), timeout);
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason));
        }),
      ]);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Execute une boucle avec limite d'iterations.
   */
  async iterateWithLimit<T>(
    items: T[],
    fn: (item: T, index: number) => Promise<void>,
    limit?: number
  ): Promise<void> {
    const max = Math.min(items.length, limit ?? this.maxArraySize);
    let iterations = 0;
    const startTime = Date.now();

    for (let i = 0; i < max; i++) {
      iterations++;
      if (iterations > (limit ?? this.maxIterations)) {
        throw new Error(`Limite d'iterations atteinte: ${iterations}`);
      }
      if (Date.now() - startTime > this.timeoutMs) {
        throw new Error(`Timeout global atteint pendant l'iteration ${i}`);
      }
      await fn(items[i]!, i);
    }
  }

  /**
   * Execute des taches en parallele avec un limiteur de concurrence.
   */
  async concurrentLimit<T>(
    tasks: (() => Promise<T>)[],
    limit?: number
  ): Promise<T[]> {
    const maxConcurrent = limit ?? DEFAULT_MAX_CONCURRENT;
    const results: T[] = [];
    let index = 0;

    const startTime = Date.now();

    async function worker(guard: ResourceGuard): Promise<void> {
      while (index < tasks.length) {
        if (Date.now() - startTime > guard.timeoutMs) {
          throw new Error(`Timeout global dans le pool de concurrence`);
        }
        const current = index++;
        results[current] = await tasks[current]!();
      }
    }

    const workers = Array(Math.min(maxConcurrent, tasks.length))
      .fill(null)
      .map(() => worker(this));

    await Promise.all(workers);
    return results;
  }

  /**
   * Tronque une chaine pour eviter les explosions memoire.
   */
  truncate(input: string, maxLength?: number): string {
    if (typeof input !== 'string') return '';
    const max = maxLength ?? this.maxStringLength;
    if (input.length <= max) return input;
    return input.slice(0, max) + '...[tronque]';
  }

  /**
   * Limite la taille d'un tableau.
   */
  limitArray<T>(arr: T[], maxSize?: number): T[] {
    if (!Array.isArray(arr)) return [];
    const max = maxSize ?? this.maxArraySize;
    return arr.slice(0, max);
  }

  /**
   * Limite la recursion en profondeur.
   */
  limitDepth(obj: unknown, maxDepth: number = 5, currentDepth: number = 0): unknown {
    if (currentDepth > maxDepth) return '[profondeur max atteinte]';
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => this.limitDepth(item, maxDepth, currentDepth + 1));
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.limitDepth(value, maxDepth, currentDepth + 1);
    }
    return result;
  }
}

/**
 * Factory pour creer un ResourceGuard avec des limites par defaut.
 */
export function createResourceGuard(opts?: {
  timeoutMs?: number;
  maxIterations?: number;
  maxStringLength?: number;
  maxArraySize?: number;
}): ResourceGuard {
  return new ResourceGuard(opts);
}

/**
 * Fonction utilitaire pour limiter la taille d'un message.
 */
export function limitString(input: string, maxLength: number = DEFAULT_MAX_STRING_LENGTH): string {
  if (typeof input !== 'string') return '';
  return input.length <= maxLength ? input : input.slice(0, maxLength);
}

// eslint-disable-next-line import/no-anonymous-default-export
export default { ResourceGuard, createResourceGuard, limitString };
