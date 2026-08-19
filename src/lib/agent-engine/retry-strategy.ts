// ============================================================
// RETRY STRATEGY — Retry avec backoff exponentiel et jitter
// Patterns: immediate retry → exponential backoff → circuit breaker
// ============================================================

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: string[]; // Error patterns that should be retried
  nonRetryableErrors: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  attempts: number;
  totalDelayMs: number;
  gaveUp: boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    'timeout',
    'network error',
    'fetch failed',
    'rate limit',
    '429',
    '502',
    '503',
    '504',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
  ],
  nonRetryableErrors: [
    'authentication',
    'unauthorized',
    'forbidden',
    'invalid',
    'not found',
    'bad request',
    '400',
    '401',
    '403',
    '404',
  ],
};

export class RetryStrategy {
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    onRetry?: (attempt: number, error: string, delayMs: number) => void
  ): Promise<RetryResult<T>> {
    let lastError: string | undefined;
    let totalDelayMs = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await fn();
        return {
          success: true,
          result,
          attempts: attempt + 1,
          totalDelayMs,
          gaveUp: false,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const errorLower = lastError.toLowerCase();

        // Check if non-retryable
        const isNonRetryable = this.config.nonRetryableErrors.some(e => errorLower.includes(e));
        if (isNonRetryable) {
          return { success: false, error: lastError, attempts: attempt + 1, totalDelayMs, gaveUp: true };
        }

        // Check if retryable
        const isRetryable = this.config.retryableErrors.some(e => errorLower.includes(e));
        if (!isRetryable && attempt > 0) {
          // Unknown error — retry once then give up
          if (attempt >= 1) {
            return { success: false, error: lastError, attempts: attempt + 1, totalDelayMs, gaveUp: true };
          }
        }

        if (attempt >= this.config.maxRetries) {
          return { success: false, error: lastError, attempts: attempt + 1, totalDelayMs, gaveUp: true };
        }

        // Calculate delay
        let delay = Math.min(
          this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt),
          this.config.maxDelayMs
        );

        // Add jitter to prevent thundering herd
        if (this.config.jitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }

        totalDelayMs += delay;

        if (onRetry) {
          onRetry(attempt + 1, lastError, Math.round(delay));
        }

        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: this.config.maxRetries + 1,
      totalDelayMs,
      gaveUp: true,
    };
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: string): boolean {
    const lower = error.toLowerCase();
    const isNonRetryable = this.config.nonRetryableErrors.some(e => lower.includes(e));
    if (isNonRetryable) return false;
    return this.config.retryableErrors.some(e => lower.includes(e));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Pre-configured strategies
export const networkRetry = new RetryStrategy({
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
});

export const apiRetry = new RetryStrategy({
  maxRetries: 2,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
  nonRetryableErrors: [...DEFAULT_CONFIG.nonRetryableErrors, 'validation', 'schema'],
});

export const llmRetry = new RetryStrategy({
  maxRetries: 2,
  initialDelayMs: 2000,
  maxDelayMs: 15000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: ['timeout', 'rate limit', '429', '503', '502', 'overloaded', 'capacity'],
  nonRetryableErrors: ['invalid api key', 'authentication', 'unauthorized', 'billing'],
});
