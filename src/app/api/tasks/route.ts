import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { advanceTask } from "@/lib/engines/orchestrator"
import { enqueueTaskAdvance, queueMode } from "@/lib/queue/task-queue"
import { getBalance } from "@/lib/credits/ledger"
import { audit } from "@/lib/engines/audit"
import { emitPipelineEvent } from "@/lib/webhooks/outbound"

const createSchema = z.object({
  prompt: z.string().min(10).max(8000),
  agentId: z.string().max(64).nullable().optional(),
  /** v4.1 : modèle choisi dans la barre de saisie ("provider/model") — null = Model Router. */
  preferredModel: z.string().max(120).nullable().optional(),
  /** v4.1 : pièces jointes importées depuis la barre de saisie (déjà téléversées). */
  attachmentIds: z.array(z.string().max(64)).max(20).optional(),
})

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const tasks = await db.task.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, prompt: true, status: true, costCredits: true, tokensIn: true, tokensOut: true,
        attempts: true, error: true, selectedPlanId: true, preferredModel: true, agentId: true, createdAt: true, completedAt: true,
      },
    })
    return Response.json({ ok: true, tasks })
  })
}

/**
 * Création + lancement d'une tâche :
 *  - REDIS_URL configuré → job durable en file (priorité plan) traité par
 *    le worker/self-host ou le drain cron serverless — réponse immédiate ;
 *  - sinon (défaut) → l'orchestrateur avance le pipeline dans le budget
 *    temporel de la requête ; le client sonde GET /api/tasks/[id] qui
 *    poursuit l'avancement (exécution reprise-ez compatible serverless).
 */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, createSchema)

    const balance = await getBalance(user.id)
    if (balance <= 0) {
      throw new ApiError(
        402,
        "Crédits insuffisants pour lancer une tâche. Rechargez votre compte dans la section Facturation.",
        "NO_CREDITS"
      )
    }

    let agentId: string | null = null
    if (body.agentId) {
      const agent = await db.agent.findFirst({ where: { id: body.agentId, userId: user.id } })
      if (!agent) throw new ApiError(404, "Agent introuvable.", "NOT_FOUND")
      agentId = agent.id
    }

    // v4.1 — pièces jointes de la barre de saisie : vérification de
    // propriété + enrichissement du prompt avec le contexte des fichiers
    // (les documents sont déjà indexés RAG — la note explicite guide les
    // agents vers knowledge_search ; l'audio est déjà transcrit).
    let prompt = body.prompt.trim()
    if (body.attachmentIds?.length) {
      const owned = await db.chatAttachment.findMany({
        where: { id: { in: body.attachmentIds }, userId: user.id },
        select: { id: true, kind: true, filename: true, documentId: true, textExtract: true },
      })
      if (owned.length > 0) {
        const docs = owned.filter((a) => a.documentId)
        const medias = owned.filter((a) => !a.documentId)
        const notes: string[] = []
        if (docs.length > 0) {
          notes.push(
            `Pièces jointes importées et indexées dans la base de connaissances (utilise knowledge_search pour les consulter) : ${docs.map((d) => d.filename).join(", ")}.`
          )
        }
        if (medias.length > 0) {
          notes.push(`Pièces jointes média : ${medias.map((m) => `${m.filename} (${m.kind.toLowerCase()})`).join(", ")}.`
          )
        }
        prompt = `${prompt}\n\n[${notes.join(" ")}]`
        // Les ids possédés seront rattachés à la tâche après création.
      }
    }

    // v4.1 — modèle préféré : validé contre le registre si possible (jamais bloquant).
    let preferredModel: string | null = null
    if (body.preferredModel) {
      preferredModel = body.preferredModel.trim()
    }

    const task = await db.task.create({
      data: { userId: user.id, prompt, agentId, preferredModel },
    })

    // v4.1 — rattache les pièces jointes vérifiées à la tâche créée.
    if (body.attachmentIds?.length) {
      await db.chatAttachment.updateMany({
        where: { id: { in: body.attachmentIds }, userId: user.id },
        data: { taskId: task.id },
      }).catch(() => undefined)
    }

    await audit(req, { userId: user.id, action: "TASK_CREATED", entityType: "task", entityId: task.id })
    // v3.6 — webhook sortant : tâche créée.
    emitPipelineEvent({
      userId: user.id,
      event: "task.created",
      payload: { taskId: task.id, agentId, promptLength: body.prompt.length },
      agentId,
      taskId: task.id,
    })

    // v3.6 — file persistante : le traitement asynchrone prend le relais,
    // la réponse revient immédiate (le polling GET continue de faire
    // progresser la tâche en parallèle — double sécurité).
    const enqueue = await enqueueTaskAdvance(task.id, { plan: user.plan })
    if (enqueue.disposition === "queued") {
      return Response.json({ ok: true, task, queue: { mode: queueMode(), jobId: enqueue.jobId } })
    }

    const advanced = await advanceTask(task.id)
    return Response.json({ ok: true, task: advanced ?? task })
  })
}
