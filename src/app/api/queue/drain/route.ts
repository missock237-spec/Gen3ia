import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute } from "@/lib/api"
import { requireAdmin } from "@/lib/auth/guards"
import { audit } from "@/lib/engines/audit"
import { drainQueue, queueDepth, queueMode } from "@/lib/queue/task-queue"

/**
 * Drainage serverless de la file de tâches (v3.6).
 *
 * POST /api/queue/drain            — admin OU cron (header Authorization:
 *                                    Bearer <CRON_SECRET>) : traite jusqu'à
 *                                    N jobs en attente (budget 50 s).
 * GET  /api/queue/drain            — observabilité : profondeur de file.
 *
 * Vercel Cron (vercel.json) : déclenche ce endpoint chaque minute ; sans
 * REDIS_URL configuré, la file est inactive (mode checkpointing en requête)
 * et le drainage répond "inactive" — jamais d'erreur.
 */

const drainSchema = z.object({
  max: z.number().int().min(1).max(50).optional(),
  budgetMs: z.number().int().min(1000).max(55_000).optional(),
})

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    await requireAdmin(req)
    const depth = await queueDepth()
    return Response.json({
      ok: true,
      mode: queueMode(),
      depth,
      hint: depth === null ? "REDIS_URL non configuré — avancement par checkpointing en requête (nominal)." : undefined,
    })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const isCron = authorizeCron(req)
    if (!isCron) await requireAdmin(req)
    // Corps optionnel (cron POST sans corps) : valeurs par défaut sûres.
    let body: z.infer<typeof drainSchema> = {}
    try {
      const raw = await req.json()
      body = drainSchema.parse(raw ?? {})
    } catch {
      body = {}
    }

    if (queueMode() === "off") {
      return Response.json({
        ok: true,
        mode: "off",
        processed: 0,
        note: "File inactive (REDIS_URL absent) — l'avancement se fait dans le budget des requêtes (checkpointing serverless).",
      })
    }

    const result = await drainQueue(body.max ?? 10, body.budgetMs ?? 50_000)
    if (!isCron) {
      await audit(req, {
        userId: null,
        action: "QUEUE_DRAINED",
        entityType: "queue",
        detail: { processed: result.processed, ok: result.ok, failed: result.failed },
      })
    }
    return Response.json({ ok: true, mode: result.mode, processed: result.processed, okCount: result.ok, failed: result.failed, errors: result.errors })
  })
}
