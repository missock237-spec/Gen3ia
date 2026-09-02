import { z } from "zod"
import { db } from "@/lib/db"
import { EventEmitter } from "events"
import { BaseEngine, type EngineContext, type EngineExecution } from "./sdk"
import { chat, chatJSON } from "@/lib/ai"
import { sharedMemory } from "./shared-memory"
import type { SubAgent, SubTaskSpec, SwarmMessagePayload, SwarmTask } from "./types"

// ------------------------------------------------------------------
// Bus de communication Pub/Sub inter-agents persisté
// ------------------------------------------------------------------

export class SwarmCommunicationBus {
  private static instance: SwarmCommunicationBus
  private emitter: EventEmitter

  private constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(100)
  }

  public static getInstance(): SwarmCommunicationBus {
    if (!SwarmCommunicationBus.instance) {
      SwarmCommunicationBus.instance = new SwarmCommunicationBus()
    }
    return SwarmCommunicationBus.instance
  }

  /** Publie un message sur un canal et le persiste en base. */
  async publish(
    sessionId: string,
    channel: string,
    senderId: string,
    content: string,
    payload?: Record<string, unknown>
  ): Promise<SwarmMessagePayload> {
    const record = await db.swarmMessage.create({
      data: {
        sessionId,
        channel,
        senderId,
        content,
        payload: payload ? JSON.stringify(payload) : null,
      },
    })

    const msg: SwarmMessagePayload = {
      id: record.id,
      sessionId,
      channel,
      senderId,
      content,
      payload,
      createdAt: record.createdAt.toISOString(),
    }

    this.emitter.emit(`bus:${sessionId}:${channel}`, msg)
    this.emitter.emit(`bus:${sessionId}`, msg)
    return msg
  }

  /** S'abonne à un canal de communication pub/sub. */
  subscribe(sessionId: string, channel: string, callback: (msg: SwarmMessagePayload) => void): () => void {
    const eventName = channel ? `bus:${sessionId}:${channel}` : `bus:${sessionId}`
    this.emitter.on(eventName, callback)
    return () => {
      this.emitter.off(eventName, callback)
    }
  }

  /** Récupère l'historique des messages d'un canal. */
  async getHistory(sessionId: string, channel?: string): Promise<SwarmMessagePayload[]> {
    const records = await db.swarmMessage.findMany({
      where: { sessionId, ...(channel ? { channel } : {}) },
      orderBy: { createdAt: "asc" },
    })
    return records.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      channel: r.channel,
      senderId: r.senderId,
      content: r.content,
      payload: r.payload ? JSON.parse(r.payload) : undefined,
      createdAt: r.createdAt.toISOString(),
    }))
  }
}

export const swarmBus = SwarmCommunicationBus.getInstance()

// ------------------------------------------------------------------
// Schéma de décomposition hiérarchique
// ------------------------------------------------------------------

const decompositionSchema = z.object({
  subTasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      assignedAgentRole: z.enum(["RESEARCHER", "DATA_ANALYZER", "WRITER", "CUSTOM"]),
      dependencies: z.array(z.string()).default([]),
    })
  ),
  strategyRationale: z.string(),
})

/**
 * SwarmOrchestrator — Orchestration hiérarchique multi-agents.
 * Un agent "Superviseur" décompose une tâche complexe en sous-tâches
 * assignées à des sous-agents spécialisés (recherche, analyse, rédaction)
 * qui communiquent via la mémoire partagée et le bus Pub/Sub persisté.
 */
export class SwarmOrchestrator {
  /** Décompose le prompt principal et crée la session Swarm en base. */
  async createSession(userId: string, prompt: string, taskId?: string): Promise<SwarmTask> {
    const decomposition = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content: `Tu es le Superviseur Swarm de GEN3IA. Décompose la demande utilisateur en sous-tâches indépendantes ou ordonnées (DAG).
Rôles disponibles pour les sous-agents :
- RESEARCHER : collecte des faits, recherche d'informations et extraction.
- DATA_ANALYZER : traitement des données, calculs, statistiques et structuration.
- WRITER : synthèse, mise en forme, rédaction finale du rapport.

Indique les dépendances de chaque sous-tâche (IDs des tâches prérequises).`,
          },
          { role: "user", content: `Demande à décomposer :\n"""\n${prompt}\n"""` },
        ],
        taskType: "PLANNING",
        temperature: 0.2,
      },
      decompositionSchema
    )

    const session = await db.swarmSession.create({
      data: {
        userId,
        taskId,
        prompt,
        strategy: "HIERARCHICAL",
        plan: JSON.stringify(decomposition.data),
        tokensIn: decomposition.tokensIn,
        tokensOut: decomposition.tokensOut,
      },
    })

    const subTasksData = decomposition.data.subTasks.map((st) => ({
      sessionId: session.id,
      title: st.title,
      description: st.description,
      assignedAgent: st.assignedAgentRole,
      dependencies: JSON.stringify(st.dependencies),
      status: "PENDING",
    }))

    await db.subTask.createMany({ data: subTasksData })

    const savedSubTasks = await db.subTask.findMany({ where: { sessionId: session.id } })

    return {
      id: session.id,
      sessionId: session.id,
      prompt,
      strategy: "HIERARCHICAL",
      status: "RUNNING",
      subTasks: savedSubTasks.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        assignedAgentRole: s.assignedAgent as any,
        dependencies: JSON.parse(s.dependencies ?? "[]"),
        status: s.status as any,
      })),
      subAgents: [
        { id: "supervisor", name: "Superviseur", role: "SUPERVISOR", systemPrompt: "", capabilities: ["coordination"] },
        { id: "researcher", name: "Agent Recherche", role: "RESEARCHER", systemPrompt: "", capabilities: ["search"] },
        { id: "analyzer", name: "Agent Analyse", role: "DATA_ANALYZER", systemPrompt: "", capabilities: ["analysis"] },
        { id: "writer", name: "Agent Rédacteur", role: "WRITER", systemPrompt: "", capabilities: ["writing"] },
      ],
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    }
  }

  /** Exécute les sous-tâches prêtes en parallèle ou séquentiellement selon le DAG. */
  async executeSession(sessionId: string): Promise<{ finalResult: string; tokensIn: number; tokensOut: number }> {
    let totalTokensIn = 0
    let totalTokensOut = 0

    const session = await db.swarmSession.findUniqueOrThrow({ where: { id: sessionId } })
    const subTasks = await db.subTask.findMany({ where: { sessionId } })

    const completedTaskIds = new Set<string>()
    const taskResults = new Map<string, string>()

    while (completedTaskIds.size < subTasks.length) {
      const readySubTasks = subTasks.filter((st) => {
        if (st.status === "DONE") {
          completedTaskIds.add(st.id)
          return false
        }
        if (st.status === "RUNNING") return false

        const deps: string[] = JSON.parse(st.dependencies ?? "[]")
        return deps.every((d) => completedTaskIds.has(d) || Array.from(taskResults.keys()).includes(d))
      })

      if (readySubTasks.length === 0) break

      // Exécution parallèle des sous-tâches prêtes
      await Promise.all(
        readySubTasks.map(async (st) => {
          await db.subTask.update({ where: { id: st.id }, data: { status: "RUNNING", startedAt: new Date() } })
          await swarmBus.publish(sessionId, "tasks.status", st.assignedAgent, `Début de la sous-tâche : ${st.title}`)

          const sharedEntries = await sharedMemory.list(sessionId)
          const contextBlock = sharedEntries
            .map((e) => `[Memoire ${e.key}] (${e.author}): ${JSON.stringify(e.value)}`)
            .join("\n")

          const agentPrompt = `Tu es un sous-agent spécialisé (${st.assignedAgent}).
Sous-tâche assignée : ${st.title}
Description : ${st.description}

Informations en mémoire partagée :
${contextBlock || "Aucune information en mémoire pour le moment."}

Réalise le travail demandé de manière rigoureuse.`

          const res = await chat({
            messages: [{ role: "system", content: agentPrompt }],
            taskType: "EXECUTION",
            temperature: 0.3,
          })

          totalTokensIn += res.tokensIn
          totalTokensOut += res.tokensOut

          await sharedMemory.write(sessionId, `result:${st.id}`, res.content, st.assignedAgent)
          await swarmBus.publish(sessionId, "tasks.results", st.assignedAgent, res.content, { subTaskId: st.id })

          await db.subTask.update({
            where: { id: st.id },
            data: { status: "DONE", result: res.content, finishedAt: new Date() },
          })

          completedTaskIds.add(st.id)
          taskResults.set(st.id, res.content)
        })
      )
    }

    // Synthèse par le Superviseur
    const allResults = Array.from(taskResults.entries())
      .map(([id, res]) => `--- Sous-tâche ${id} ---\n${res}`)
      .join("\n\n")

    const synthesis = await chat({
      messages: [
        {
          role: "system",
          content: "Tu es le Superviseur Swarm. Synthétise les travaux des sous-agents en une réponse complète, fluide et cohérente.",
        },
        {
          role: "user",
          content: `Demande initiale : ${session.prompt}\n\nRésultats des sous-agents :\n${allResults}`,
        },
      ],
      taskType: "SUMMARIZATION",
      temperature: 0.3,
    })

    totalTokensIn += synthesis.tokensIn
    totalTokensOut += synthesis.tokensOut

    await db.swarmSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        result: JSON.stringify({ synthesis: synthesis.content }),
        tokensIn: { increment: totalTokensIn },
        tokensOut: { increment: totalTokensOut },
      },
    })

    return {
      finalResult: synthesis.content,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
    }
  }
}

// ------------------------------------------------------------------
// SwarmEngine — Adaptateur conforme au SDK BaseEngine
// ------------------------------------------------------------------

export interface SwarmEngineInput {
  prompt: string
  sessionId?: string
}

export class SwarmEngine extends BaseEngine<SwarmEngineInput, { synthesis: string }> {
  readonly name = "SWARM" as const
  readonly description = "Orchestration Swarm multi-agents hiérarchique avec bus pub/sub et mémoire partagée."
  readonly phase = "EXECUTING" as const
  readonly errorCode = "EXECUTION_FAILED" as const

  async execute(input: SwarmEngineInput, ctx: EngineContext): Promise<EngineExecution<{ synthesis: string }>> {
    const orchestrator = new SwarmOrchestrator()
    const session = input.sessionId
      ? { id: input.sessionId }
      : await orchestrator.createSession(ctx.userId, input.prompt, ctx.taskId)

    const result = await orchestrator.executeSession(session.id)

    return {
      value: { synthesis: result.finalResult },
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs: 0,
      attempts: 1,
    }
  }

  async rollback(ctx: EngineContext): Promise<void> {
    await db.swarmSession.updateMany({
      where: { taskId: ctx.taskId },
      data: { status: "FAILED" },
    }).catch(() => undefined)
  }
}
