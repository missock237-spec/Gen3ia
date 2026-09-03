import { db } from "@/lib/db"
import { createHmac } from "crypto"
import { logger } from "@/lib/observability/logger"

/**
 * OutboundWebhookManager — Webhooks sortants (v3.6 : pipeline complet).
 *
 * Notifie des systèmes externes aux ÉVÉNEMENTS CLÉS du pipeline :
 *  task.created, plan.generated, plan.approved, plan.rejected,
 *  task.awaiting_human, task.approval_expired, task.completed,
 *  task.failed, task.cancelled.
 *
 * Qualité de service :
 *  - émission NON BLOQUANTE (emitPipelineEvent = fire-and-forget : le
 *    pipeline n'attend JAMAIS la livraison) ;
 *  - retry avec backoff exponentiel (1s/2s), signature HMAC SHA-256,
 *    timeout 10 s, pas de retry sur 4xx ;
 *  - historique de livraison persisté (WebhookDelivery) ;
 *  - filtrage par agent/tâche à la souscription.
 */

/** Catalogue des événements émettables (validation + UI). */
export const PIPELINE_EVENTS = [
  "task.created",
  "task.approved",
  "plan.generated",
  "plan.approved",
  "plan.rejected",
  "task.awaiting_human",
  "task.approval_expired",
  "task.completed",
  "task.failed",
  "task.cancelled",
] as const

export type PipelineEvent = (typeof PIPELINE_EVENTS)[number]

/**
 * Émet un événement du pipeline vers les webhooks de l'utilisateur.
 * NON BLOQUANT : aucune erreur, aucun délai de livraison ne peut ralentir
 * le pipeline — l'émission est asynchrone et supervisée (log seul).
 */
export function emitPipelineEvent(params: {
  userId: string
  event: PipelineEvent
  payload: Record<string, unknown>
  agentId?: string | null
  taskId?: string | null
}): void {
  void (async () => {
    try {
      await triggerWebhooks({
        userId: params.userId,
        event: params.event,
        payload: params.payload,
        agentId: params.agentId ?? undefined,
        taskId: params.taskId ?? undefined,
      })
    } catch (err) {
      logger.warn("webhooks: émission non bloquante interrompue", {
        event: params.event,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })()
}

const MAX_RETRIES = 3
const TIMEOUT_MS = 10_000
const BACKOFF_BASE_MS = 1_000

/**
 * Enregistre un webhook sortant.
 */
export async function createWebhook(params: {
  userId: string
  url: string
  events: string[] // ["task.completed", "task.failed"]
  secret: string
  agentId?: string
  taskId?: string
}): Promise<string> {
  const webhook = await db.webhookConfig.create({
    data: {
      userId: params.userId,
      url: params.url,
      events: JSON.stringify(params.events),
      secret: params.secret,
      agentId: params.agentId,
      taskId: params.taskId,
      active: true,
    },
  })
  return webhook.id
}

/**
 * Déclenche les webhooks correspondants à un événement.
 */
export async function triggerWebhooks(params: {
  userId: string
  event: string // "task.completed" | "task.failed"
  payload: Record<string, unknown>
  agentId?: string
  taskId?: string
}): Promise<void> {
  const webhooks = await db.webhookConfig.findMany({
    where: {
      userId: params.userId,
      active: true,
    },
  })

  for (const webhook of webhooks) {
    const events = JSON.parse(webhook.events) as string[]
    if (!events.includes(params.event)) continue
    if (webhook.agentId && webhook.agentId !== params.agentId) continue
    if (webhook.taskId && webhook.taskId !== params.taskId) continue

    await deliverWebhook(webhook, params.event, params.payload)
  }
}

/**
 * Livre un webhook avec retry et backoff exponentiel.
 */
async function deliverWebhook(
  webhook: { id: string; url: string; secret: string },
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() })
  const signature = createHmac("sha256", webhook.secret).update(body).digest("hex")

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GEN3IA-Signature": `sha256=${signature}`,
          "X-GEN3IA-Event": event,
        },
        body,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      // Enregistrer la livraison
      await db.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: body,
          statusCode: res.status,
          response: await res.text().catch(() => ""),
          attempt,
          deliveredAt: new Date(),
        },
      })

      if (res.ok) {
        logger.info("Webhook livré", { webhookId: webhook.id, event, statusCode: res.status })
        return
      }

      if (res.status >= 400 && res.status < 500 && attempt === 1) {
        logger.warn("Webhook échec client", { webhookId: webhook.id, statusCode: res.status })
        return // Pas de retry pour erreurs 4xx
      }
    } catch (err) {
      logger.error("Webhook livraison échec", { webhookId: webhook.id, attempt, error: String(err) })
      await db.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload: body,
          attempt,
          error: String(err).substring(0, 500),
        },
      })
    }

    // Backoff exponentiel
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt - 1)))
    }
  }
}
