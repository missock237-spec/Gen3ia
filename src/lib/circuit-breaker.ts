/**
 * Circuit Breaker Pattern Implementation
 * 
 * Prevents cascading failures by stopping calls to failing services
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing) → CLOSED
 * 
 * Features:
 * - Exponential backoff
 * - Automatic recovery testing
 * - Metrics tracking
 * - Graceful fallbacks
 */

import { logger } from '@/lib/logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes in HALF_OPEN before closing
  timeout: number; // Time before attempting half-open (ms)
  onOpen?: () => void;
  onClose?: () => void;
}

interface CircuitBreakerMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  state: CircuitState;
  stateChangedAt: Date;
}

/**
 * Exponential backoff calculation
 */
function getBackoffTime(attemptNumber: number, baseDelay: number = 1000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);
  const jitter = Math.random() * exponentialDelay * 0.1; // 10% jitter
  const maxDelay = 30000; // 30 seconds max
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker<T> {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = Date.now();
  private metrics: CircuitBreakerMetrics;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      state: 'CLOSED',
      stateChangedAt: new Date(),
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<R>(fn: () => Promise<R>): Promise<R> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(`Circuit breaker OPEN for ${this.config.name}. Retry after ${new Date(this.nextAttemptTime).toISOString()}`);
      }

      // Try half-open
      this.setState('HALF_OPEN');
    }

    this.metrics.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        this.setState('CLOSED');
      }
    }

    this.metrics.successCount++;
    this.metrics.lastSuccessTime = new Date();

    logger.debug(`Circuit breaker ${this.config.name}: Success`, {
      state: this.state,
      successCount: this.successCount,
    });
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: unknown): void {
    this.failureCount++;
    this.metrics.failureCount++;
    this.metrics.lastFailureTime = new Date();

    logger.warn(`Circuit breaker ${this.config.name}: Failure #${this.failureCount}`, {
      error: error instanceof Error ? error.message : String(error),
      state: this.state,
    });

    if (this.state === 'HALF_OPEN') {
      // Immediately re-open if half-open fails
      this.setState('OPEN');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.setState('OPEN');
    }
  }

  /**
   * Transition to new state
   */
  private setState(newState: CircuitState): void {
    if (newState === this.state) return;

    const oldState = this.state;
    this.state = newState;
    this.metrics.state = newState;
    this.metrics.stateChangedAt = new Date();

    logger.info(`Circuit breaker ${this.config.name}: ${oldState} → ${newState}`, {
      config: this.config,
      metrics: this.metrics,
    });

    // Reset counters
    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
      this.config.onClose?.();
    } else if (newState === 'OPEN') {
      this.successCount = 0;
      this.nextAttemptTime = Date.now() + getBackoffTime(Math.floor(this.metrics.failureCount / 10));
      this.config.onOpen?.();
    } else if (newState === 'HALF_OPEN') {
      this.successCount = 0;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker (manual override)
   */
  reset(): void {
    this.setState('CLOSED');
    this.failureCount = 0;
    this.successCount = 0;
    this.metrics.totalRequests = 0;
    this.metrics.successCount = 0;
    this.metrics.failureCount = 0;
    logger.info(`Circuit breaker ${this.config.name}: Manually reset`);
  }
}

/**
 * Predefined circuit breakers for external services
 */
export const circuitBreakers = {
  openai: new CircuitBreaker({
    name: 'OpenAI',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    onOpen: () => logger.warn('OpenAI circuit breaker OPEN - disabling AI features'),
    onClose: () => logger.info('OpenAI circuit breaker CLOSED - re-enabling AI features'),
  }),

  anthropic: new CircuitBreaker({
    name: 'Anthropic',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    onOpen: () => logger.warn('Anthropic circuit breaker OPEN'),
    onClose: () => logger.info('Anthropic circuit breaker CLOSED'),
  }),

  stripe: new CircuitBreaker({
    name: 'Stripe',
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 60000,
    onOpen: () => logger.error('Stripe circuit breaker OPEN - payment processing disabled!'),
    onClose: () => logger.info('Stripe circuit breaker CLOSED'),
  }),

  twilio: new CircuitBreaker({
    name: 'Twilio',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    onOpen: () => logger.warn('Twilio circuit breaker OPEN - SMS/WhatsApp disabled'),
    onClose: () => logger.info('Twilio circuit breaker CLOSED'),
  }),

  huggingface: new CircuitBreaker({
    name: 'HuggingFace',
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    onOpen: () => logger.warn('HuggingFace circuit breaker OPEN'),
    onClose: () => logger.info('HuggingFace circuit breaker CLOSED'),
  }),
};

/**
 * Wrapper for API calls with automatic circuit breaking
 */
export async function callWithCircuitBreaker<R>(
  serviceName: keyof typeof circuitBreakers,
  fn: () => Promise<R>,
  fallback?: () => Promise<R> | R,
): Promise<R> {
  const breaker = circuitBreakers[serviceName];

  try {
    return await breaker.execute(fn);
  } catch (error) {
    logger.error(`Call to ${serviceName} failed`, { error });

    if (fallback) {
      logger.info(`Using fallback for ${serviceName}`);
      return await fallback();
    }

    throw error;
  }
}

/**
 * Get all circuit breaker metrics (for monitoring)
 */
export function getAllMetrics(): Record<string, CircuitBreakerMetrics> {
  const metrics: Record<string, CircuitBreakerMetrics> = {};

  for (const [key, breaker] of Object.entries(circuitBreakers)) {
    metrics[key] = breaker.getMetrics();
  }

  return metrics;
}

/**
 * Health check for circuit breakers
 */
export function getCircuitBreakerHealth(): {
  healthy: boolean;
  open: string[];
  degraded: string[];
} {
  const open: string[] = [];
  const degraded: string[] = [];

  for (const [key, breaker] of Object.entries(circuitBreakers)) {
    const state = breaker.getState();

    if (state === 'OPEN') {
      open.push(key);
    } else if (state === 'HALF_OPEN') {
      degraded.push(key);
    }
  }

  return {
    healthy: open.length === 0,
    open,
    degraded,
  };
}

export default CircuitBreaker;
