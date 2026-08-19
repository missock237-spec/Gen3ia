/**
 * Graceful Degradation & Fallback System
 * 
 * Ensures application continues functioning when services fail:
 * - Redis down → Use in-memory cache
 * - Database slow → Use cache + return partial data
 * - External APIs down → Use circuit breaker + fallback
 */

import { logger } from '@/lib/logger';

interface FallbackStrategy<T> {
  name: string;
  priority: number; // 1 = highest priority (try first)
  execute: () => Promise<T>;
  isHealthy?: () => boolean;
}

/**
 * Retry strategy with exponential backoff
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter?: boolean; // Add randomness to prevent thundering herd
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff + jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  delay = Math.min(delay, config.maxDelayMs);

  if (config.jitter) {
    delay = delay * (0.5 + Math.random());
  }

  return delay;
}

/**
 * Execute with automatic retry and exponential backoff
 */
export async function executeWithRetry<T>(
  name: string,
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 0) {
        logger.info(`${name} succeeded after ${attempt} retries`);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < finalConfig.maxAttempts - 1) {
        const delay = calculateDelay(attempt, finalConfig);
        logger.warn(`${name} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${finalConfig.maxAttempts})`, {
          error: (error as Error).message,
        });
        
        await sleep(delay);
      }
    }
  }

  logger.error(`${name} failed after ${finalConfig.maxAttempts} attempts`, {
    error: lastError?.message,
  });

  throw lastError || new Error(`${name} failed after ${finalConfig.maxAttempts} attempts`);
}

/**
 * Execute with fallback strategies
 */
export async function executeWithFallback<T>(
  primary: FallbackStrategy<T>,
  fallbacks: FallbackStrategy<T>[] = [],
): Promise<T> {
  const strategies = [primary, ...fallbacks].sort((a, b) => a.priority - b.priority);

  for (const strategy of strategies) {
    try {
      // Check health if available
      if (strategy.isHealthy && !strategy.isHealthy()) {
        logger.debug(`Skipping unhealthy strategy: ${strategy.name}`);
        continue;
      }

      const result = await strategy.execute();
      
      if (strategy !== primary) {
        logger.warn(`Using fallback strategy: ${strategy.name}`);
      }

      return result;
    } catch (error) {
      logger.warn(`Strategy ${strategy.name} failed`, {
        error: (error as Error).message,
      });
      
      // Continue to next fallback
      if (strategy !== strategies[strategies.length - 1]) {
        continue;
      }
    }
  }

  throw new Error('All strategies failed');
}

/**
 * Circuit breaker with graceful degradation
 */
export class ResilientService<T> {
  private name: string;
  private failureThreshold: number;
  private recoveryTimeMs: number;
  private failureCount = 0;
  private lastFailureTime = 0;
  private fallback?: () => Promise<T>;

  constructor(
    name: string,
    options: {
      failureThreshold?: number;
      recoveryTimeMs?: number;
      fallback?: () => Promise<T>;
    } = {},
  ) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeMs = options.recoveryTimeMs ?? 30000;
    this.fallback = options.fallback;
  }

  /**
   * Execute with circuit breaker and fallback
   */
  async execute(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.resetFailureCount();
      return result;
    } catch (error) {
      this.recordFailure();

      if (this.shouldUseFallback()) {
        if (this.fallback) {
          logger.warn(`${this.name} using fallback after ${this.failureCount} failures`);
          return await this.fallback();
        }
      }

      throw error;
    }
  }

  /**
   * Record a failure
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn(`${this.name} failure #${this.failureCount}/${this.failureThreshold}`);
  }

  /**
   * Reset failure count
   */
  private resetFailureCount(): void {
    if (this.failureCount > 0) {
      logger.info(`${this.name} recovered after ${this.failureCount} failures`);
      this.failureCount = 0;
    }
  }

  /**
   * Determine if fallback should be used
   */
  private shouldUseFallback(): boolean {
    // Use fallback if:
    // 1. We've exceeded threshold AND
    // 2. We're still within recovery window OR it's time to recover
    const timeInFailureMode = Date.now() - this.lastFailureTime;
    return this.failureCount >= this.failureThreshold && 
           (timeInFailureMode < this.recoveryTimeMs || timeInFailureMode > this.recoveryTimeMs * 2);
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      service: this.name,
      failureCount: this.failureCount,
      isFailing: this.failureCount >= this.failureThreshold,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Timeout wrapper
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Combine all resilience patterns
 */
export async function executeResilient<T>(
  name: string,
  fn: () => Promise<T>,
  options: {
    timeout?: number;
    retry?: Partial<RetryConfig>;
    fallback?: () => Promise<T>;
    circuitBreaker?: { threshold?: number; recoveryTime?: number };
  } = {},
): Promise<T> {
  logger.debug(`Executing resilient operation: ${name}`);

  // Wrap with timeout
  let wrappedFn = fn;
  if (options.timeout) {
    wrappedFn = () => executeWithTimeout(fn, options.timeout!);
  }

  // Wrap with retry
  if (options.retry && options.retry.maxAttempts! > 1) {
    const retryFn = wrappedFn;
    wrappedFn = () => executeWithRetry(name, retryFn, options.retry);
  }

  // Wrap with fallback
  if (options.fallback) {
    return executeWithFallback(
      {
        name: `${name} (primary)`,
        priority: 1,
        execute: wrappedFn,
      },
      [
        {
          name: `${name} (fallback)`,
          priority: 2,
          execute: options.fallback,
        },
      ],
    );
  }

  return wrappedFn();
}

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  executeWithRetry,
  executeWithFallback,
  ResilientService,
  executeWithTimeout,
  executeResilient,
};
