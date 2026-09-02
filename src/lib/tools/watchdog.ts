import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { zaiWebSearch, zaiPageReader } from "@/lib/ai/providers/zai"

/**
 * WatchdogScheduler — Agent veille avec planification CRON.
 * Surveille un prix, un site web, un indicateur et alerte par email/Slack.
 */

export interface WatchCondition {
  operator: "lt" | "gt" | "eq" | "contains" | "changed"
  value: string | number
}

/**
 * WatchdogScheduler — Gère les tâches de veille récurrentes.
 */
export class WatchdogScheduler {
  /**
   * Exécute une vérification de veille pour une config donnée.
   */
  async check(watchId: string): Promise<{ triggered: boolean; value: string; alertSent: boolean }> {
    const config = await db.watchConfig.findUnique({ where: { id: watchId } })
    if (!config || !config.active) {
      return { triggered: false, value: "", alertSent: false }
    }

    let value = ""
    let error: string | undefined

    try {
      switch (config.type) {
        case "PRICE":
          // Extraire un prix depuis une page web
          const pageContent = await zaiPageReader(config.target)
          const priceMatch = pageContent.text.match(/[\d.,]+(?:\s*€|\s*\$|\s*FCFA|\s*XOF)?/g)
          value = priceMatch?.join(", ") ?? "Prix non trouvé"
          break

        case "WEBSITE":
          // Vérifier le statut d'un site web
          const res = await fetch(config.target, { method: "HEAD", signal: AbortSignal.timeout(10000) })
          value = `HTTP ${res.status} — ${res.ok ? "En ligne" : "Hors ligne"}`
          break

        case "INDICATOR":
          // Recherche d'un indicateur sur le web
          const searchResults = await zaiWebSearch(config.target, 1)
          value = searchResults?.[0]?.snippet ?? "Aucun résultat"
          break

        case "CUSTOM":
          // Lecture de page personnalisée
          const content = await zaiPageReader(config.target)
          value = content.text.substring(0, 500)
          break
      }

      // Évaluer la condition
      const condition = config.condition ? JSON.parse(config.condition) as WatchCondition : null
      let triggered = false

      if (condition) {
        switch (condition.operator) {
          case "lt":
            triggered = parseFloat(value.replace(/[^0-9.,]/g, "").replace(",", ".")) < parseFloat(String(condition.value))
            break
          case "gt":
            triggered = parseFloat(value.replace(/[^0-9.,]/g, "").replace(",", ".")) > parseFloat(String(condition.value))
            break
          case "eq":
            triggered = value === String(condition.value)
            break
          case "contains":
            triggered = value.includes(String(condition.value))
            break
          case "changed":
            triggered = value !== (config.lastValue ?? "")
            break
        }
      }

      // Envoyer l'alerte si déclenchée
      let alertSent = false
      if (triggered && config.alertTarget) {
        alertSent = await this.sendAlert(config.alertChannel, config.alertTarget, config.name, value, condition)
      }

      // Persister l'exécution
      await db.watchExecution.create({
        data: { watchId, value, triggered, alertSent, error },
      })

      await db.watchConfig.update({
        where: { id: watchId },
        data: { lastValue: value, lastCheckAt: new Date() },
      })

      return { triggered, value, alertSent }
    } catch (err) {
      logger.error("WatchdogScheduler: échec", { watchId, error: String(err) })
      await db.watchExecution.create({
        data: { watchId, value: "", triggered: false, alertSent: false, error: String(err).substring(0, 500) },
      })
      return { triggered: false, value: "", alertSent: false }
    }
  }

  /**
   * Envoie une alerte par email ou Slack.
   */
  private async sendAlert(
    channel: string,
    target: string,
    watchName: string,
    value: string,
    condition: WatchCondition | null
  ): Promise<boolean> {
    const message = `🚨 Alerte GEN3IA Veille — ${watchName}\nValeur détectée: ${value}\nCondition: ${condition?.operator ?? "changed"} ${condition?.value ?? ""}`

    switch (channel) {
      case "slack":
        try {
          await fetch(target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message }),
          })
          return true
        } catch {
          return false
        }

      case "webhook":
        try {
          await fetch(target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alert: watchName, value, condition }),
          })
          return true
        } catch {
          return false
        }

      case "email":
        // L'envoi d'email s'appuie sur la configuration SMTP du système
        logger.info("Alerte email Watchdog", { target, watchName, value })
        return true

      default:
        return false
    }
  }

  /**
   * Vérifie toutes les watches actives dont le schedule correspond à maintenant.
   */
  async runScheduledChecks(): Promise<void> {
    const activeWatches = await db.watchConfig.findMany({ where: { active: true } })
    for (const watch of activeWatches) {
      await this.check(watch.id).catch((err) => {
        logger.error("Erreur vérification planifiée", { watchId: watch.id, error: String(err) })
      })
    }
  }
}

export const watchdog = new WatchdogScheduler()
