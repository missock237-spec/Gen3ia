import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { createHFJob, listHFJobs, getHFJob, cancelHFJob } from "@/lib/hf/jobs"
import { drainHFJobs } from "@/lib/hf/job-queue"

const createSchema = z.object({
  kind: z.enum([
    "preprocessing", "embeddings-batch", "dataset-generation", "evaluation",
    "fine-tuning", "conversion", "batch-inference", "media-processing",
  ]),
  parameters: z.record(z.string(), z.unknown()).default({}),
  input_path: z.string().max(500).optional(),
  idempotency_key: z.string().min(8).max(120).optional(),
  max_attempts: z.number().int().min(1).max(5).optional(),
  timeout_ms: z.number().int().min(5000).max(3_600_000).optional(),
  run_now: z.boolean().default(true),
})

/**
 * API unifiée v1 — POST /api/v1/jobs
 * Soumet un job long HF (embeddings batch, batch-inference, fine-tuning…).
 * Réponse : identifiant + statut PENDING/RUNING — JAMAIS d'exécution longue
 * dans la requête (Phase 25 : worker BullMQ / reprise par sondage).
 */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const body = await readJson(req, createSchema)
    const job = await createHFJob({
      userId: ctx.user.id,
      kind: body.kind,
      parameters: body.parameters,
      inputRef: body.input_path,
      idempotencyKey: body.idempotency_key,
      maxAttempts: body.max_attempts,
      timeoutMs: body.timeout_ms,
    })

    return Response.json(
      {
        ok: true,
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        maxAttempts: job.maxAttempts,
        createdAt: job.createdAt,
        pollUrl: `/api/v1/jobs?id=${job.id}`,
      },
      { status: 202 }
    )
  })
}

/** GET /api/v1/jobs[?id=|status=] — statut d'un job ou liste paginée. */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    if (id) {
      const job = await getHFJob(id, ctx.user.id)
      if (!job) {
        return Response.json({ ok: false, error: "Job introuvable.", code: "NOT_FOUND" }, { status: 404 })
      }
      return Response.json({ ok: true, job })
    }

    const status = url.searchParams.get("status") ?? undefined
    const jobs = await listHFJobs(ctx.user.id, { status, limit: 50 })
    return Response.json({ ok: true, count: jobs.length, jobs })
  })
}

const patchSchema = z.object({ action: z.enum(["cancel", "poll", "drain"]) })

/** PATCH /api/v1/jobs — cancel (annule) / poll (sync natifs HF) / drain. */
export async function PATCH(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const body = await readJson(req, patchSchema)
    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    if (body.action === "cancel") {
      if (!id) return Response.json({ ok: false, error: "id requis pour cancel.", code: "BAD_REQUEST" }, { status: 400 })
      const job = await cancelHFJob(id, ctx.user.id)
      return Response.json({ ok: true, job })
    }

    if (body.action === "drain") {
      // Drainage borné (serverless-safe) — utile sans worker dédié.
      const result = await drainHFJobs(5, 45_000)
      return Response.json({ ok: true, drain: result })
    }

    // poll : force la synchronisation des jobs HF natifs.
    const { syncNativeHFJobs } = await import("@/lib/hf/jobs")
    const sync = await syncNativeHFJobs()
    return Response.json({ ok: true, sync })
  })
}
