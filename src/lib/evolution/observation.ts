// ============================================================
// Gen3ia Evolution Engine — Observation
// ============================================================
// Collects a snapshot of current system state from existing
// sources (Firestore collections: agentInvocation, agentExecution,
// agentActionLog, monitoringEvent, auditLog, aICost, alertEvent).
//
// No new instrumentation: we read what the app already produces.
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { generateId } from './memory';
import type { ObservationSnapshot, ObservationEntry } from './types';

const log = createLogger('evolution-observation');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function captureObservation(
  evolutionId: string,
  scope?: string
): Promise<ObservationSnapshot> {
  const since = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const snap: ObservationSnapshot = {
    id: generateId('obs'),
    evolutionId,
    capturedAt: new Date().toISOString(),
    errors: [],
    slowRoutes: [],
    failedCIRuns: [],
    incidents: [],
    last24hCostUsd: 0,
  };

  // 1. Recent errors from agentActionLog
  try {
    const logs = await db.agentActionLog.findMany({
      where: { level: { in: ['error', 'fatal'] }, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' } as unknown as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const items = (logs ?? []) as unknown as { level: string; message: string; createdAt: string; action?: string; metadata?: Record<string, unknown> }[];
    for (const e of items.slice(0, 50)) {
      snap.errors.push({
        source: 'agentActionLog',
        level: e.level as ObservationEntry['level'],
        message: e.message ?? e.action ?? '',
        timestamp: e.createdAt,
        metadata: e.metadata,
      });
    }
  } catch (err) {
    log.warn('agentActionLog read failed', { error: String(err) });
  }

  // 2. Recent Sentry / monitoring events (monitoringEvent collection)
  try {
    const events = await db.monitoringEvent.findMany({
      where: { severity: { in: ['error', 'fatal', 'critical'] }, occurredAt: { gt: since } },
      orderBy: { occurredAt: 'desc' } as unknown as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const items = (events ?? []) as unknown as { severity: string; message: string; occurredAt: string; source?: string }[];
    for (const e of items.slice(0, 30)) {
      snap.incidents.push({
        source: e.source ?? 'monitoringEvent',
        severity: e.severity,
        message: e.message,
        occurredAt: e.occurredAt,
      });
    }
  } catch (err) {
    log.warn('monitoringEvent read failed', { error: String(err) });
  }

  // 3. Recent failed CI runs (auditLog action=CI_BUILD_FAILED if present)
  try {
    const audits = await db.auditLog.findMany({
      where: { action: { contains: 'CI' } },
      orderBy: { createdAt: 'desc' } as unknown as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const items = (audits ?? []) as unknown as { action: string; description: string; createdAt: string; metadata?: { branch?: string; commitSha?: string; reason?: string } }[];
    for (const a of items.slice(0, 20)) {
      if (a.action.includes('FAILED')) {
        snap.failedCIRuns.push({
          branch: a.metadata?.branch ?? 'unknown',
          commitSha: a.metadata?.commitSha ?? 'unknown',
          failedAt: a.createdAt,
          reason: a.metadata?.reason ?? a.description ?? '',
        });
      }
    }
  } catch (err) {
    log.warn('auditLog read failed', { error: String(err) });
  }

  // 4. Slow routes — pull from agentInvocation where durationMs > 2000
  try {
    const invocations = await db.agentInvocation.findMany({
      where: { durationMs: { gt: 2000 } },
      orderBy: { durationMs: 'desc' } as unknown as never,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const items = (invocations ?? []) as unknown as { metadata?: { route?: string; path?: string }; durationMs: number }[];
    const routeMap = new Map<string, { samples: number; total: number }>();
    for (const inv of items.slice(0, 200)) {
      const route = inv.metadata?.route ?? inv.metadata?.path ?? 'unknown';
      const cur = routeMap.get(route) ?? { samples: 0, total: 0 };
      cur.samples += 1;
      cur.total += inv.durationMs;
      routeMap.set(route, cur);
    }
    for (const [route, agg] of routeMap.entries()) {
      snap.slowRoutes.push({
        route,
        p95Ms: Math.round(agg.total / agg.samples),
        sampleCount: agg.samples,
      });
    }
    snap.slowRoutes.sort((a, b) => b.p95Ms - a.p95Ms);
    snap.slowRoutes = snap.slowRoutes.slice(0, 10);
  } catch (err) {
    log.warn('agentInvocation read failed', { error: String(err) });
  }

  // 5. Aggregate LLM cost for last 24h
  try {
    const costs = await db.aICost.findMany({
      where: { createdAt: { gt: since } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const items = (costs ?? []) as unknown as { costUsd?: number }[];
    snap.last24hCostUsd = items.reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
  } catch (err) {
    log.warn('aICost read failed', { error: String(err) });
  }

  // Coverage delta: not available without a coverage report — leave undefined.

  log.info('observation captured', {
    evolutionId,
    scope: scope ?? 'all',
    errors: snap.errors.length,
    incidents: snap.incidents.length,
    slowRoutes: snap.slowRoutes.length,
    failedCIRuns: snap.failedCIRuns.length,
    last24hCostUsd: snap.last24hCostUsd.toFixed(4),
  });

  return snap;
}
