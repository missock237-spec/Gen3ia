import { z } from "zod"
import { db } from "@/lib/db"
import { BaseEngine, type EngineContext, type EngineExecution } from "./sdk"
import { chatJSON } from "@/lib/ai"
import { sharedMemory } from "./shared-memory"
import { swarmBus } from "./swarm"
import type { DebateProposal, DebateRebuttal, DebateResult, DebateVote } from "./types"

const proposalSchema = z.object({
  proposal: z.string(),
  arguments: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

const rebuttalSchema = z.object({
  counterArguments: z.array(z.string()).min(1).max(5),
})

const voteSchema = z.object({
  scores: z
    .array(
      z.object({
        targetAgentId: z.string(),
        score: z.number().min(0).max(10),
        justification: z.string().max(300).optional().catch(undefined),
      })
    )
    .min(1),
})

const refereeSchema = z.object({
  refereeVerdict: z.string(),
  winningProposalAgentId: z.string().optional(),
  consensusScore: z.number().min(0).max(1),
  synthesis: z.string(),
})

/**
 * DebateOrchestrator — Orchestration de débats multi-agents (v3.6 durci).
 *
 * Quatre phases :
 *  1. PROPOSITIONS — N agents aux angles complémentaires proposent chacun
 *     une solution structurée avec arguments et confiance ;
 *  2. CONTRE-ARGUMENTS (nouveau) — chaque participant reçoit les
 *     propositions des AUTRES et produit des contre-arguments ciblés :
 *     angles morts, risques, coûts cachés — la confrontation devient
 *     effective (et non plus seulement déclarative) ;
 *  3. VOTE PONDÉRÉ (nouveau) — chaque participant note chaque proposition
 *     SAUF la sienne (0-10) ; le vote est pondéré par la confiance du
 *     votant : un agent très confiant pèse plus, mais ne peut jamais
 *     s'auto-élire. Les scores agrégés (voteTally) offrent un signal
 *     de consensus mesurable ;
 *  4. ARBITRAGE — l'agent arbitre reçoit propositions + contre-arguments +
 *     votes et synthétise la décision finale (il peut contredir le vote,
 *     mais doit le justifier).
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

    // ── Phase 1 : Collecte des propositions ──────────────────────
    const proposals: DebateProposal[] = []
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

    // ── Phase 2 : Contre-arguments croisés (v3.6) ────────────────
    const rebuttals: DebateRebuttal[] = []
    for (const p of participants) {
      const others = proposals.filter((pr) => pr.agentId !== p.id)
      const othersSummary = others
        .map((o) => `### Proposition de ${o.agentName} (${o.confidence} de confiance)\n${o.proposal}\nArguments :\n- ${o.arguments.join("\n- ")}`)
        .join("\n\n")

      try {
        const res = await chatJSON(
          {
            messages: [
              {
                role: "system",
                content:
                  `Tu es ${p.name} (angle : ${p.persona}). Tu critiques maintenant les propositions de tes CONCURRENTS. ` +
                  `Pour chacune, identifie des contre-arguments CONCRETS : angles morts, hypothèses fragiles, coûts cachés, ` +
                  `risques de mise en œuvre, cas limites non traités. Sois technique et spécifique — jamais générique. ` +
                  `Réponds en JSON : {"counterArguments":["<contre-argument>"]} (entre 1 et 5, couvrant les propositions adverses).`,
              },
              {
                role: "user",
                content: `Sujet du débat : ${topic}\n\nTa propre proposition (pour contexte) :\n${proposals.find((pr) => pr.agentId === p.id)?.proposal ?? ""}\n\nPropositions à critiquer :\n${othersSummary}`,
              },
            ],
            taskType: "VERIFICATION",
            temperature: 0.35,
          },
          rebuttalSchema
        )
        totalTokensIn += res.tokensIn
        totalTokensOut += res.tokensOut

        // Un bloc de contre-arguments par proposition adverse visée : la
        // répartition est faite par le votant lui-même en phase 3 — ici on
        // conserve l'ensemble attackant chaque concurrent (attribution par
        // proximité de taille : chaque concurrent reçoit ses critiques).
        const perTarget = splitAcrossTargets(res.data.counterArguments, others.map((o) => o.agentId))
        for (const [targetAgentId, counterArguments] of Object.entries(perTarget)) {
          rebuttals.push({ agentId: p.id, agentName: p.name, targetAgentId, counterArguments })
        }
        await swarmBus.publish(session.id, "debate.rebuttals", p.id, res.data.counterArguments.join(" | "), {})
      } catch {
        // La confrontation est best-effort : sans LLM, le débat continue
        // avec propositions + vote (jamais bloquant).
      }
    }

    // ── Phase 3 : Vote pondéré (v3.6) ────────────────────────────
    const votes: DebateVote[] = []
    const voteTally: Record<string, number> = {}
    for (const pr of proposals) voteTally[pr.agentId] = 0

    for (const voter of participants) {
      const others = proposals.filter((pr) => pr.agentId !== voter.id)
      const own = proposals.find((pr) => pr.agentId === voter.id)
      const ballotsSummary = others
        .map((o) => {
          const attacks = rebuttals.filter((r) => r.targetAgentId === o.agentId)
          const defenses = attacks.map((a) => `- (critique de ${a.agentName}) ${a.counterArguments.join(" / ")}`)
          return `### ${o.agentName} — proposition :\n${o.proposal}\nContre-arguments reçus :\n${defenses.join("\n") || "(aucun)"}`
        })
        .join("\n\n")

      try {
        const res = await chatJSON(
          {
            messages: [
              {
                role: "system",
                content:
                  `Tu es ${voter.name} (angle : ${voter.persona}). Tu VOTES maintenant sur les propositions de tes concurrents. ` +
                  `Note chaque proposition SAUF la tienne de 0 (faible) à 10 (excellente). Sois honnête : la qualité des ` +
                  `contre-arguments reçus doit peser dans ta note. Réponds en JSON : ` +
                  `{"scores":[{"targetAgentId":"<id>","score":<0-10>,"justification":"<courte>"}]}.`,
              },
              {
                role: "user",
                content:
                  `Sujet du débat : ${topic}\n\nTa propre proposition (ne la note pas) :\n${own?.proposal ?? ""}\n\nPropositions à noter :\n${ballotsSummary}`,
              },
            ],
            taskType: "VERIFICATION",
            temperature: 0.2,
          },
          voteSchema
        )
        totalTokensIn += res.tokensIn
        totalTokensOut += res.tokensOut

        const voterWeight = own?.confidence ?? 0.5
        for (const score of res.data.scores) {
          if (score.targetAgentId === voter.id) continue // anti-auto-élection
          if (!voteTally.hasOwnProperty(score.targetAgentId)) continue
          const weight = Math.max(0.05, voterWeight)
          votes.push({
            voterAgentId: voter.id,
            targetAgentId: score.targetAgentId,
            score: Math.round(score.score * 10) / 10,
            weight: Math.round(weight * 100) / 100,
          })
          voteTally[score.targetAgentId] += Math.round(score.score * weight * 100) / 100
        }
        await swarmBus.publish(session.id, "debate.votes", voter.id, JSON.stringify(res.data.scores), {})
      } catch {
        // Vote best-effort : sans LLM, l'arbitrage tranche seul.
      }
    }

    // ── Phase 4 : Confrontation et Arbitrage par l'agent Arbitre ──
    const proposalsSummary = proposals
      .map((p) => {
        const attacks = rebuttals.filter((r) => r.targetAgentId === p.agentId)
        const tally = Math.round((voteTally[p.agentId] ?? 0) * 100) / 100
        return `### ${p.agentName} (Confiance: ${p.confidence}, Score de vote pondéré: ${tally})\n**Proposition:** ${p.proposal}\n**Arguments:**\n- ${p.arguments.join("\n- ")}\n**Contre-arguments reçus:**\n${attacks.map((a) => `- ${a.agentName}: ${a.counterArguments.join(" ")}`).join("\n") || "(aucun)"}`
      })
      .join("\n\n")

    const refereeRes = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content:
              `Tu es l'Agent Arbitre (REFEREE) de GEN3IA. Tu analyses les propositions contradictoires, leurs contre-arguments ` +
              `croisés et le vote pondéré des participants. Identifie les points forts/faibles de chacune, évalue le consensus ` +
              `et synthétise la meilleure solution globale. Tu peux contredire le vote — mais uniquement avec une justification ` +
              `explicite et technique. Le score de consensus reflète l'accord réel observé (votes + convergence des arguments).`,
          },
          {
            role: "user",
            content: `Sujet du débat : ${topic}\n\nPropositions, critiques croisées et votes :\n${proposalsSummary}`,
          },
        ],
        taskType: "VERIFICATION",
        temperature: 0.2,
      },
      refereeSchema
    )

    totalTokensIn += refereeRes.tokensIn
    totalTokensOut += refereeRes.tokensOut

    const finalResult: DebateResult = {
      topic,
      proposals,
      rebuttals,
      votes,
      voteTally,
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

/** Répartit des contre-arguments entre les propositions ciblées (round-robin). */
function splitAcrossTargets(
  counterArguments: string[],
  targetIds: string[]
): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const id of targetIds) result[id] = []
  counterArguments.forEach((arg, i) => {
    const target = targetIds[i % targetIds.length]
    result[target].push(arg)
  })
  return result
}

// ------------------------------------------------------------------
// DebateEngine — Adaptateur conforme au SDK BaseEngine
// ------------------------------------------------------------------

export interface DebateEngineInput {
  topic: string
}

export class DebateEngine extends BaseEngine<DebateEngineInput, DebateResult> {
  readonly name = "DEBATE" as const
  readonly description = "Orchestration de débat entre N agents : propositions, contre-arguments croisés, vote pondéré et synthèse par un agent arbitre."
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
