import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"
import { visionChat } from "@/lib/ai/vision"
import { creditsForTokens } from "@/lib/ai/router"
import { chargeCredits, getBalance } from "@/lib/credits/ledger"
import { advanceTask } from "@/lib/engines/orchestrator"
import { enforceRateLimit } from "@/lib/security/rate-limit"
import { audit } from "@/lib/engines/audit"

const agentSchema = z.object({
  /** Message de l'utilisateur au copilote (mode chat). */
  message: z.string().max(2000).optional(),
  /** Capture d'écran courante (data URL JPEG, ≤ 500 Ko). */
  image: z
    .string()
    .max(700_000)
    .regex(/^data:image\/(jpeg|png);base64,/)
    .optional(),
  /** chat = question utilisateur ; observe = commentaire automatique de l'écran. */
  mode: z.enum(["chat", "observe"]).default("chat"),
})

/** Coût en crédits par appel copilote (débité après l'inférence réelle). */
const MIN_CREDIT_PER_AGENT_CALL = 0.05

/**
 * POST /api/live/[code]/agent — Copilote IA du salon live.
 *
 * 1. L'utilisateur partage son écran : les captures sont envoyées ici
 *    (mode "observe" = l'agent commente ce qu'il voit, périodique).
 * 2. Mode "chat" : question + capture éventuelle → réponse contextuelle.
 * 3. Commande « /task <instruction> » : crée une VRAIE tâche GEN3IA
 *    (exécution serveur en arrière-plan, visible même depuis une autre
 *    application) et la lie à la session live.
 *
 * La réponse est diffusée à tous les participants via un signal AGENT.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    enforceRateLimit("user", user.id)
    const { code } = await params
    const body = await readJson(req, agentSchema)

    const session = await db.liveSession.findUnique({ where: { code } })
    if (!session) throw new ApiError(404, "Session live introuvable.", "LIVE_NOT_FOUND")
    if (session.status !== "LIVE") throw new ApiError(410, "Cette session est terminée.", "LIVE_ENDED")

    // Le demandeur doit être participant actif (hôte ou spectateur) de la session.
    const me = await db.liveParticipant.findFirst({
      where: { sessionId: session.id, userId: user.id, leftAt: null },
    })
    if (!me) {
      throw new ApiError(403, "Rejoignez la session avant de discuter avec l'agent.", "LIVE_NOT_PARTICIPANT")
    }

    // ─── Commande /task : création d'une tâche réelle liée à la session ───
    const rawMessage = (body.message ?? "").trim()
    const taskMatch = rawMessage.match(/^\/(?:task|t[âa]che)\s+([\s\S]+)$/i)
    if (taskMatch) {
      const prompt = taskMatch[1].trim().slice(0, 8000)
      if (prompt.length < 10) {
        throw new ApiError(400, "Instruction trop courte après /task (10 caractères minimum).", "TASK_TOO_SHORT")
      }
      const balance = await getBalance(user.id)
      if (balance <= 0) {
        throw new ApiError(402, "Crédits insuffisants pour lancer une tâche.", "NO_CREDITS")
      }
      const task = await db.task.create({ data: { userId: user.id, prompt } })
      await audit(req, { userId: user.id, action: "TASK_CREATED", entityType: "task", entityId: task.id })
      const advanced = await advanceTask(task.id)
      const lastStep = await db.taskStep.findFirst({
        where: { taskId: task.id },
        orderBy: { createdAt: "desc" },
        select: { phase: true },
      })
      if (!session.taskId) {
        await db.liveSession.update({ where: { id: session.id }, data: { taskId: task.id } })
      }
      const reply = `Tâche #${task.id.slice(0, 8)} lancée : « ${prompt.slice(0, 160)} ». Je l'exécute en arrière-plan — suivez sa progression dans le panneau ci-dessous, et continuons à discuter pendant qu'elle tourne.`
      await db.liveSignal.create({
        data: {
          sessionId: session.id,
          fromId: me.id,
          toId: null,
          type: "AGENT",
          payload: JSON.stringify({ text: reply, vision: false, mode: "chat", taskCreated: task.id }),
        },
      })
      await db.liveSignal.create({
        data: {
          sessionId: session.id,
          fromId: me.id,
          toId: null,
          type: "TASK",
          payload: JSON.stringify({
            taskId: task.id,
            status: advanced?.status ?? task.status,
            currentPhase: lastStep?.phase ?? null,
            viewerNotice: "TASK_STARTED",
          }),
        },
      })
      return jsonOk({ reply, taskId: task.id, taskStatus: advanced?.status ?? task.status, credits: 0 })
    }

    // ─── Contexte conversationnel : derniers signaux CHAT/AGENT de la session ───
    const recentSignals = await db.liveSignal.findMany({
      where: {
        sessionId: session.id,
        type: { in: ["CHAT", "AGENT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    })
    const historyLines = recentSignals
      .reverse()
      .map((s) => {
        const p = JSON.parse(s.payload) as { text?: string; displayName?: string }
        const who = s.type === "AGENT" ? "Agent" : (p.displayName ?? "Utilisateur")
        return `${who} : ${String(p.text ?? "").slice(0, 300)}`
      })
      .filter(Boolean)

    // ─── Contexte tâche liée : progression temps réel ───
    let taskContext = ""
    if (session.taskId) {
      const task = await db.task.findUnique({
        where: { id: session.taskId },
        select: {
          id: true,
          status: true,
          prompt: true,
          steps: { take: 3, orderBy: { createdAt: "desc" }, select: { title: true, status: true, phase: true } },
        },
      })
      if (task) {
        const stepTitles = task.steps.map((st) => `${st.title} (${st.status})`).join(" ; ")
        const lastPhase = task.steps[0]?.phase ?? "—"
        taskContext = `Tâche liée #${task.id.slice(0, 8)} — statut ${task.status}, dernière phase ${lastPhase}${stepTitles ? `, dernières étapes : ${stepTitles}` : ""}. Objectif : ${task.prompt.slice(0, 200)}`
      }
    }

    const hasImage = Boolean(body.image)
    if (body.mode === "observe" && !hasImage) {
      throw new ApiError(400, "Mode observation : une capture d'écran est requise.", "AGENT_NO_IMAGE")
    }

    const system = [
      "Tu es le copilote IA GEN3IA en session live. L'utilisateur partage son écran : tu reçois des captures périodiques de CE qu'il voit réellement (GitHub, éditeur, navigateur…).",
      "Rôle : accompagner en temps réel — décrire utilement ce qui se passe à l'écran, expliquer le code/l'interface observée, signaler les anomalies, répondre aux questions, proposer des corrections concrètes.",
      taskContext ? `Contexte courant : ${taskContext}` : "",
      historyLines.length ? `Conversation récente du salon :\n${historyLines.join("\n")}` : "",
      "Règles : réponses courtes (≤ 120 mots en mode observation, ≤ 200 mots en réponse à une question) ; tu t'appuies UNIQUEMENT sur la capture fournie et le contexte ; si l'image est illisible ou ambiguë, dis-le simplement ; réponds dans la langue du message de l'utilisateur (français par défaut) ; jamais de format markdown lourd — texte brut lisible dans un chat.",
    ]
      .filter(Boolean)
      .join("\n\n")

    const prompt =
      body.mode === "observe"
        ? "Observation périodique : regarde cette capture de l'écran de l'utilisateur et fais un commentaire bref et utile (avancement, anomalie, point d'attention). Ne répète pas un commentaire déjà fait si rien n'a changé — dis simplement « écran inchangé »."
        : rawMessage || "Regarde mon écran et résume la situation."

    // ─── Inférence vision réelle (chaîne de repli fournisseurs) ───
    let result
    try {
      result = await visionChat({
        system,
        prompt,
        imageDataUrl: body.image,
        temperature: 0.4,
        maxTokens: body.mode === "observe" ? 320 : 700,
      })
    } catch (err) {
      throw new ApiError(
        503,
        `Copilote IA indisponible : ${err instanceof Error ? err.message : String(err)}`,
        "AGENT_LLM_UNAVAILABLE"
      )
    }

    // ─── Débit Credit Ledger (après succès réel uniquement) ───
    const credits = Math.max(
      MIN_CREDIT_PER_AGENT_CALL,
      creditsForTokens(result.provider, result.model, result.tokensIn, result.tokensOut)
    )
    const charged = await chargeCredits(user.id, Math.round(credits * 1000) / 1000, {
      type: "TASK_EXECUTION",
      description: `Copilote live (${body.mode}${hasImage ? " + vision" : ""}) — ${result.tokensIn}/${result.tokensOut} tokens`,
      refType: "liveSession",
      refId: session.id,
    })

    // ─── Diffusion du message agent à tous les participants ───
    await db.liveSignal.create({
      data: {
        sessionId: session.id,
        fromId: me.id,
        toId: null,
        type: "AGENT",
        payload: JSON.stringify({
          text: result.content,
          vision: hasImage,
          mode: body.mode,
          latencyMs: result.latencyMs,
          provider: result.provider,
        }),
      },
    })

    return jsonOk({
      reply: result.content,
      credits: Math.round(credits * 1000) / 1000,
      balance: charged.balanceAfter,
      provider: result.provider,
      latencyMs: result.latencyMs,
    })
  })
}
