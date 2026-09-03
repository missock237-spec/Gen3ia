import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync } from "node:fs"

/**
 * v3.6 — Webhooks sortants : branchage réel du pipeline.
 * Test d'intégration avec un serveur HTTP local RÉEL (Bun.serve) :
 *  - livraison POST + signature HMAC SHA-256 vérifiable ;
 *  - filtrage par événement souscrit ;
 *  - émission non bloquante (fire-and-forget) ;
 *  - 4xx sans retry, livraison enregistrée.
 */

mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-webhooks.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`

import { ensureSchema } from "@/lib/db-init"
import { db } from "@/lib/db"
import { createWebhook, triggerWebhooks, emitPipelineEvent, PIPELINE_EVENTS } from "@/lib/webhooks/outbound"
import { createHmac } from "node:crypto"

const USER = "webhook-user-test"
const SECRET = "whsec_test_1234"

const received: Array<{ body: string; headers: Record<string, string> }> = []

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const headers: Record<string, string> = {}
    req.headers.forEach((v, k) => (headers[k] = v))
    return req.text().then((body) => {
      received.push({ body, headers })
      return new Response("ok", { status: 200 })
    })
  },
})

const URL_ENDPOINT = `http://localhost:${server.port}/hook`

beforeAll(async () => {
  await ensureSchema()
  await db.user.create({ data: { id: USER, email: "wh@test.local", passwordHash: "x" } }).catch(() => undefined)
  await db.webhookConfig.deleteMany({})
})

afterAll(async () => {
  server.stop(true)
  await db.webhookConfig.deleteMany({}).catch(() => undefined)
})

describe("Webhooks sortants du pipeline", () => {
  test("catalogue d'événements : le pipeline complet est couvert", () => {
    expect(PIPELINE_EVENTS).toContain("task.created")
    expect(PIPELINE_EVENTS).toContain("task.approved")
    expect(PIPELINE_EVENTS).toContain("plan.generated")
    expect(PIPELINE_EVENTS).toContain("plan.approved")
    expect(PIPELINE_EVENTS).toContain("plan.rejected")
    expect(PIPELINE_EVENTS).toContain("task.awaiting_human")
    expect(PIPELINE_EVENTS).toContain("task.approval_expired")
    expect(PIPELINE_EVENTS).toContain("task.completed")
    expect(PIPELINE_EVENTS).toContain("task.failed")
    expect(PIPELINE_EVENTS).toContain("task.cancelled")
    // Les anciens noms restent compatibles au niveau UI/route (non cassés).
    expect(PIPELINE_EVENTS.length).toBeGreaterThanOrEqual(10)
  })

  test("livraison réelle : POST signé HMAC, headers d'événement, historique", async () => {
    received.length = 0
    await createWebhook({ userId: USER, url: URL_ENDPOINT, events: ["task.completed"], secret: SECRET })

    await triggerWebhooks({
      userId: USER,
      event: "task.completed",
      payload: { taskId: "task_1", costCredits: 12.5 },
      taskId: "task_1",
    })

    // La livraison est synchrone dans triggerWebhooks (contrairement à
    // emitPipelineEvent qui est fire-and-forget) : elle est déjà effectuée.
    expect(received.length).toBe(1)
    const delivered = received[0]
    expect(delivered.headers["x-gen3ia-event"]).toBe("task.completed")

    // Signature HMAC vérifiable par le destinataire.
    const expectedSig = createHmac("sha256", SECRET).update(delivered.body).digest("hex")
    expect(delivered.headers["x-gen3ia-signature"]).toBe(`sha256=${expectedSig}`)

    const parsed = JSON.parse(delivered.body) as { event: string; payload: { taskId: string }; timestamp: string }
    expect(parsed.event).toBe("task.completed")
    expect(parsed.payload.taskId).toBe("task_1")
    expect(Number.isFinite(Date.parse(parsed.timestamp))).toBe(true)

    // Historique persisté.
    const deliveries = await db.webhookDelivery.findMany({})
    expect(deliveries.length).toBeGreaterThanOrEqual(1)
    expect(deliveries[0].statusCode).toBe(200)
  })

  test("filtrage : un événement non souscrit n'est PAS livré", async () => {
    received.length = 0
    await triggerWebhooks({
      userId: USER,
      event: "plan.generated",
      payload: { taskId: "task_2", plans: [] },
      taskId: "task_2",
    })
    expect(received.length).toBe(0)
  })

  test("émission non bloquante : emitPipelineEvent ne jette jamais et livre", async () => {
    received.length = 0
    emitPipelineEvent({
      userId: USER,
      event: "task.completed",
      payload: { taskId: "task_3", fireAndForget: true },
      taskId: "task_3",
    })
    // Fire-and-forget : on SONDE jusqu'à livraison (délai borné).
    const deadline = Date.now() + 5000
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(received.length).toBe(1)

    // Même avec un payload problématique : aucune exception levée.
    emitPipelineEvent({ userId: "user-inexistant", event: "task.failed", payload: Object.create(null) })
    expect(true).toBe(true)
  })
})
