// Anomaly Detector — detecte les comportements suspects des agents IA
// Scurite proactive: bloque avant que les degats ne soient faits

import { prisma } from '@/lib/prisma';

interface AgentAction {
  agentId: string;
  userId: string;
  action: string;
  service: string;
  params: Record<string, unknown>;
  timestamp: Date;
  ip?: string;
}

interface Alert {
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  agentId: string;
  userId: string;
  metadata: Record<string, unknown>;
}

interface DetectionResult {
  blocked: boolean;
  alerts: Alert[];
  reason?: string;
}

const WINDOW_MS = 60000;
const MAX_ACTIONS_PER_MINUTE = 30;
const MAX_SAME_ACTION_PER_MINUTE = 10;
const MAX_FAILURES_BEFORE_BLOCK = 5;
const MAX_DIFFERENT_SERVICES_PER_HOUR = 8;

// Memoire des actions recentes (en memoire, pas en BDD pour la rapidite)
const actionHistory = new Map<string, AgentAction[]>();
const failureCount = new Map<string, number>();
const serviceAccessCount = new Map<string, Set<string>>();

setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [key, actions] of actionHistory.entries()) {
    const filtered = actions.filter(a => a.timestamp.getTime() > cutoff);
    if (filtered.length === 0) actionHistory.delete(key);
    else actionHistory.set(key, filtered);
  }
  for (const [key] of failureCount.entries()) {
    const entry = failureCount.get(key);
    if (entry && entry < 0) failureCount.delete(key);
  }
}, 300000);

export async function detectAnomalies(action: AgentAction): Promise<DetectionResult> {
  const alerts: Alert[] = [];
  const agentKey = action.agentId;

  if (!actionHistory.has(agentKey)) {
    actionHistory.set(agentKey, []);
  }
  const history = actionHistory.get(agentKey)!;
  history.push(action);

  // 1. Freqence globale: trop d'actions par minute
  const recentActions = history.filter(a =>
    a.timestamp.getTime() > Date.now() - WINDOW_MS
  );
  if (recentActions.length > MAX_ACTIONS_PER_MINUTE) {
    alerts.push({
      severity: 'high',
      type: 'RATE_LIMIT_EXCEEDED',
      message: 'Agent execute plus de ' + MAX_ACTIONS_PER_MINUTE + ' actions par minute',
      agentId: action.agentId,
      userId: action.userId,
      metadata: { count: recentActions.length, window: WINDOW_MS },
    });
  }

  // 2. Meme action repetee: boucle ou attaque
  const sameActions = recentActions.filter(a =>
    a.action === action.action && a.service === action.service
  );
  if (sameActions.length > MAX_SAME_ACTION_PER_MINUTE) {
    alerts.push({
      severity: 'medium',
      type: 'REPETITIVE_ACTION',
      message: 'Action "' + action.action + '" sur ' + action.service + ' repetee ' + sameActions.length + ' fois',
      agentId: action.agentId,
      userId: action.userId,
      metadata: { action: action.action, service: action.service, count: sameActions.length },
    });
  }

  // 3. Echecs consecutifs: token expire ou comportement anormal
  const failKey = agentKey + ':' + action.service;
  const fails = failureCount.get(failKey) || 0;
  if (fails >= MAX_FAILURES_BEFORE_BLOCK) {
    alerts.push({
      severity: 'critical',
      type: 'CONSECUTIVE_FAILURES',
      message: 'Agent a echoue ' + fails + ' fois sur ' + action.service + ' (bloque)',
      agentId: action.agentId,
      userId: action.userId,
      metadata: { service: action.service, failures: fails },
    });
    return { blocked: true, alerts, reason: 'Trop d\'echecs consecutifs sur ' + action.service };
  }

  // 4. Trop de services differents: tentative d'exfiltration
  const serviceKey = agentKey + ':services';
  if (!serviceAccessCount.has(serviceKey)) {
    serviceAccessCount.set(serviceKey, new Set());
  }
  const services = serviceAccessCount.get(serviceKey)!;
  services.add(action.service);
  if (services.size > MAX_DIFFERENT_SERVICES_PER_HOUR) {
    alerts.push({
      severity: 'high',
      type: 'SERVICE_SCANNING',
      message: 'Agent accede a ' + services.size + ' services differents (max autorise: ' + MAX_DIFFERENT_SERVICES_PER_HOUR + ')',
      agentId: action.agentId,
      userId: action.userId,
      metadata: { servicesCount: services.size, services: Array.from(services) },
    });
  }

  // 5. Action hors plage horaire (ex: 3h du matin)
  const hour = new Date().getHours();
  if (hour >= 0 && hour <= 5) {
    alerts.push({
      severity: 'low',
      type: 'ODD_HOURS_ACTIVITY',
      message: 'Action effectuee entre 0h et 5h',
      agentId: action.agentId,
      userId: action.userId,
      metadata: { hour },
    });
  }

  // Si alertes critiques, enregistrer dans monitoring
  if (alerts.length > 0) {
    await prisma.monitoringEvent.createMany({
      data: alerts.filter(a => a.severity === 'critical' || a.severity === 'high').map(a => ({
        userId: action.userId,
        eventType: 'security_alert',
        source: 'anomaly_detector',
        message: a.message,
        details: JSON.stringify(a),
        severity: a.severity,
      })),
    });
  }

  return { blocked: alerts.some(a => a.severity === 'critical'), alerts };
}

export function recordFailure(agentId: string, service: string): void {
  const key = agentId + ':' + service;
  failureCount.set(key, (failureCount.get(key) || 0) + 1);
}

export function recordSuccess(agentId: string, service: string): void {
  const key = agentId + ':' + service;
  failureCount.delete(key);
}

export async function getAgentSecurityStatus(agentId: string): Promise<{
  recentActions: number;
  failures: number;
  alerts: number;
  blocked: boolean;
}> {
  const history = actionHistory.get(agentId) || [];
  const failureKeys = Array.from(failureCount.keys()).filter(k => k.startsWith(agentId));
  const totalFailures = failureKeys.reduce((sum, k) => sum + (failureCount.get(k) || 0), 0);

  const recentAlerts = await prisma.monitoringEvent.count({
    where: {
      source: 'anomaly_detector',
      createdAt: { gte: new Date(Date.now() - 3600000) },
    },
  });

  return {
    recentActions: history.length,
    failures: totalFailures,
    alerts: recentAlerts,
    blocked: totalFailures >= MAX_FAILURES_BEFORE_BLOCK,
  };
}
