import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"

/**
 * Alerting intelligent (v3.6 — observabilité).
 *
 * Règles à SEUILS DYNAMIQUES : chaque règle combine
 *   seuil_effectif = max(seuil_statique, base_24h × multiplicateur)
 * — une plateforme au repos ne déclenche pas de fausses alertes sur des
 * valeurs absolues, une dérive GRADUELLE est rattrapée par la base 24 h.
 *
 * Règles couvertes :
 *  1. code_runner : taux d'erreur > 5 % (5 min) — sandbox/allow-list ;
 *  2. PLANNER : latence p95 > 10 s (15 min) — cache/fournisseur ;
 *  3. EXECUTOR : taux d'échec > 20 % (10 min) — outils/fournisseurs ;
 *  4. webhooks sortants : livraisons en échec > 30 % (15 min).
 *
 * Chaque alerte embarque une RECOMMANDATION D'ACTION concrète.
 * Les alertes sont persistées (AnomalyAlert) et exposées à l'admin.
 */

export interface AlertRuleSpec {
  id: string
  title: string
  staticThreshold: string
  windowMinutes: number
  /** Multiplicateur appliqué à la base 24 h (dynamique). */
  baselineMultiplier: number
  recommendation: (observed: number, threshold: number) => string
}

export const ALERT_RULES: AlertRuleSpec[] = [
  {
    id: "tool.code_runner.error_rate",
    title: "Taux d'erreur de la sandbox code_runner",
    staticThreshold: "5 % sur 5 minutes",
    windowMinutes: 5,
    baselineMultiplier: 2,
    recommendation: (observed, threshold) =>
      `Inspecter les refus sandbox récents (logs « sandbox: code REFUSÉ ») : un pic d'erreurs code_runner signale ` +
      `souvent des codes générés incompatibles avec l'allow-list (identifiants non déclarés) ou des dépassements ` +
      `mémoire/temps. Vérifier la description de l'outil envoyée au moteur d'exécution et la charge des workers ` +
      `(métriques d'instance). Taux observé : ${(observed * 100).toFixed(1)} % (seuil dynamique ${(threshold * 100).toFixed(1)} %).`,
  },
  {
    id: "engine.PLANNER.p95_latency",
    title: "Latence p95 du planificateur",
    staticThreshold: "10 s sur 15 minutes",
    windowMinutes: 15,
    baselineMultiplier: 2,
    recommendation: (observed, threshold) =>
      `Le planificateur dépasse ${(observed / 1000).toFixed(1)} s (seuil ${(threshold / 1000).toFixed(1)} s). ` +
      `Actions : 1) vérifier la latence du fournisseur LLM courant (Santé des modèles) et basculer vers un ` +
      `fournisseur plus rapide si nécessaire, 2) activer le préchauffage du cache de plans ` +
      `(POST /api/admin/engines { action: "warmup-plan-cache" }) pour les demandes récurrentes.`,
  },
  {
    id: "engine.EXECUTOR.failure_rate",
    title: "Taux d'échec du moteur d'exécution",
    staticThreshold: "20 % sur 10 minutes",
    windowMinutes: 10,
    baselineMultiplier: 2,
    recommendation: (observed, threshold) =>
      `Taux d'échec EXECUTOR de ${(observed * 100).toFixed(1)} % (seuil ${(threshold * 100).toFixed(1)} %). ` +
      `Consulter les EngineRun en échec (errorCode dominant) : RETRY_BUDGET_EXCEEDED → un outil externe est ` +
      `instable (circuit breaker ouvert, vérifier les connecteurs) ; NO_PROVIDER → clé LLM manquante/quota épuisé.`,
  },
  {
    id: "webhooks.delivery.failure_rate",
    title: "Livraisons de webhooks sortants en échec",
    staticThreshold: "30 % sur 15 minutes",
    windowMinutes: 15,
    baselineMultiplier: 2,
    recommendation: (observed, threshold) =>
      `${(observed * 100).toFixed(1)} % des livraisons échouent (seuil ${(threshold * 100).toFixed(1)} %). ` +
      `Vérifier l'historique WebhookDelivery : 4xx persistants = URL obsolète ou signature rejetée côté client ` +
      `(repartager le secret) ; timeouts = endpoint lent. Désactiver le webhook défaillant pour éviter le bruit.`,
  },
]

export interface EvaluatedAlert {
  ruleId: string
  title: string
  triggered: boolean
  observed: number
  threshold: number
  thresholdSource: "static" | "dynamic-baseline"
  windowMinutes: number
  recommendation: string
}

/** p95 d'une liste de durées. */
export function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
}

/** Taux d'erreur de code_runner sur une fenêtre (depuis EngineRun.detail). */
async function codeRunnerErrorRate(since: Date): Promise<{ rate: number; runs: number; failures: number } | null> {
  const runs = await db.engineRun.findMany({
    where: { engine: "EXECUTOR", createdAt: { gte: since } },
    select: { ok: true, detail: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  })
  let uses = 0
  let failures = 0
  for (const run of runs) {
    if (!run.detail) continue
    try {
      const detail = JSON.parse(run.detail) as { tools?: string[]; toolFailures?: string[] }
      if (detail.tools?.includes("code_runner")) {
        uses++
        if (detail.toolFailures?.includes("code_runner")) failures++
      }
    } catch {
      /* detail illisible : ignoré */
    }
  }
  if (uses < 5) return null // échantillon insuffisant
  return { rate: failures / uses, runs: uses, failures }
}

/** p95 de latence d'un moteur sur deux fenêtres (courte + base 24 h). */
async function engineLatency(engine: string, since: Date): Promise<number[]> {
  const runs = await db.engineRun.findMany({
    where: { engine, createdAt: { gte: since } },
    select: { durationMs: true },
    take: 2000,
  })
  return runs.map((r) => r.durationMs)
}

/** Taux d'échec d'un moteur. */
async function engineFailureRate(engine: string, since: Date): Promise<{ rate: number; total: number } | null> {
  const runs = await db.engineRun.findMany({
    where: { engine, createdAt: { gte: since } },
    select: { ok: true },
    take: 2000,
  })
  if (runs.length < 5) return null
  const failed = runs.filter((r) => !r.ok).length
  return { rate: failed / runs.length, total: runs.length }
}

/** Taux d'échec des livraisons de webhooks. */
async function webhookFailureRate(since: Date): Promise<{ rate: number; total: number } | null> {
  const deliveries = await db.webhookDelivery.findMany({
    where: { createdAt: { gte: since } },
    select: { statusCode: true, error: true },
    take: 2000,
  })
  if (deliveries.length < 5) return null
  const failed = deliveries.filter((d) => (d.statusCode !== null && d.statusCode >= 400) || d.error !== null).length
  return { rate: failed / deliveries.length, total: deliveries.length }
}

/**
 * Évalue toutes les règles (seuils dynamiques) — persiste les alertes
 * déclenchées dans AnomalyAlert (dédupliquées par 15 min) et retourne
 * l'évaluation complète (y compris non déclenchées, pour l'UI admin).
 */
export async function evaluateAlertRules(): Promise<EvaluatedAlert[]> {
  const now = Date.now()
  const results: EvaluatedAlert[] = []

  // ── Règle 1 : code_runner ─────────────────────────────────────
  try {
    const window5 = new Date(now - 5 * 60_000)
    const day24 = new Date(now - 24 * 3_600_000)
    const current = await codeRunnerErrorRate(window5)
    if (current) {
      const baseline = await codeRunnerErrorRate(day24)
      const dynamic = baseline ? baseline.rate * 2 : 0
      const threshold = Math.max(0.05, dynamic)
      const triggered = current.rate > threshold
      results.push({
        ruleId: "tool.code_runner.error_rate",
        title: ALERT_RULES[0].title,
        triggered,
        observed: Math.round(current.rate * 10000) / 10000,
        threshold: Math.round(threshold * 10000) / 10000,
        thresholdSource: dynamic > 0.05 ? "dynamic-baseline" : "static",
        windowMinutes: 5,
        recommendation: ALERT_RULES[0].recommendation(current.rate, threshold),
      })
      if (triggered) await persistAlert(ALERT_RULES[0], current.rate, threshold, "5 min")
    }
  } catch (err) {
    logRuleError("code_runner", err)
  }

  // ── Règle 2 : p95 PLANNER ─────────────────────────────────────
  try {
    const window15 = new Date(now - 15 * 60_000)
    const day24 = new Date(now - 24 * 3_600_000)
    const currentLat = p95(await engineLatency("PLANNER", window15))
    if (currentLat > 0) {
      const baselineLat = p95(await engineLatency("PLANNER", day24))
      const dynamic = baselineLat * 2
      const threshold = Math.max(10_000, dynamic)
      const triggered = currentLat > threshold
      results.push({
        ruleId: "engine.PLANNER.p95_latency",
        title: ALERT_RULES[1].title,
        triggered,
        observed: currentLat,
        threshold,
        thresholdSource: dynamic > 10_000 ? "dynamic-baseline" : "static",
        windowMinutes: 15,
        recommendation: ALERT_RULES[1].recommendation(currentLat, threshold),
      })
      if (triggered) await persistAlert(ALERT_RULES[1], currentLat, threshold, "15 min")
    }
  } catch (err) {
    logRuleError("PLANNER", err)
  }

  // ── Règle 3 : taux d'échec EXECUTOR ───────────────────────────
  try {
    const window10 = new Date(now - 10 * 60_000)
    const day24 = new Date(now - 24 * 3_600_000)
    const current = await engineFailureRate("EXECUTOR", window10)
    if (current) {
      const baseline = await engineFailureRate("EXECUTOR", day24)
      const dynamic = baseline ? baseline.rate * 2 : 0
      const threshold = Math.max(0.2, dynamic)
      const triggered = current.rate > threshold
      results.push({
        ruleId: "engine.EXECUTOR.failure_rate",
        title: ALERT_RULES[2].title,
        triggered,
        observed: Math.round(current.rate * 10000) / 10000,
        threshold: Math.round(threshold * 10000) / 10000,
        thresholdSource: dynamic > 0.2 ? "dynamic-baseline" : "static",
        windowMinutes: 10,
        recommendation: ALERT_RULES[2].recommendation(current.rate, threshold),
      })
      if (triggered) await persistAlert(ALERT_RULES[2], current.rate, threshold, "10 min")
    }
  } catch (err) {
    logRuleError("EXECUTOR", err)
  }

  // ── Règle 4 : webhooks ────────────────────────────────────────
  try {
    const window15 = new Date(now - 15 * 60_000)
    const day24 = new Date(now - 24 * 3_600_000)
    const current = await webhookFailureRate(window15)
    if (current) {
      const baseline = await webhookFailureRate(day24)
      const dynamic = baseline ? baseline.rate * 2 : 0
      const threshold = Math.max(0.3, dynamic)
      const triggered = current.rate > threshold
      results.push({
        ruleId: "webhooks.delivery.failure_rate",
        title: ALERT_RULES[3].title,
        triggered,
        observed: Math.round(current.rate * 10000) / 10000,
        threshold: Math.round(threshold * 10000) / 10000,
        thresholdSource: dynamic > 0.3 ? "dynamic-baseline" : "static",
        windowMinutes: 15,
        recommendation: ALERT_RULES[3].recommendation(current.rate, threshold),
      })
      if (triggered) await persistAlert(ALERT_RULES[3], current.rate, threshold, "15 min")
    }
  } catch (err) {
    logRuleError("webhooks", err)
  }

  return results
}

async function persistAlert(rule: AlertRuleSpec, observed: number, threshold: number, window: string): Promise<void> {
  try {
    // Dédup : une alerte par règle toutes les 15 minutes.
    const dedupSince = new Date(Date.now() - 15 * 60_000)
    const existing = await db.anomalyAlert.findFirst({
      where: { type: "ALERT_RULE", metric: rule.id, createdAt: { gte: dedupSince } },
      select: { id: true },
    })
    if (existing) return
    await db.anomalyAlert.create({
      data: {
        type: "ALERT_RULE",
        severity: "WARNING",
        message: `${rule.title} : valeur ${observed} > seuil ${threshold} (fenêtre ${window})`,
        metric: rule.id,
        threshold,
        actualValue: observed,
        action: "ALERT",
      },
    })
  } catch {
    /* la persistance d'alerte ne doit jamais interrompre l'évaluation */
  }
}

function logRuleError(scope: string, err: unknown): void {
  logger.warn("alerting: règle non évaluable (non bloquant)", {
    scope,
    error: err instanceof Error ? err.message : String(err),
  })
}
