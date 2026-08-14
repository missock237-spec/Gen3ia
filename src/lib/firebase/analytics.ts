// ============================================================
// Gen3ia — Firebase Analytics layer
// ============================================================
//  Remplace :
//    - src/lib/analytics.ts (trackAgentUsage, trackAICost, aggregateDailyUsage, logMonitoringEvent)
//    - src/lib/audit-trail.ts (audit logs)
//
//  Stratégie hybride :
//    - Côté client : Firebase Analytics SDK (évents marketing / produit)
//    - Côté serveur : persistance des logs structurés dans Firestore
//      (collections `analytics_events`, `audit_logs`, `monitoring_events`)
//      + export optionnel vers BigQuery (via extension Firebase)
//
//  Les données opérationnelles (usage agent, coûts IA, métriques
//  temps réel) restent dans Firestore pour requêtes SQL-like
//  immédiates depuis les API routes / dashboards.
// ============================================================

import { db, Collections } from './firestore';

// ============================================================
// Log générique dans Firestore
// ============================================================

export interface LogEventInput {
  collection: string;
  data: Record<string, unknown>;
}

export async function logEvent(input: LogEventInput): Promise<void> {
  // On délègue vers la collection Firestore dédiée
  const repo = (db as unknown as Record<string, { create: (opts: { data: Record<string, unknown> }) => Promise<unknown> }>)[
    input.collection
  ];
  if (repo && typeof repo.create === 'function') {
    await repo.create({ data: input.data });
    return;
  }
  // Fallback : collection générique analytics_events
  await (db as unknown as { analyticsEvent: { create: (opts: { data: Record<string, unknown> }) => Promise<unknown> } }).analyticsEvent.create({
    data: { ...input.data, collection: input.collection, createdAt: new Date() },
  });
}

// ============================================================
// Track agent usage (équivalent Prisma agentUsage.create)
// ============================================================

interface TrackAgentUsageParams {
  agentId: string;
  userId: string;
  action: string;
  tokensUsed?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
  status?: string;
}

export async function trackAgentUsage(params: TrackAgentUsageParams): Promise<void> {
  const { agentId, userId, action, tokensUsed = 0, duration = 0, metadata = {}, status = 'success' } = params;
  await db.agentUsage.create({
    data: {
      agentId,
      userId,
      action,
      tokensUsed,
      duration,
      status,
      metadata: JSON.stringify(metadata),
      createdAt: new Date(),
    },
  });
}

// ============================================================
// Track AI costs
// ============================================================

interface TrackAICostParams {
  userId: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  requestId?: string;
  agentId?: string;
}

export async function trackAICost(params: TrackAICostParams): Promise<void> {
  const { userId, provider, model, promptTokens = 0, completionTokens = 0, costUsd = 0, requestId, agentId } = params;
  await db.aICost.create({
    data: {
      userId,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      costUsd,
      requestId,
      agentId,
      createdAt: new Date(),
    },
  });
}

// ============================================================
// Daily aggregation
// ============================================================

export async function aggregateDailyUsage(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Récupération des events du jour
  const agentUsages = await db.agentUsage.findMany({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'createdAt', op: '>=', value: today },
      { field: 'createdAt', op: '<', value: tomorrow },
    ],
  });

  const costs = await db.aICost.findMany({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'createdAt', op: '>=', value: today },
      { field: 'createdAt', op: '<', value: tomorrow },
    ],
  });

  const tasks = await db.task.count({
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'createdAt', op: '>=', value: today },
      { field: 'createdAt', op: '<', value: tomorrow },
    ],
  });

  const distinctAgents = new Set(agentUsages.map((u) => (u as Record<string, unknown>).agentId as string));
  const totalTokens =
    agentUsages.reduce((s, u) => s + ((u as Record<string, unknown>).tokensUsed as number) || 0, 0) +
    costs.reduce((s, c) => s + ((c as Record<string, unknown>).totalTokens as number) || 0, 0);
  const totalCost = costs.reduce((s, c) => s + ((c as Record<string, unknown>).costUsd as number) || 0, 0);
  const apiCalls = agentUsages.length + costs.length;

  // Upsert dans usage_daily (ID composite userId_date)
  const dateStr = today.toISOString().split('T')[0];
  const docId = `${userId}_${dateStr}`;

  await db.usageDaily.upsert({
    where: { id: docId },
    create: {
      userId,
      date: today,
      agentCount: distinctAgents.size,
      taskCount: tasks,
      totalTokens,
      totalCostUsd: totalCost,
      apiCalls,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {
      agentCount: distinctAgents.size,
      taskCount: tasks,
      totalTokens,
      totalCostUsd: totalCost,
      apiCalls,
      updatedAt: new Date(),
    },
  });
}

// ============================================================
// Monitoring events
// ============================================================

interface LogMonitoringEventParams {
  userId: string;
  eventType: string;
  source: string;
  message: string;
  details?: Record<string, unknown>;
  severity?: string;
}

export async function logMonitoringEvent(params: LogMonitoringEventParams): Promise<void> {
  const { userId, eventType, source, message, details = {}, severity = 'info' } = params;
  await db.monitoringEvent.create({
    data: {
      userId,
      eventType,
      source,
      message,
      details: JSON.stringify(details),
      severity,
      createdAt: new Date(),
    },
  });
}

// ============================================================
// Audit trail (équivalent auditLog.create)
// ============================================================

export interface AuditLogInput {
  userId: string;
  action: string;
  resource?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity?: string;
}

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      resource: input.resource || 'unknown',
      details: JSON.stringify(input.details || {}),
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
      severity: input.severity || 'info',
      createdAt: new Date(),
    },
  });
}

// ============================================================
// Client-side wrapper (delegating to Firebase Analytics SDK)
// ============================================================

export async function trackClientEvent(
  eventName: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const { getFirebaseAnalytics } = await import('./client');
    const analytics = await getFirebaseAnalytics();
    if (!analytics) return;
    const { logEvent } = await import('firebase/analytics');
    logEvent(analytics, eventName, params);
  } catch {
    // Non bloquant
  }
}

// ============================================================
// Export de collections pour compat
// ============================================================

export { Collections };
