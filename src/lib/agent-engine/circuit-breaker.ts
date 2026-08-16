// ============================================================
// CIRCUIT BREAKER — Protection contre les défaillances en cascade
// Patterns: closed → open (failures) → half-open (recovery test)
// ============================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Failures before opening
  recoveryTimeoutMs: number;   // Time before half-open attempt
  successThreshold: number;     // Successes in half-open to close
  monitorWindowMs: number;     // Rolling window for failure counting
}

interface CircuitRecord {
  timestamp: number;
  success: boolean;
}

export class CircuitBreaker {
  private circuits: Map<string, {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
    openedAt: number;
    history: CircuitRecord[];
  }> = new Map();

  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      recoveryTimeoutMs: config?.recoveryTimeoutMs ?? 30000,
      successThreshold: config?.successThreshold ?? 3,
      monitorWindowMs: config?.monitorWindowMs ?? 60000,
    };
  }

  /**
   * Check if a circuit allows execution
   */
  canExecute(key: string): { allowed: boolean; state: CircuitState; retryAfter?: number } {
    const circuit = this.getOrCreate(key);

    switch (circuit.state) {
      case 'closed':
        return { allowed: true, state: 'closed' };

      case 'open': {
        const elapsed = Date.now() - circuit.openedAt;
        if (elapsed >= this.config.recoveryTimeoutMs) {
          circuit.state = 'half-open';
          circuit.successes = 0;
          return { allowed: true, state: 'half-open' };
        }
        return {
          allowed: false,
          state: 'open',
          retryAfter: Math.ceil((this.config.recoveryTimeoutMs - elapsed) / 1000),
        };
      }

      case 'half-open':
        return { allowed: true, state: 'half-open' };
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(key: string): void {
    const circuit = this.getOrCreate(key);
    circuit.history.push({ timestamp: Date.now(), success: true });
    this.pruneHistory(circuit);

    if (circuit.state === 'half-open') {
      circuit.successes++;
      if (circuit.successes >= this.config.successThreshold) {
        circuit.state = 'closed';
        circuit.failures = 0;
      }
    }
  }

  /**
   * Record a failed execution
   */
  recordFailure(key: string): void {
    const circuit = this.getOrCreate(key);
    circuit.failures++;
    circuit.lastFailureTime = Date.now();
    circuit.history.push({ timestamp: Date.now(), success: false });
    this.pruneHistory(circuit);

    if (circuit.state === 'half-open') {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
    } else if (circuit.state === 'closed') {
      const recentFailures = circuit.history.filter(r => !r.success).length;
      if (recentFailures >= this.config.failureThreshold) {
        circuit.state = 'open';
        circuit.openedAt = Date.now();
      }
    }
  }

  /**
   * Reset a circuit (e.g., after manual intervention)
   */
  reset(key: string): void {
    this.circuits.delete(key);
  }

  /**
   * Get circuit status
   */
  getStatus(key: string): { state: CircuitState; failures: number; successes: number } {
    const circuit = this.getOrCreate(key);
    return { state: circuit.state, failures: circuit.failures, successes: circuit.successes };
  }

  /**
   * Get all circuit statuses
   */
  getAllStatuses(): Array<{ key: string; state: CircuitState; failures: number; successes: number }> {
    return Array.from(this.circuits.entries()).map(([key, c]) => ({
      key,
      state: c.state,
      failures: c.failures,
      successes: c.successes,
    }));
  }

  private getOrCreate(key: string) {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailureTime: 0,
        openedAt: 0,
        history: [],
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  private pruneHistory(circuit: { history: CircuitRecord[] }) {
    const cutoff = Date.now() - this.config.monitorWindowMs;
    circuit.history = circuit.history.filter(r => r.timestamp >= cutoff);
  }
}

// Global instance
export const circuitBreaker = new CircuitBreaker();
