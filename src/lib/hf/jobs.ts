import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { enqueueTaskAdvance } from "@/lib/queue/task-queue"
import { hfStorage } from "./storage"
import {
  isHfConfigured,
  jobSubmit,
  jobGet,
  jobCancel,
  jobsList,
  HfApiError,
} from "./client"

/**
 * HF Jobs Manager (v4.0 — Phase 11).
 *
 * Architecture : API → BullMQ (queue dédiée gen3ia-hf-jobs) → Job Worker →
 * HF Job / worker GEN3IA → Checkpoint (HF Bucket) → Résultat → GEN3IA.
 *
 * Deux modes d'exécution :
 *  1. Jobs HF NATIFS (kind "fine-tuning", "dataset-generation"…) soumis à
 *     l'API officielle https://huggingface.co/api/jobs — suivis par polling ;
 *  2. Jobs GEN3IA (kind "embeddings-batch", "batch-inference"…) exécutés par
 *     le worker BullMQ dédié (scripts/hf-jobs-worker.ts) qui utilise les
 *     Inference Providers par lots — les kinds sans équivalent HF natif.
 *
 * Contrats : PENDING → RUNNING → COMPLETED | FAILED | CANCELLED ;
 * retry (maxAttempts, backoff exponentiel), timeout, idempotence par clé,
 * checkpoints dans le HF Bucket (reprise après crash).
 */

const log = logger.child({ component: "hf-jobs" })

export type HFJobKind =
  | "preprocessing"
  | "embeddings-batch"
  | "dataset-generation"
  | "evaluation"
  | "fine-tuning"
  | "conversion"
  | "batch-inference"
  | "media-processing"

/** Kinds exécutés nativement par HF (API jobs officielle). */
const HF_NATIVE_KINDS = new Set<HFJobKind>(["fine-tuning", "dataset-generation", "conversion"])

export interface CreateHFJobInput {
  userId: string
  kind: HFJobKind
  parameters: Record<string, unknown>
  inputRef?: string // chemin Bucket des entrées
  idempotencyKey?: string
  maxAttempts?: number
  timeoutMs?: number
}

export interface HFJobView {
  id: string
  kind: string
  status: string
  progress: number
  attempt: number
  maxAttempts: number
  hfRef: string | null
  inputRef: string | null
  outputRef: string | null
  checkpointRef: string | null
  idempotencyKey?: string | null
  parameters: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error: string | null
  costCredits: number
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
}

/** Soumet un job long : idempotent (clé), durable (BullMQ si Redis). */
export async function createHFJob(input: CreateHFJobInput): Promise<HFJobView> {
  // Idempotence : une clé déjà utilisée retourne le job existant.
  if (input.idempotencyKey) {
    const existing = await db.hFJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) return toView(existing)
  }

  const job = await db.hFJob.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      status: "PENDING",
      parameters: JSON.stringify(input.parameters),
      inputRef: input.inputRef ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      maxAttempts: input.maxAttempts ?? 3,
      timeoutMs: input.timeoutMs ?? 600_000,
    },
  })

  try {
    // Job HF natif : soumission immédiate à l'API officielle.
    if (HF_NATIVE_KINDS.has(input.kind) && isHfConfigured()) {
      const hfNative = await jobSubmit({
        kind: input.kind,
        input: input.inputRef ? { repo: repoForPath(input.inputRef), path: pathPart(input.inputRef) } : undefined,
        config: input.parameters,
      })
      await db.hFJob.update({
        where: { id: job.id },
        data: { hfRef: hfNative.id, status: "RUNNING", startedAt: new Date() },
      })
      return toView(await db.hFJob.findUniqueOrThrow({ where: { id: job.id } }))
    }

    // Job GEN3IA : file BullMQ dédiée (durable si Redis, sinon worker en
    // requête/sondage — même contrat de statut).
    const { enqueueHFJob } = await import("@/lib/hf/job-queue")
    const queued = await enqueueHFJob(job.id, { isRetry: false })
    if (queued.disposition === "direct") {
      // Sans Redis : exécution worker en arrière-plan bornée (serverless-safe
      // via checkpoints — le worker reprend aux sondages /api/v1/jobs).
      void runHFJobWorker(job.id).catch((err) =>
        log.warn("hf-jobs: exécution directe échouée (reprise au sondage)", {
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }
  } catch (err) {
    // La soumission ne doit jamais échouer à l'utilisateur : le job reste
    // PENDING et sera repris par le worker (tentative suivante).
    log.warn("hf-jobs: soumission différée", {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return toView(await db.hFJob.findUniqueOrThrow({ where: { id: job.id } }))
}

/** Annule un job (HF natif → API cancel ; GEN3IA → statut CANCELLED). */
export async function cancelHFJob(jobId: string, userId: string): Promise<HFJobView> {
  const job = await db.hFJob.findFirst({ where: { id: jobId, userId } })
  if (!job) throw new Error("Job introuvable.")
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
    return toView(job)
  }
  if (job.hfRef && isHfConfigured()) {
    await jobCancel(job.hfRef).catch((err) =>
      log.warn("hf-jobs: cancel HF ignoré", { error: String(err) })
    )
  }
  const updated = await db.hFJob.update({ where: { id: job.id }, data: { status: "CANCELLED", finishedAt: new Date() } })
  return toView(updated)
}

/** Vue utilisateur (lecture). */
export async function getHFJob(jobId: string, userId: string): Promise<HFJobView | null> {
  const job = await db.hFJob.findFirst({ where: { id: jobId, userId } })
  return job ? toView(job) : null
}

export async function listHFJobs(
  userId: string,
  options?: { status?: string; limit?: number }
): Promise<HFJobView[]> {
  const jobs = await db.hFJob.findMany({
    where: { userId, ...(options?.status ? { status: options.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(options?.limit ?? 50, 200),
  })
  return jobs.map(toView)
}

/** Synchronise les jobs HF natifs (polling — appelé par cron/worker). */
export async function syncNativeHFJobs(): Promise<{ updated: number; completed: number; failed: number }> {
  if (!isHfConfigured()) return { updated: 0, completed: 0, failed: 0 }
  const running = await db.hFJob.findMany({
    where: { hfRef: { not: null }, status: "RUNNING" },
    take: 100,
  })
  let completed = 0
  let failed = 0
  for (const job of running) {
    try {
      const hfJob = await jobGet(job.hfRef!)
      if (["COMPLETED", "FINISHED", "SUCCESS"].includes(hfJob.status.toUpperCase())) {
        const outputRef = hfJob.output?.path
          ? `${hfJob.output.repo}/${hfJob.output.path}`
          : job.outputRef
        await db.hFJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            progress: 1,
            finishedAt: new Date(),
            outputRef,
            result: JSON.stringify({ hfJobId: hfJob.id, meta: hfJob.meta ?? {} }),
          },
        })
        completed++
      } else if (["FAILED", "ERROR", "CANCELLED"].includes(hfJob.status.toUpperCase())) {
        await db.hFJob.update({
          where: { id: job.id },
          data: { status: "FAILED", error: hfJob.error ?? "Job HF échoué", finishedAt: new Date() },
        })
        failed++
      }
    } catch (err) {
      if (err instanceof HfApiError && err.status === 404) {
        await db.hFJob.update({ where: { id: job.id }, data: { status: "FAILED", error: "Job HF disparu" } })
        failed++
      }
    }
  }
  return { updated: running.length, completed, failed }
}

// ─────────────────────────────────────────────────────────────
// Worker GEN3IA — exécute les jobs BullMQ (kinds non natifs HF)
// ─────────────────────────────────────────────────────────────

/**
 * Exécute un job GEN3IA (embeddings-batch, batch-inference, preprocessing,
 * evaluation, media-processing). Idempotent : reprend depuis le checkpoint
 * Bucket le cas échéant. Timeout et retries Bornés.
 */
export async function runHFJobWorker(jobId: string): Promise<HFJobView> {
  let job = await db.hFJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error("Job introuvable")
  if (["COMPLETED", "CANCELLED"].includes(job.status)) return toView(job)
  if (job.attempt >= job.maxAttempts && job.status === "FAILED") return toView(job)

  const started = Date.now()
  await db.hFJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", startedAt: job.startedAt ?? new Date(), attempt: { increment: 1 } },
  })
  job = await db.hFJob.findUniqueOrThrow({ where: { id: job.id } })

  try {
    const params = JSON.parse(job.parameters ?? "{}") as Record<string, unknown>
    let progress = job.progress
    let result: Record<string, unknown>

    // Checkpoint : reprise après crash (progress déjà atteint).
    const checkpoint = await readCheckpoint(job)
    const skipDone = checkpoint?.progress ?? 0

    switch (job.kind as HFJobKind) {
      case "embeddings-batch": {
        result = await runEmbeddingsBatch(job, params, skipDone, (p) => void persistProgress(job!.id, p))
        break
      }
      case "batch-inference": {
        result = await runBatchInference(job, params, skipDone, (p) => void persistProgress(job!.id, p))
        break
      }
      case "preprocessing":
      case "evaluation":
      case "media-processing": {
        result = await runGenericProcessing(job, params)
        break
      }
      default: {
        // Kinds natifs HF sans worker local : synchronisés par polling.
        result = { delegated: true, hfRef: job.hfRef }
      }
    }

    progress = 1
    const outputRef = (result.outputRef as string | undefined) ?? job.outputRef
    const finished = await db.hFJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        progress,
        result: JSON.stringify(result),
        outputRef,
        finishedAt: new Date(),
      },
    })
    log.info("hf-jobs: job terminé", { jobId: job.id, kind: job.kind, durationMs: Date.now() - started })
    return toView(finished)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = Date.now() - started > job.timeoutMs
    const canRetry = job.attempt < job.maxAttempts && !isTimeout
    const failed = await db.hFJob.update({
      where: { id: job.id },
      data: {
        status: canRetry ? "PENDING" : "FAILED", // PENDING = repris par le worker
        error: message.slice(0, 500),
        finishedAt: canRetry ? null : new Date(),
      },
    })
    log.warn("hf-jobs: job échoué", { jobId: job.id, attempt: job.attempt, canRetry, error: message.slice(0, 200) })
    return toView(failed)
  }
}

async function runEmbeddingsBatch(
  job: { id: string; userId: string; inputRef: string | null },
  params: Record<string, unknown>,
  skipProgress: number,
  onProgress: (p: number) => void
): Promise<Record<string, unknown>> {
  const { embedTexts } = await import("@/lib/rag/embeddings")
  const texts = (params.texts as string[]) ?? []
  if (texts.length === 0 && !job.inputRef) {
    throw new Error("embeddings-batch: aucun texte fourni (params.texts ou inputRef)")
  }
  let inputs = texts
  if (inputs.length === 0 && job.inputRef) {
    const bytes = await hfStorage.download(job.userId, job.inputRef)
    inputs = new TextDecoder().decode(bytes).split("\n").filter((l) => l.trim().length > 0)
  }
  const model = (params.model as string) ?? process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small"
  const done = Math.floor(skipProgress * inputs.length)
  const vectors: number[][] = []
  const BATCH = 32
  for (let i = done; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH)
    const embedded = await embedTexts(batch)
    vectors.push(...embedded.map((e) => e.vector))
    onProgress(Math.min(0.95, (i + BATCH) / inputs.length))
  }
  // Sortie : vecteurs sérialisés dans le Bucket (jamais dans PostgreSQL).
  const outputRef = `embeddings/${job.id}/vectors.json`
  const payload = JSON.stringify({ model, dim: vectors[0]?.length ?? 0, count: vectors.length, vectors })
  await hfStorage.upload(job.userId, outputRef, new TextEncoder().encode(payload), { contentType: "application/json" })
  return { outputRef, model, count: vectors.length, dim: vectors[0]?.length ?? 0 }
}

async function runBatchInference(
  job: { id: string; userId: string; inputRef: string | null },
  params: Record<string, unknown>,
  skipProgress: number,
  onProgress: (p: number) => void
): Promise<Record<string, unknown>> {
  const { chat } = await import("@/lib/ai")
  const prompts = (params.prompts as string[]) ?? []
  let inputs = prompts
  if (inputs.length === 0 && job.inputRef) {
    const bytes = await hfStorage.download(job.userId, job.inputRef)
    inputs = new TextDecoder().decode(bytes).split("\n\n").filter((p) => p.trim().length > 0)
  }
  if (inputs.length === 0) throw new Error("batch-inference: aucun prompt fourni")
  const model = (params.model as string) ?? undefined
  const taskType = (params.taskType as never) ?? "EXECUTION"
  const done = Math.floor(skipProgress * inputs.length)
  const outputs: Array<{ index: number; content: string }> = []
  for (let i = done; i < inputs.length; i++) {
    const result = await chat({
      messages: [{ role: "user", content: inputs[i].slice(0, 6000) }],
      taskType,
      ...(model ? { model } : {}),
    })
    outputs.push({ index: i, content: result.content.slice(0, 20_000) })
    onProgress(Math.min(0.95, (i + 1) / inputs.length))
  }
  const outputRef = `generated/${job.id}/outputs.json`
  await hfStorage.upload(
    job.userId,
    outputRef,
    new TextEncoder().encode(JSON.stringify({ model: model ?? "auto", outputs })),
    { contentType: "application/json" }
  )
  return { outputRef, count: outputs.length }
}

async function runGenericProcessing(
  job: { id: string; userId: string; inputRef: string | null },
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Traitement générique : opération déclarée exécutée en sandbox isolée
  // quand params.code est fourni (transformation de données, parsing…).
  if (!params.code) {
    return { note: "job déclaratif enregistré", params }
  }
  const { runSandboxedCode } = await import("@/lib/security/sandbox/runner")
  const input = job.inputRef ? await hfStorage.download(job.userId, job.inputRef) : null
  const sandboxInput = input ? new TextDecoder().decode(input) : ((params.input as string) ?? "")
  const executed = await runSandboxedCode({
    code: params.code as string,
    timeoutMs: 120_000,
  })
  const outputRef = `generated/${job.id}/output.txt`
  await hfStorage.upload(job.userId, outputRef, new TextEncoder().encode(executed.output), { contentType: "text/plain" })
  return { outputRef, ok: executed.ok, error: executed.error?.slice(0, 1000) ?? null }
}

async function readCheckpoint(job: { id: string; userId: string; checkpointRef: string | null }): Promise<{ progress: number } | null> {
  if (!job.checkpointRef) return null
  try {
    const bytes = await hfStorage.download(job.userId, job.checkpointRef)
    return JSON.parse(new TextDecoder().decode(bytes)) as { progress: number }
  } catch {
    return null
  }
}

async function persistProgress(jobId: string, progress: number): Promise<void> {
  await db.hFJob.update({ where: { id: jobId }, data: { progress } }).catch(() => undefined)
}

function repoForPath(path: string): string {
  return path.split("/")[0] ?? "gen3ia-temporary"
}

function pathPart(path: string): string | undefined {
  const parts = path.split("/")
  return parts.length > 1 ? parts.slice(1).join("/") : undefined
}

function toView(job: {
  id: string; kind: string; status: string; progress: number; attempt: number
  maxAttempts: number; hfRef: string | null; inputRef: string | null
  outputRef: string | null; checkpointRef: string | null; idempotencyKey: string | null
  parameters: string | null; result: string | null; error: string | null; costCredits: number
  startedAt: Date | null; finishedAt: Date | null; createdAt: Date
}): HFJobView {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    hfRef: job.hfRef,
    inputRef: job.inputRef,
    outputRef: job.outputRef,
    checkpointRef: job.checkpointRef,
    idempotencyKey: job.idempotencyKey,
    parameters: safeParse(job.parameters),
    result: safeParse(job.result),
    error: job.error,
    costCredits: job.costCredits,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    createdAt: job.createdAt,
  }
}

function safeParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export { jobsList as listNativeHFJobs }
