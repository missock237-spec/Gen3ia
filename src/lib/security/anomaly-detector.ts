import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"

/**
 * AnomalyDetector — Détection d'anomalies en temps réel.
 * Analyse les logs d'exécution pour détecter :
 *  - Boucles de retry (trop de tentatives en peu de temps)
 *  - Coûts anormaux (pics de consommation de crédits)
 *  - Échecs répétés (taux d'échec anormal)
 *  - Temps d'exécution anormaux
 */

export interface AnomalyThresholds {
  maxRetriesPerTask: number
  maxCreditsPerHour: number
  maxFailureRate: number // % d'échec sur la dernière heure
  maxLatencyMs: number
  detectionWindowMinutes: number
}

const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  maxRetriesPerTask: 15,
  maxCreditsPerHour: 1000,
  maxFailureRate: 0.5, // 50%
  maxLatencyMs: 120_000, // 2 min
  detectionWindowMinutes: 60,
}

export type AnomalyType = "LOOP" | "COST_SPIKE" | "FAILURE_RATE" | "LATENCY"
export type AnomalyAction = "ALERT" | "THROTTLE" | "BLOCK"
export type AnomalySeverity = "INFO" | "WARNING" | "CRITICAL"

/**
 * AnomalyDetector — Moteur de détection d'anomalies en temps réel.
 */
export class AnomalyDetector {
  private thresholds: AnomalyThresholds

  constructor(thresholds: Partial<AnomalyThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  }

  /**
   * Analyse les exécutions récentes et détecte les anomalies.
   */
  async detect(): Promise<void> {
    const since = new Date(Date.now() - this.thresholds.detectionWindowMinutes * 60 * 1000)

    // 1. Détection de boucles de retry
    const retryHeavyTasks = await db.task.findMany({
      where: { totalRetries: { gte: this.thresholds.maxRetriesPerTask }, updatedAt: { gte: since } },
      take: 10,
    })
    for (const task of retryHeavyTasks) {
      await this.createAlert({
        type: "LOOP",
        severity: "CRITICAL",
        message: `Boucle de retry détectée sur la tâche ${task.id} (${task.totalRetries} retries)`,
        actualValue: task.totalRetries,
        threshold: this.thresholds.maxRetriesPerTask,
        action: "BLOCK",
        userId: task.userId,
      })
    }

    // 2. Détection de pics de coût
    const recentTransactions = await db.transaction.findMany({
      where: { createdAt: { gte: since } },
      select: { amount: true, userId: true },
    })
    const creditsByUser = new Map<string, number>()
    for (const tx of recentTransactions) {
      const abs = Math.abs(tx.amount)
      creditsByUser.set(tx.userId, (creditsByUser.get(tx.userId) ?? 0) + abs)
    }
    for (const [userId, totalCredits] of creditsByUser) {
      if (totalCredits > this.thresholds.maxCreditsPerHour) {
        await this.createAlert({
          type: "COST_SPIKE",
          severity: "WARNING",
          message: `Pic de consommation : ${totalCredits} crédits en ${this.thresholds.detectionWindowMinutes} min`,
          actualValue: totalCredits,
          threshold: this.thresholds.maxCreditsPerHour,
          action: "THROTTLE",
          userId,
        })
      }
    }

    // 3. Détection du taux d'échec
    const recentTasks = await db.task.findMany({
      where: { updatedAt: { gte: since } },
      select: { status: true, userId: true },
    })
    const tasksByUser = new Map<string, { total: number; failed: number }>()
    for (const t of recentTasks) {
      const cur = tasksByUser.get(t.userId) ?? { total: 0, failed: 0 }
      cur.total++
      if (t.status === "FAILED") cur.failed++
      tasksByUser.set(t.userId, cur)
    }
    for (const [userId, stats] of tasksByUser) {
      if (stats.total >= 5) {
        const failureRate = stats.failed / stats.total
        if (failureRate > this.thresholds.maxFailureRate) {
          await this.createAlert({
            type: "FAILURE_RATE",
            severity: "CRITICAL",
            message: `Taux d'échec élevé : ${(failureRate * 100).toFixed(1)}% (${stats.failed}/${stats.total})`,
            actualValue: failureRate,
            threshold: this.thresholds.maxFailureRate,
            action: "THROTTLE",
            userId,
          })
        }
      }
    }

    // 4. Détection de latence anormale
    const slowRuns = await db.engineRun.findMany({
      where: { durationMs: { gte: this.thresholds.maxLatencyMs }, createdAt: { gte: since } },
      take: 10,
    })
    for (const run of slowRuns) {
      await this.createAlert({
        type: "LATENCY",
        severity: "WARNING",
        message: `Exécution lente : ${run.durationMs}ms (moteur ${run.engine})`,
        actualValue: run.durationMs,
        threshold: this.thresholds.maxLatencyMs,
        action: "ALERT",
        userId: run.userId ?? undefined,
      })
    }
  }

  private async createAlert(params: {
    type: AnomalyType
    severity: AnomalySeverity
    message: string
    actualValue: number
    threshold: number
    action: AnomalyAction
    userId?: string
  }): Promise<void> {
    await db.anomalyAlert.create({
      data: {
        userId: params.userId,
        type: params.type,
        severity: params.severity,
        message: params.message,
        metric: params.type,
        threshold: params.threshold,
        actualValue: params.actualValue,
        action: params.action,
      },
    })
    logger.warn("Anomalie détectée", params)
  }

  /**
   * Vérifie si un utilisateur doit être bloqué (alertes CRITICAL non résolues).
   */
  async shouldBlock(userId: string): Promise<boolean> {
    const criticalAlerts = await db.anomalyAlert.count({
      where: { userId, severity: "CRITICAL", resolved: false, action: "BLOCK" },
    })
    return criticalAlerts > 0
  }
}

export const anomalyDetector = new AnomalyDetector()
