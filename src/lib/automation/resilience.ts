/**
 * Workflow Resilience Engine
 * 
 * Provides fault tolerance and automatic recovery:
 * - Circuit breakers per block (fail-fast for cascading failures)
 * - Exponential backoff retry (3 retries with [100ms, 500ms, 2000ms])
 * - Fallback handlers for graceful degradation
 * - Error categorization (transient vs permanent)
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('workflow-resilience');

export type ErrorCategory = 'transient' | 'permanent' | 'timeout' | 'unknown';

export interface CircuitBreakerState {
  blockId: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successCount: number;
  lastFailureTime?: Date;
  openedAt?: Date;
}

export interface RetryConfig {
  maxRetries: number;
  delays: number[];
  backoffMultiplier: number;
}

export interface FallbackHandler {
  blockId: string;
  handler: (error: Error, context: Record<string, any>) => Promise<any>;
}

class ResilienceEngine {
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private fallbackHandlers = new Map<string, FallbackHandler>();
  private readonly FAILURE_THRESHOLD = 5;
  private readonly OPEN_TIMEOUT_MS = 30000; // 30 seconds

  constructor() {
    this.initializeDefaults();
  }

  /**
   * Initialize default retry configuration
   */
  private initializeDefaults(): void {
    this.setupCircuitBreakerCleanup();
  }

  /**
   * Periodically check circuit breakers and transition from open to half-open
   */
  private setupCircuitBreakerCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [, breaker] of this.circuitBreakers) {
        if (
          breaker.state === 'open' &&
          breaker.openedAt &&
          now - breaker.openedAt.getTime() > this.OPEN_TIMEOUT_MS
        ) {
          breaker.state = 'half-open';
          breaker.successCount = 0;
          log.info('Circuit breaker transitioned to half-open', { blockId: breaker.blockId });
        }
      }
    }, 5000);
  }

  /**
   * Get or create circuit breaker for a block
   */
  private getCircuitBreaker(blockId: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(blockId)) {
      this.circuitBreakers.set(blockId, {
        blockId,
        state: 'closed',
        failures: 0,
        successCount: 0,
      });
    }
    return this.circuitBreakers.get(blockId)!;
  }

  /**
   * Check if circuit breaker allows execution
   */
  canExecute(blockId: string): boolean {
    const breaker = this.getCircuitBreaker(blockId);

    if (breaker.state === 'closed') {
      return true;
    }

    if (breaker.state === 'open') {
      return false;
    }

    // half-open: allow one request to test
    return true;
  }

  /**
   * Record success in circuit breaker
   */
  recordSuccess(blockId: string): void {
    const breaker = this.getCircuitBreaker(blockId);

    if (breaker.state === 'half-open') {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.successCount = 0;
      log.info('Circuit breaker closed', { blockId });
    } else if (breaker.state === 'closed') {
      breaker.failures = Math.max(0, breaker.failures - 1);
    }
  }

  /**
   * Record failure in circuit breaker
   */
  recordFailure(blockId: string, error: Error): void {
    const breaker = this.getCircuitBreaker(blockId);
    breaker.failures++;
    breaker.lastFailureTime = new Date();

    if (breaker.state === 'half-open') {
      breaker.state = 'open';
      breaker.openedAt = new Date();
      log.warn('Circuit breaker reopened (half-open test failed)', { blockId });
    } else if (breaker.failures >= this.FAILURE_THRESHOLD && breaker.state === 'closed') {
      breaker.state = 'open';
      breaker.openedAt = new Date();
      log.warn('Circuit breaker opened', {
        blockId,
        failures: breaker.failures,
        reason: error.message,
      });
    }
  }

  /**
   * Execute block with retry logic
   */
  async executeWithRetry<T>(
    blockId: string,
    executor: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const retryConfig: RetryConfig = {
      maxRetries: 3,
      delays: [100, 500, 2000],
      backoffMultiplier: 1,
      ...config,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Check circuit breaker
        if (!this.canExecute(blockId)) {
          throw new Error(`Circuit breaker is open for block ${blockId}`);
        }

        const result = await executor();
        this.recordSuccess(blockId);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const category = this.categorizeError(lastError);

        // Don't retry permanent errors
        if (category === 'permanent') {
          this.recordFailure(blockId, lastError);
          throw lastError;
        }

        this.recordFailure(blockId, lastError);

        if (attempt < retryConfig.maxRetries) {
          const delay = retryConfig.delays[attempt] || retryConfig.delays[retryConfig.delays.length - 1];
          log.warn('Retry scheduled', {
            blockId,
            attempt: attempt + 1,
            delay,
            error: lastError.message,
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error(`Failed after ${retryConfig.maxRetries} retries`);
  }

  /**
   * Execute with fallback handler
   */
  async executeWithFallback<T>(
    blockId: string,
    executor: () => Promise<T>,
    context: Record<string, any> = {},
  ): Promise<T> {
    try {
      return await executor();
    } catch (error) {
      const handler = this.fallbackHandlers.get(blockId);
      if (!handler) {
        throw error;
      }

      log.info('Executing fallback handler', {
        blockId,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        return await handler.handler(
          error instanceof Error ? error : new Error(String(error)),
          context,
        );
      } catch (fallbackError) {
        log.error('Fallback handler failed', {
          blockId,
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
        throw fallbackError;
      }
    }
  }

  /**
   * Register fallback handler for a block
   */
  registerFallback(
    blockId: string,
    handler: (error: Error, context: Record<string, any>) => Promise<any>,
  ): void {
    this.fallbackHandlers.set(blockId, { blockId, handler });
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    // Transient errors (safe to retry)
    if (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('503') ||
      message.includes('429') ||
      message.includes('temporarily')
    ) {
      return 'transient';
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('deadline')) {
      return 'timeout';
    }

    // Permanent errors (don't retry)
    if (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('404') ||
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('validation')
    ) {
      return 'permanent';
    }

    return 'unknown';
  }

  /**
   * Sleep utility for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get circuit breaker status
   */
  getStatus(blockId: string): CircuitBreakerState {
    return this.getCircuitBreaker(blockId);
  }

  /**
   * Reset circuit breaker manually
   */
  reset(blockId: string): void {
    const breaker = this.getCircuitBreaker(blockId);
    breaker.state = 'closed';
    breaker.failures = 0;
    breaker.successCount = 0;
    log.info('Circuit breaker reset manually', { blockId });
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.successCount = 0;
    }
    log.info('All circuit breakers reset');
  }
}

export const resilienceEngine = new ResilienceEngine();
