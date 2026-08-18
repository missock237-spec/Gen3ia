// ============================================================
// Gen3ia Evolution Engine — Tests: evaluation rules
// ============================================================
// Verifies the rule-based fallback recommendation logic:
//   - all improved → merge
//   - any direction-down metric regressed >50% → rollback
//   - otherwise → hold
// ============================================================

import { describe, it, expect } from 'vitest';
import { snapshotToMetrics } from '../evaluation';
import type { ObservationSnapshot } from '../types';

function makeSnapshot(overrides: Partial<ObservationSnapshot> = {}): ObservationSnapshot {
  return {
    id: 'obs_1',
    evolutionId: 'evo_1',
    capturedAt: new Date().toISOString(),
    errors: [],
    slowRoutes: [],
    failedCIRuns: [],
    incidents: [],
    last24hCostUsd: 0,
    ...overrides,
  };
}

describe('snapshotToMetrics', () => {
  it('returns 7 metric samples', () => {
    const snap = makeSnapshot();
    const metrics = snapshotToMetrics(snap);
    expect(metrics.length).toBe(7);
  });

  it('extracts error count from snapshot', () => {
    const snap = makeSnapshot({ errors: [
      { source: 'test', level: 'error', message: 'e1', timestamp: '' },
      { source: 'test', level: 'error', message: 'e2', timestamp: '' },
      { source: 'test', level: 'error', message: 'e3', timestamp: '' },
    ] });
    const metrics = snapshotToMetrics(snap);
    const errCount = metrics.find((m) => m.name === 'error_count_24h');
    expect(errCount?.value).toBe(3);
    expect(errCount?.direction).toBe('down');
  });

  it('extracts incident count', () => {
    const snap = makeSnapshot({ incidents: [
      { source: 'sentry', severity: 'error', message: 'x', occurredAt: '' },
      { source: 'sentry', severity: 'error', message: 'y', occurredAt: '' },
    ] });
    const metrics = snapshotToMetrics(snap);
    const inc = metrics.find((m) => m.name === 'incident_count_24h');
    expect(inc?.value).toBe(2);
  });

  it('extracts failed CI runs', () => {
    const snap = makeSnapshot({ failedCIRuns: [
      { branch: 'main', commitSha: 'abc', failedAt: '', reason: 'lint' },
    ] });
    const metrics = snapshotToMetrics(snap);
    const f = metrics.find((m) => m.name === 'failed_ci_runs');
    expect(f?.value).toBe(1);
  });

  it('extracts slow routes count', () => {
    const snap = makeSnapshot({ slowRoutes: [
      { route: '/api/a', p95Ms: 3000, sampleCount: 10 },
    ] });
    const metrics = snapshotToMetrics(snap);
    const sr = metrics.find((m) => m.name === 'slow_routes_count');
    expect(sr?.value).toBe(1);
  });

  it('extracts p95 max ms from the first slow route', () => {
    const snap = makeSnapshot({ slowRoutes: [
      { route: '/api/a', p95Ms: 5000, sampleCount: 10 },
      { route: '/api/b', p95Ms: 2000, sampleCount: 5 },
    ] });
    const metrics = snapshotToMetrics(snap);
    const p95 = metrics.find((m) => m.name === 'p95_max_ms');
    expect(p95?.value).toBe(5000);
  });

  it('extracts llm_cost_24h_usd', () => {
    const snap = makeSnapshot({ last24hCostUsd: 12.34 });
    const metrics = snapshotToMetrics(snap);
    const cost = metrics.find((m) => m.name === 'llm_cost_24h_usd');
    expect(cost?.value).toBe(12.34);
  });

  it('returns null p95_max_ms when no slow routes', () => {
    const snap = makeSnapshot({ slowRoutes: [] });
    const metrics = snapshotToMetrics(snap);
    const p95 = metrics.find((m) => m.name === 'p95_max_ms');
    expect(p95?.value).toBeNull();
  });

  it('returns null coverage_pct when not measured', () => {
    const snap = makeSnapshot();
    const metrics = snapshotToMetrics(snap);
    const cov = metrics.find((m) => m.name === 'coverage_pct');
    expect(cov?.value).toBeNull();
  });
});
