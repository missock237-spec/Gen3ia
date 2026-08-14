/**
 * A/B Testing System for Automations
 * 
 * Data-driven workflow improvements:
 * - Split traffic between versions (50/50, 80/20, etc)
 * - Track metrics (success rate, duration, etc)
 * - Statistical significance testing
 * - Auto-promotion of winning variant
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('automation-ab-testing');

export interface ABTest {
  id: string;
  automationId: string;
  name: string;
  description?: string;
  versionA: string; // Version ID
  versionB: string;
  splitRatio: [number, number]; // [A%, B%]
  status: 'draft' | 'running' | 'paused' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  winner?: 'A' | 'B' | 'draw';
  metrics?: {
    versionA: ABTestMetrics;
    versionB: ABTestMetrics;
  };
}

export interface ABTestMetrics {
  runs: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number;
  averageCost?: number;
  errorRate: number;
  customMetrics?: Record<string, number>;
}

export interface ABTestResult {
  test: ABTest;
  statisticalSignificance: number; // 0-1
  confidentWinner?: 'A' | 'B';
  recommendation: string;
}

class ABTestingEngine {
  private tests = new Map<string, ABTest>();
  private testRuns = new Map<string, Array<{ version: 'A' | 'B'; metrics: ABTestMetrics }>>();
  private readonly MIN_SAMPLE_SIZE = 30; // Minimum runs per variant
  private readonly SIGNIFICANCE_THRESHOLD = 0.95; // 95% confidence

  /**
   * Create new A/B test
   */
  createTest(
    automationId: string,
    versionA: string,
    versionB: string,
    options: {
      name: string;
      description?: string;
      splitRatio?: [number, number];
    } = {},
  ): ABTest {
    const testId = `ab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const [ratioA, ratioB] = options.splitRatio || [50, 50];

    const test: ABTest = {
      id: testId,
      automationId,
      name: options.name,
      description: options.description,
      versionA,
      versionB,
      splitRatio: [ratioA, ratioB],
      status: 'draft',
    };

    this.tests.set(testId, test);
    this.testRuns.set(testId, []);

    log.info('A/B test created', {
      testId,
      automationId: automationId.slice(0, 8),
      name: options.name,
      split: `${ratioA}/${ratioB}`,
    });

    return test;
  }

  /**
   * Start A/B test
   */
  startTest(testId: string): ABTest {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    test.status = 'running';
    test.startedAt = new Date();

    log.info('A/B test started', { testId });
    return test;
  }

  /**
   * Get variant for execution (based on split ratio)
   */
  selectVariant(testId: string): 'A' | 'B' {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    const [ratioA] = test.splitRatio;
    const random = Math.random() * 100;

    return random < ratioA ? 'A' : 'B';
  }

  /**
   * Record execution metrics
   */
  recordMetrics(
    testId: string,
    variant: 'A' | 'B',
    metrics: ABTestMetrics,
  ): void {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    const runs = this.testRuns.get(testId);
    if (!runs) {
      return;
    }

    runs.push({ version: variant, metrics });

    // Initialize test metrics if needed
    if (!test.metrics) {
      test.metrics = {
        versionA: this.emptyMetrics(),
        versionB: this.emptyMetrics(),
      };
    }

    // Update aggregated metrics
    const targetMetrics = variant === 'A' ? test.metrics.versionA : test.metrics.versionB;
    this.aggregateMetrics(targetMetrics, metrics);

    log.debug('Metrics recorded', {
      testId,
      variant,
      successRate: (1 - metrics.errorRate) * 100,
    });
  }

  /**
   * Get test results and statistical analysis
   */
  getResults(testId: string): ABTestResult {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    if (!test.metrics) {
      return {
        test,
        statisticalSignificance: 0,
        recommendation: 'Insufficient data',
      };
    }

    const runs = this.testRuns.get(testId) || [];
    const variantARuns = runs.filter(r => r.version === 'A').length;
    const variantBRuns = runs.filter(r => r.version === 'B').length;

    // Check if we have enough data
    if (variantARuns < this.MIN_SAMPLE_SIZE || variantBRuns < this.MIN_SAMPLE_SIZE) {
      return {
        test,
        statisticalSignificance: 0,
        recommendation: `Need ${this.MIN_SAMPLE_SIZE} samples per variant. A: ${variantARuns}, B: ${variantBRuns}`,
      };
    }

    const metricsA = test.metrics.versionA;
    const metricsB = test.metrics.versionB;

    // Calculate z-score for success rate comparison
    const zScore = this.calculateZScore(metricsA, metricsB);
    const significance = this.normalCDF(Math.abs(zScore));

    let winner: 'A' | 'B' | undefined;
    let recommendation = '';

    if (significance >= this.SIGNIFICANCE_THRESHOLD) {
      const errorRateDiff = metricsA.errorRate - metricsB.errorRate;
      const durationDiff = metricsA.averageDurationMs - metricsB.averageDurationMs;

      // Version with lower error rate and faster duration wins
      const scoreA = -metricsA.errorRate * 100 + durationDiff * 0.001;
      const scoreB = -metricsB.errorRate * 100 + metricsB.averageDurationMs * 0.001;

      winner = scoreA > scoreB ? 'A' : 'B';
      recommendation = `Version ${winner} is statistically significantly better (${(significance * 100).toFixed(1)}% confidence)`;
    } else {
      recommendation = 'No statistically significant winner yet';
    }

    return {
      test,
      statisticalSignificance: significance,
      confidentWinner: significance >= this.SIGNIFICANCE_THRESHOLD ? winner : undefined,
      recommendation,
    };
  }

  /**
   * Promote winning variant
   */
  promoteVariant(testId: string, variant: 'A' | 'B'): void {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    test.status = 'completed';
    test.completedAt = new Date();
    test.winner = variant;

    log.info('Variant promoted', {
      testId,
      winner: variant,
      automationId: test.automationId.slice(0, 8),
    });
  }

  /**
   * Pause test
   */
  pauseTest(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    test.status = 'paused';
    log.info('A/B test paused', { testId });
  }

  /**
   * Resume test
   */
  resumeTest(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    test.status = 'running';
    log.info('A/B test resumed', { testId });
  }

  /**
   * Private: Calculate z-score for error rate comparison
   */
  private calculateZScore(metricsA: ABTestMetrics, metricsB: ABTestMetrics): number {
    const pA = 1 - metricsA.errorRate;
    const pB = 1 - metricsB.errorRate;
    const nA = metricsA.runs;
    const nB = metricsB.runs;

    const pooledP = (metricsA.successCount + metricsB.successCount) / (nA + nB);
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / nA + 1 / nB));

    return (pA - pB) / se;
  }

  /**
   * Private: Normal CDF (cumulative distribution function)
   */
  private normalCDF(z: number): number {
    // Approximate using error function
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  /**
   * Private: Error function
   */
  private erf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;

    return sign * (1.0 - (((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-x * x)));
  }

  /**
   * Private: Create empty metrics
   */
  private emptyMetrics(): ABTestMetrics {
    return {
      runs: 0,
      successCount: 0,
      failureCount: 0,
      averageDurationMs: 0,
      errorRate: 0,
    };
  }

  /**
   * Private: Aggregate metrics
   */
  private aggregateMetrics(target: ABTestMetrics, newMetrics: ABTestMetrics): void {
    const runs = target.runs + newMetrics.runs;
    target.successCount += newMetrics.successCount;
    target.failureCount += newMetrics.failureCount;
    target.averageDurationMs =
      (target.averageDurationMs * target.runs + newMetrics.averageDurationMs * newMetrics.runs) / runs;
    target.runs = runs;
    target.errorRate = target.failureCount / target.runs;
  }

  /**
   * Get all tests for automation
   */
  getTestsForAutomation(automationId: string): ABTest[] {
    return Array.from(this.tests.values()).filter(t => t.automationId === automationId);
  }
}

export const abTestingEngine = new ABTestingEngine();
