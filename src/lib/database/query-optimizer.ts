/**
 * Database Query Optimizer - N+1 Prevention & Performance
 * 
 * Optimizes queries, prevents N+1 issues, and provides performance insights
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('query-optimizer');

export interface QueryMetric {
  query: string;
  duration: number;
  timestamp: number;
  rows: number;
  cached: boolean;
}

export interface OptimizationHint {
  query: string;
  hint: string;
  potential_savings: number; // in milliseconds
  priority: 'high' | 'medium' | 'low';
}

class QueryOptimizer {
  private queryMetrics: Map<string, QueryMetric[]> = new Map();
  private queryCache: Map<string, { data: any; timestamp: number }> = new Map();
  private n1Detectors: Map<string, number> = new Map();
  private maxMetricsPerQuery = 1000;

  constructor() {
    log.info('query_optimizer_initialized');
  }

  /**
   * Record query execution
   */
  recordQuery(query: string, duration: number, rows: number, cached: boolean = false): void {
    const metric: QueryMetric = {
      query,
      duration,
      timestamp: Date.now(),
      rows,
      cached,
    };

    if (!this.queryMetrics.has(query)) {
      this.queryMetrics.set(query, []);
    }

    const metrics = this.queryMetrics.get(query)!;
    metrics.push(metric);

    // Keep only recent metrics
    if (metrics.length > this.maxMetricsPerQuery) {
      metrics.shift();
    }

    log.debug('query_recorded', {
      query: query.slice(0, 50),
      duration: `${duration.toFixed(2)}ms`,
      rows,
      cached,
    });
  }

  /**
   * Detect N+1 queries
   */
  detectN1Pattern(queryPattern: string): void {
    const count = (this.n1Detectors.get(queryPattern) || 0) + 1;
    this.n1Detectors.set(queryPattern, count);

    if (count > 5) {
      log.warn('n1_query_pattern_detected', {
        pattern: queryPattern,
        count,
      });
    }
  }

  /**
   * Cache query result
   */
  cacheQueryResult(query: string, data: any, ttlMs: number = 300000): void {
    this.queryCache.set(query, {
      data,
      timestamp: Date.now() + ttlMs,
    });
  }

  /**
   * Get cached query result
   */
  getCachedQueryResult(query: string): any | null {
    const cached = this.queryCache.get(query);

    if (!cached) {
      return null;
    }

    if (Date.now() > cached.timestamp) {
      this.queryCache.delete(query);
      return null;
    }

    return cached.data;
  }

  /**
   * Get query statistics
   */
  getQueryStats(query?: string): {
    query: string;
    executionCount: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
    totalRows: number;
    cacheHits: number;
  }[] {
    if (query) {
      const metrics = this.queryMetrics.get(query);
      if (!metrics) return [];

      return [this.calculateStats(query, metrics)];
    }

    const allStats: Array<{
      query: string;
      executionCount: number;
      avgDuration: number;
      maxDuration: number;
      minDuration: number;
      totalRows: number;
      cacheHits: number;
    }> = [];
    this.queryMetrics.forEach((metrics, q) => {
      allStats.push(this.calculateStats(q, metrics));
    });

    return allStats.sort((a, b) => b.avgDuration - a.avgDuration);
  }

  /**
   * Calculate statistics for a query
   */
  private calculateStats(
    query: string,
    metrics: QueryMetric[]
  ): {
    query: string;
    executionCount: number;
    avgDuration: number;
    maxDuration: number;
    minDuration: number;
    totalRows: number;
    cacheHits: number;
  } {
    const durations = metrics.map((m) => m.duration);
    const cacheHits = metrics.filter((m) => m.cached).length;

    return {
      query,
      executionCount: metrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      totalRows: metrics.reduce((sum, m) => sum + m.rows, 0),
      cacheHits,
    };
  }

  /**
   * Get optimization hints
   */
  getOptimizationHints(): OptimizationHint[] {
    const hints: OptimizationHint[] = [];
    const stats = this.getQueryStats();

    stats.forEach((stat) => {
      // Hint 1: Slow queries
      if (stat.avgDuration > 100) {
        hints.push({
          query: stat.query.slice(0, 50),
          hint: `Query averaging ${stat.avgDuration.toFixed(0)}ms - consider adding indexes or pagination`,
          potential_savings: stat.avgDuration * 0.5,
          priority: 'high',
        });
      }

      // Hint 2: Queries returning many rows
      if (stat.totalRows > 10000) {
        hints.push({
          query: stat.query.slice(0, 50),
          hint: `Query returns many rows (${stat.totalRows}) - consider pagination or filtering`,
          potential_savings: 50,
          priority: 'high',
        });
      }

      // Hint 3: Frequently executed queries
      if (stat.executionCount > 100 && stat.cacheHits === 0) {
        hints.push({
          query: stat.query.slice(0, 50),
          hint: `Frequently executed (${stat.executionCount}x) but never cached - consider caching`,
          potential_savings: stat.avgDuration * 0.8,
          priority: 'medium',
        });
      }
    });

    // Sort by potential savings
    hints.sort((a, b) => b.potential_savings - a.potential_savings);

    return hints;
  }

  /**
   * Get top slow queries
   */
  getSlowQueries(limit: number = 10): Array<{
    query: string;
    avgDuration: number;
    executionCount: number;
  }> {
    return this.getQueryStats()
      .filter((s) => s.avgDuration > 50) // Only queries > 50ms
      .slice(0, limit)
      .map((s) => ({
        query: s.query,
        avgDuration: s.avgDuration,
        executionCount: s.executionCount,
      }));
  }

  /**
   * Get N+1 detection summary
   */
  getN1Summary(): Array<{
    pattern: string;
    count: number;
  }> {
    const patterns = Array.from(this.n1Detectors.entries())
      .filter(([, count]) => count > 3)
      .map(([pattern, count]) => ({
        pattern,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return patterns.slice(0, 10);
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.queryMetrics.clear();
    this.n1Detectors.clear();
    log.info('query_metrics_cleared');
  }

  /**
   * Generate report
   */
  generateReport(): {
    totalQueries: number;
    avgLatency: number;
    slowestQueries: Array<any>;
    n1Patterns: Array<any>;
    cacheHitRate: number;
  } {
    const stats = this.getQueryStats();
    const totalMetrics = Array.from(this.queryMetrics.values()).flat();
    const cachedMetrics = totalMetrics.filter((m) => m.cached);

    return {
      totalQueries: totalMetrics.length,
      avgLatency:
        totalMetrics.length > 0
          ? totalMetrics.reduce((sum, m) => sum + m.duration, 0) / totalMetrics.length
          : 0,
      slowestQueries: this.getSlowQueries(5),
      n1Patterns: this.getN1Summary(),
      cacheHitRate:
        totalMetrics.length > 0
          ? (cachedMetrics.length / totalMetrics.length) * 100
          : 0,
    };
  }
}

export const queryOptimizer = new QueryOptimizer();
