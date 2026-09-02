import { z } from "zod"
import { db } from "@/lib/db"
import { BaseEngine, type EngineContext, type EngineExecution } from "./sdk"
import { chat, chatJSON } from "@/lib/ai"
import { sharedMemory } from "./shared-memory"
import { swarmBus } from "./swarm"
import type { DebateProposal, DebateResult } from "./types"

const proposalSchema = z.object({
  proposal: z.string(),
  arguments: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

const refereeSchema = z.object({
  refereeVerdict: z.string(),
  winningProposalAgentId: z.string().optional(),
  consensusScore: z.number().min(0).max(1),
  synthesis: z.string(),
})

/**
 * DebateOrchestrator — Orchestration de débats multi-agents.
 * Lance N agents avec des angles d'attaque complémentaires sur le même problème,
 * collecte leurs propositions, les confronte via un agent arbitre et produit une synthèse.
 */
export class DebateOrchestrator {
  async runDebate(
    userId: string,
    topic: string,
    taskId?: string
  ): Promise<{ result: DebateResult; tokensIn: number; tokensOut: number }> {
    let totalTokensIn = 0
    let totalTokensOut = 0

    const session = await db.swarmSession.create({
      data: {
        userId,
        taskId,
        prompt: topic,
        strategy: "DEBATE",
        status: "RUNNING",
      },
    })

    const participants = [
      { id: "agent_pragmatic", name: "Analyste Pragmatique", persona: "Centré sur la faisabilité, le coût et la simplicité." },
      { id: "agent_visionary", name: "Innovateur Visionnaire", persona: "Centré sur la complétude, la performance et l'innovation." },
      { id: "agent_critical", name: "Critique Rigoureux", persona: "Centré sur la sécurité, les risques et les cas limites." },
    ]

    const proposals: DebateProposal[] = []

    // Phase 1 : Collecte des propositions
    for (const p of participants) {
      const res = await chatJSON(
        {
          messages: [
            {
              role: "system",
              content: `Tu es ${p.name}. Ton angle : ${p.persona}. Propose une solution structurée au problème posé.`,
            },
            { role: "user", content: `Sujet du débat : ${topic}` },
          ],
          taskType: "PLANNING",
          temperature: 0.4,
        },
        proposalSchema
      )

      totalTokensIn += res.tokensIn
      totalTokensOut += res.tokensOut

      const proposalEntry: DebateProposal = {
        agentId: p.id,
        agentName: p.name,
        role: p.persona,
        proposal: res.data.proposal,
        arguments: res.data.arguments,
        confidence: res.data.confidence,
      }

      proposals.push(proposalEntry)
      await sharedMemory.write(session.id, `proposal:${p.id}`, proposalEntry, p.id, "debate")
      await swarmBus.publish(session.id, "debate.proposals", p.id, res.data.proposal, { arguments: res.data.arguments })
    }

    // Phase 2 : Confrontation et Arbitrage par l'agent Arbitre
    const proposalsSummary = proposals
      .map((p) => `### ${p.agentName} (Confiance: ${p.confidence})\n**Proposition:** ${p.proposal}\n**Arguments:**\n- ${p.arguments.join("\n- ")}`)
      .join("\n\n")

    const refereeRes = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content: `Tu es l'Agent Arbitre (REFEREE) de GEN3IA. Ton rôle est d'analyser les propositions contradictoires des différents agents, d'identifier les points forts et faiblesses de chacune, d'évaluer le consensus et de synthétiser la meilleure solution globale.`,
          },
          {
            role: "user",
            content: `Sujet du débat : ${topic}\n\nPropositions des agents :\n${proposalsSummary}`,
          },
        ],
        taskType: "EVALUATION",
        temperature: 0.2,
      },
      refereeSchema
    )

    totalTokensIn += refereeRes.tokensIn
    totalTokensOut += refereeRes.tokensOut

    const finalResult: DebateResult = {
      topic,
      proposals,
      refereeVerdict: refereeRes.data.refereeVerdict,
      winningProposalAgentId: refereeRes.data.winningProposalAgentId,
      consensusScore: refereeRes.data.consensusScore,
      synthesis: refereeRes.data.synthesis,
    }

    await db.swarmSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        result: JSON.stringify(finalResult),
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      },
    })

    return { result: finalResult, tokensIn: totalTokensIn, tokensOut: totalTokensOut }
  }
}

// ------------------------------------------------------------------
// DebateEngine — Adaptateur conforme au SDK BaseEngine
// ------------------------------------------------------------------

export interface DebateEngineInput {
  topic: string
}

export class DebateEngine extends BaseEngine<DebateEngineInput, DebateResult> {
  readonly name = "DEBATE" as const
  readonly description = "Orchestration de débat entre N agents et synthèse par un agent arbitre."
  readonly phase = "EVALUATOR" as any
  readonly errorCode = "EVALUATION_FAILED" as const

  async execute(input: DebateEngineInput, ctx: EngineContext): Promise<EngineExecution<DebateResult>> {
    const orchestrator = new DebateOrchestrator()
    const { result, tokensIn, tokensOut } = await orchestrator.runDebate(ctx.userId, input.topic, ctx.taskId)

    return {
      value: result,
      tokensIn,
      tokensOut,
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
