// ============================================================
// INTRUSION DETECTOR — Détection de patterns anormaux
// ============================================================
// Analyse les logs d'accès et identifie les comportements
// suspects : brute force, scraping, usage anormal, etc.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";
import { auditTrail } from "./audit-trail";

export type ThreatLevel = "low" | "medium" | "high" | "critical";

export interface IntrusionAlert {
  id: string;
  userId: string;
  type: IntrusionType;
  level: ThreatLevel;
  source: string;
  description: string;
  details: Record<string, unknown>;
  timestamp: Date;
  acknowledged: boolean;
}

export type IntrusionType =
  | "brute_force"
  | "rate_limit_burst"
  | "unusual_location"
  | "suspicious_endpoint"
  | "token_reuse"
  | "mass_scraping"
  | "api_abuse"
  | "unauthorized_access";

interface DetectionThreshold {
  type: IntrusionType;
  windowMs: number;
  threshold: number;
  level: ThreatLevel;
}

const DEFAULT_THRESHOLDS: DetectionThreshold[] = [
  { type: "brute_force", windowMs: 300000, threshold: 10, level: "high" },     // 10 tentatives/5min
  { type: "rate_limit_burst", windowMs: 60000, threshold: 50, level: "medium" }, // 50 requêtes/min
  { type: "unusual_location", windowMs: 3600000, threshold: 3, level: "high" }, // 3 pays différents/h
  { type: "mass_scraping", windowMs: 60000, threshold: 100, level: "medium" },  // 100 req/min
  { type: "api_abuse", windowMs: 3600000, threshold: 1000, level: "low" },      // 1000 req/h
  { type: "unauthorized_access", windowMs: 600000, threshold: 5, level: "critical" }, // 5 échecs auth/10min
];

class IntrusionDetector {
  private thresholds: DetectionThreshold[];
  private alertCache: Map<string, number> = new Map();

  constructor(thresholds?: DetectionThreshold[]) {
    this.thresholds = thresholds ?? DEFAULT_THRESHOLDS;
  }

  // ============================================================
  // Analyser un événement et détecter des anomalies
  // ============================================================
  async analyze(params: {
    userId: string;
    action: string;
    endpoint?: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
    statusCode?: number;
  }): Promise<IntrusionAlert | null> {
    try {
      // Analyser chaque type de menace
      const checks = await Promise.all([
        this.detectBruteForce(params),
        this.detectRateLimitBurst(params),
        this.detectSuspiciousEndpoint(params),
        this.detectUnauthorizedAccess(params),
      ]);

      const alerts = checks.filter(Boolean) as IntrusionAlert[];

      if (alerts.length === 0) return null;

      // Prendre l'alerte la plus sévère
      const alert = alerts.sort((a, b) => this.threatScore(b.level) - this.threatScore(a.level))[0]!;

      // Éviter les doublons (même type + userId, pas plus d'une par minute)
      const cacheKey = `${alert.type}_${alert.userId}`;
      const lastAlert = this.alertCache.get(cacheKey);
      if (lastAlert && Date.now() - lastAlert < 60000) {
        return null;
      }
      this.alertCache.set(cacheKey, Date.now());

      // Journaliser
      logger.warn("intrusion_detected", {
        type: alert.type,
        level: alert.level,
        userId: alert.userId.slice(0, 8),
        description: alert.description,
      });

      // Sauvegarder l'alerte
      await prisma.intrusionAlert.create({
        data: {
          userId: alert.userId,
          type: alert.type,
          level: alert.level,
          source: alert.source,
          description: alert.description,
          details: JSON.stringify(alert.details),
          timestamp: alert.timestamp,
          acknowledged: false,
        },
      });

      // Audit trail pour les alertes critiques
      if (alert.level === "high" || alert.level === "critical") {
        await auditTrail.log({
          userId: alert.userId,
          action: "security.alert",
          resource: "intrusion_detection",
          details: {
            type: alert.type,
            level: alert.level,
            description: alert.description,
          },
          severity: alert.level === "critical" ? "critical" : "warning",
          ipAddress: params.ipAddress,
        });

        // TODO: Notification temps réel (email, slack, webhook)
        // await notificationService.sendAlert(alert);
      }

      return alert;
    } catch (error) {
      logger.error("intrusion_detection_analysis_failed", { error: String(error) });
      return null;
    }
  }

  // ============================================================
  // Détection de brute force (tentatives échouées répétées)
  // ============================================================
  private async detectBruteForce(params: {
    userId: string;
    success: boolean;
    ipAddress?: string;
  }): Promise<IntrusionAlert | null> {
    if (params.success) return null;

    const threshold = this.thresholds.find((t) => t.type === "brute_force")!;
    const since = new Date(Date.now() - threshold.windowMs);

    const failedAttempts = await prisma.authLog.count({
      where: {
        userId: params.userId,
        success: false,
        createdAt: { gte: since },
      },
    });

    if (failedAttempts >= threshold.threshold) {
      return {
        id: `bf_${Date.now()}`,
        userId: params.userId,
        type: "brute_force",
        level: threshold.level,
        source: params.ipAddress ?? "unknown",
        description: `${failedAttempts} tentatives échouées en ${threshold.windowMs / 60000}min`,
        details: { failedAttempts, windowMs: threshold.windowMs, ip: params.ipAddress },
        timestamp: new Date(),
        acknowledged: false,
      };
    }

    return null;
  }

  // ============================================================
  // Détection de burst de rate limiting
  // ============================================================
  private async detectRateLimitBurst(params: {
    userId: string;
    statusCode?: number;
  }): Promise<IntrusionAlert | null> {
    if (params.statusCode !== 429) return null;

    const threshold = this.thresholds.find((t) => t.type === "rate_limit_burst")!;
    const since = new Date(Date.now() - threshold.windowMs);

    const rateLimited = await prisma.rateLimit.count({
      where: {
        userId: params.userId,
        blocked: true,
        updatedAt: { gte: since },
      },
    });

    if (rateLimited >= threshold.threshold) {
      return {
        id: `rlb_${Date.now()}`,
        userId: params.userId,
        type: "rate_limit_burst",
        level: threshold.level,
        source: "rate_limiter",
        description: `${rateLimited} blocages rate limit en ${threshold.windowMs / 60000}min`,
        details: { rateLimitedCount: rateLimited, windowMs: threshold.windowMs },
        timestamp: new Date(),
        acknowledged: false,
      };
    }

    return null;
  }

  // ============================================================
  // Détection d'accès à des endpoints sensibles
  // ============================================================
  private async detectSuspiciousEndpoint(params: {
    userId: string;
    endpoint?: string;
  }): Promise<IntrusionAlert | null> {
    const suspiciousPatterns = [
      /\.env/i, /\.git/i, /admin\/backup/i, /api\/debug/i,
      /sql/i, /wp-admin/i, /phpmyadmin/i, /config\./i,
      /aws\-key/i, /secret/i, /token/i,
    ];

    if (!params.endpoint) return null;

    const matched = suspiciousPatterns.find((p) => p.test(params.endpoint));
    if (!matched) return null;

    const threshold = this.thresholds.find((t) => t.type === "suspicious_endpoint");

    return {
      id: `se_${Date.now()}`,
      userId: params.userId,
      type: "suspicious_endpoint",
      level: (threshold?.level ?? "high") as ThreatLevel,
      source: params.endpoint,
      description: `Tentative d'accès suspect: ${params.endpoint}`,
      details: { endpoint: params.endpoint, pattern: matched.source },
      timestamp: new Date(),
      acknowledged: false,
    };
  }

  // ============================================================
  // Détection d'accès non autorisé
  // ============================================================
  private async detectUnauthorizedAccess(params: {
    userId: string;
    statusCode?: number;
    success: boolean;
  }): Promise<IntrusionAlert | null> {
    if (params.statusCode !== 401 && params.statusCode !== 403) return null;
    if (params.success) return null;

    const threshold = this.thresholds.find((t) => t.type === "unauthorized_access")!;
    const since = new Date(Date.now() - threshold.windowMs);

    const unauthorizedCount = await prisma.requestLog.count({
      where: {
        userId: params.userId,
        statusCode: { in: [401, 403] },
        createdAt: { gte: since },
      },
    });

    if (unauthorizedCount >= threshold.threshold) {
      return {
        id: `ua_${Date.now()}`,
        userId: params.userId,
        type: "unauthorized_access",
        level: threshold.level,
        source: "auth_service",
        description: `${unauthorizedCount} tentatives non autorisées en ${threshold.windowMs / 60000}min`,
        details: { unauthorizedCount, windowMs: threshold.windowMs },
        timestamp: new Date(),
        acknowledged: false,
      };
    }

    return null;
  }

  // ============================================================
  // Récupérer les alertes récentes
  // ============================================================
  async getAlerts(params: {
    level?: ThreatLevel;
    type?: IntrusionType;
    acknowledged?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: any = {};
    if (params.level) where.level = params.level;
    if (params.type) where.type = params.type;
    if (params.acknowledged !== undefined) where.acknowledged = params.acknowledged;

    const [alerts, total] = await Promise.all([
      prisma.intrusionAlert.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.intrusionAlert.count({ where }),
    ]);

    return { alerts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ============================================================
  // Acquitter une alerte
  // ============================================================
  async acknowledge(alertId: string): Promise<boolean> {
    try {
      await prisma.intrusionAlert.update({
        where: { id: alertId },
        data: { acknowledged: true },
      });
      return true;
    } catch (error) {
      logger.error("intrusion_alert_acknowledge_failed", { error: String(error), alertId });
      return false;
    }
  }

  // ============================================================
  // Score de sévérité
  // ============================================================
  private threatScore(level: ThreatLevel): number {
    const scores: Record<ThreatLevel, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return scores[level] ?? 0;
  }
}

export const intrusionDetector = new IntrusionDetector();