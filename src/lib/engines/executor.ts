import { z } from "zod"
import { chat } from "@/lib/ai"
import { chatJSON } from "@/lib/ai/structured"
import { creditsForTokens } from "@/lib/ai/router"
import { runTool, getToolCatalog, isToolDangerous, type ToolResult } from "@/lib/tools/registry"
import { connectorToolsForUser } from "@/lib/connectors/core/toolset"
import { getBreaker } from "@/lib/reliability/breaker"
import { AppError } from "@/lib/errors"
import type {
  EvidenceItem,
  ExecutionLogEntry,
  Plan,
  PromptAnalysis,
} from "./types"

/**
 * Executor — exécute le plan sélectionné étape par étape.
 * Protocole ReAct en JSON : à chaque tour, le modèle décide soit d'appeler
 * un outil, soit de clôturer l'étape. Les observations d'outils alimentent
 * le contexte. Toute sortie devient une preuve (Evidence) traçable.
 */

const stepActionSchema = z.object({
  action: z.enum(["CALL_TOOL", "FINISH_STEP"]),
  reasoning: z.string().min(5).catch("(raisonnement non fourni)"),
  tool: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional().catch(undefined),
  output: z.string().optional().catch(undefined),
})

export interface ExecutorCallbacks {
  onStepStart?: (stepIndex: number, title: string) => Promise<void> | void
  onStepDone?: (entry: ExecutionLogEntry) => Promise<void> | void
  onStepFailed?: (stepIndex: number, error: string) => Promise<void> | void
  onToolCall?: (tool: string, args: Record<string, unknown>, result: ToolResult) => Promise<void> | void
  /** v4.0 — le fournisseur/modèle réels sont transmis (facturation juste). */
  onLLMUsage?: (tokensIn: number, tokensOut: number, credits: number, provider?: string, model?: string) => Promise<void> | void
  /** Retourne false si l'opération dangereuse est refusée (garde HITL). */
  authorizeDangerousTool?: (tool: string, args: Record<string, unknown>) => Promise<boolean> | boolean
  /** v3.1 : checkpoint persisté après chaque étape (reprise après crash). */
  onCheckpoint?: (partial: { steps: ExecutionLogEntry[] }) => Promise<void> | void
}

export interface ExecutorContext {
  userId: string
  taskId: string
  agentId?: string | null
  agentSystemPrompt?: string | null
  allowedTools: string[]
  providerOverride?: string
  /** v4.0 — Phase 9/10 : modèle dédié du plan ("modelId", provider déduit
   * du préfixe "provider/modelId" de plan.model quand présent). */
  modelOverride?: string
  maxToolCallsPerStep?: number
  knowledgeContext?: string
  memories?: string[]
}

const MAX_TOOL_ROUNDS = 5

/** v4.0 — Phase 10 : provider du plan (préfixe "provider/modelId"), sinon auto. */
function planModelProvider(plan: Plan): string | undefined {
  return plan.model?.includes("/") ? plan.model.split("/")[0] : undefined
}

/** Outil unifié pour le prompt : catalogue statique + outils connector. */
interface PromptTool {
  key: string
  description: string
  dangerous: boolean
  parameters: Record<string, { type: string; description: string; required: boolean }>
}

function toPromptTool(t: { key: string; description: string; dangerous: boolean; parameters: Record<string, unknown> }): PromptTool {
  const parameters: PromptTool["parameters"] = {}
  for (const [k, v] of Object.entries(t.parameters)) {
    const p = v as { type?: string; description?: string; required?: boolean }
    parameters[k] = {
      type: String(p.type ?? "string"),
      description: String(p.description ?? ""),
      required: !!p.required,
    }
  }
  return { key: t.key, description: t.description, dangerous: t.dangerous, parameters }
}

function executorSystemPrompt(
  ctx: ExecutorContext,
  plan: Plan,
  connectorTools: PromptTool[]
): string {
  const staticTools = getToolCatalog().filter((t) => ctx.allowedTools.includes(t.key)).map(toPromptTool)
  const tools = [...staticTools, ...connectorTools]
  const toolLines = tools.map((t) => {
    const params = Object.entries(t.parameters)
      .map(([k, p]) => `${k}${p.required ? "*" : ""}:${p.type}`)
      .join(", ")
    return `- ${t.key} : ${t.description}${params ? ` (params: ${params})` : " (sans paramètre)"}${t.dangerous ? " [SENSIBLE]" : ""}`
  })
  return `Tu es le moteur d'exécution de GEN3IA. Tu exécutes le plan suivant avec rigueur, une étape à la fois.

PLAN ${plan.id} — ${plan.name} : ${plan.strategy}

OUTILS DISPONIBLES :
${toolLines.join("\n")}

PROTOCOLE (réponds TOUJOURS en JSON) :
{"action":"CALL_TOOL","reasoning":"...","tool":"<clé d'outil>","args":{...}}
ou
{"action":"FINISH_STEP","reasoning":"...","output":"<résultat complet et utile de l'étape>"}

Règles :
- N'appelle un outil QUE si l'étape l'exige réellement.
- Les arguments "args" doivent correspondre au schéma de l'outil.
- Après chaque observation d'outil, décide : continuer avec un autre outil ou clôturer.
- "output" de FINISH_STEP doit être autoporteur : il servira à la réponse finale.
- N'invente JAMAIS de résultat : si un outil échoue, indique-le dans ton raisonnement et adapte-toi.
${ctx.agentSystemPrompt ? `\nCONSIGNE DE L'AGENT : ${ctx.agentSystemPrompt.slice(0, 800)}` : ""}`
}

export interface ExecutorOutcome {
  steps: ExecutionLogEntry[]
  finalAnswer: string
  evidence: EvidenceItem[]
  tokensIn: number
  tokensOut: number
  error?: string
  /** v3.1 : télémétrie outils (boucle de feedback + EngineRun). */
  toolsUsed?: string[]
  toolFailures?: string[]
}

export async function executePlan(
  prompt: string,
  analysis: PromptAnalysis,
  plan: Plan,
  ctx: ExecutorContext,
  callbacks: ExecutorCallbacks = {},
  correctiveInstruction?: string
): Promise<ExecutorOutcome> {
  const steps: ExecutionLogEntry[] = []
  const evidence: EvidenceItem[] = []
  let tokensIn = 0
  let tokensOut = 0
  const toolsUsed = new Set<string>()
  const toolFailures = new Set<string>()

  // Outils connector : actions des apps connectées de l'utilisateur,
  // filtrées par les outils autorisés de l'agent (clés connector_*).
  const connectorTools = await connectorToolsForUser(ctx.userId, ctx.allowedTools)
    .then((ts) => ts.map(toPromptTool))
    .catch(() => [] as PromptTool[])

  const contextBlock: string[] = [
    `DEMANDE INITIALE :\n${prompt.slice(0, 2500)}`,
    `OBJECTIFS :\n${analysis.goals.map((g) => `- ${g}`).join("\n")}`,
  ]
  if (ctx.knowledgeContext) {
    contextBlock.push(`BASE DE CONNAISSANCES (extraits pertinents) :\n${ctx.knowledgeContext.slice(0, 3000)}`)
  }
  if (ctx.memories?.length) {
    contextBlock.push(`MÉMOIRE (leçons et préférences) :\n- ${ctx.memories.slice(0, 5).join("\n- ")}`)
  }
  if (correctiveInstruction) {
    contextBlock.push(`INSTRUCTION CORRECTIVE (tentative précédente insuffisante) :\n${correctiveInstruction}`)
  }

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]
    const stepStarted = Date.now()
    await callbacks.onStepStart?.(i, step.title)

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: executorSystemPrompt(ctx, plan, connectorTools) },
      { role: "user", content: `${contextBlock.join("\n\n")}\n\nÉTAPE ${i + 1}/${plan.steps.length} : ${step.title}\nDétail : ${step.detail}${step.tool ? `\nOutil suggéré : ${step.tool}` : ""}\n\nCommence.` },
    ]

    const observations: string[] = []
    let stepOutput = ""
    let stepReasoning = ""
    let failed = false
    let stepError = ""
    const stepEvidence: EvidenceItem[] = []
    let stepTokensIn = 0
    let stepTokensOut = 0

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const decision = await chatJSON(
          {
            messages,
            taskType: "EXECUTION",
            temperature: 0.4,
            maxTokens: 2000,
            provider: ctx.providerOverride ?? planModelProvider(plan),
            model: ctx.modelOverride ?? step.model,
            userId: ctx.userId,
            taskId: ctx.taskId,
            agentId: ctx.agentId ?? undefined,
          },
          stepActionSchema
        )
        stepTokensIn += decision.tokensIn
        stepTokensOut += decision.tokensOut
        tokensIn += decision.tokensIn
        tokensOut += decision.tokensOut
        await callbacks.onLLMUsage?.(
          decision.tokensIn,
          decision.tokensOut,
          creditsForTokens(decision.provider, decision.model, decision.tokensIn, decision.tokensOut),
          decision.provider,
          decision.model
        )

        if (decision.data.action === "FINISH_STEP") {
          stepOutput = decision.data.output ?? ""
          stepReasoning = decision.data.reasoning
          stepEvidence.push({
            type: "LLM_OUTPUT",
            description: `Étape ${i + 1} — ${step.title}`,
            content: stepOutput.slice(0, 2000),
          })
          messages.push({ role: "assistant", content: decision.raw.slice(0, 1500) })
          break
        }

        // --- Appel d'outil ---
        const toolKey = decision.data.tool ?? ""
        if (!ctx.allowedTools.includes(toolKey)) {
          messages.push({ role: "assistant", content: decision.raw.slice(0, 1000) })
          observations.push(
            `OBSERVATION : outil « ${toolKey} » non autorisé pour cet agent. Outils disponibles : ${ctx.allowedTools.join(", ")}.`
          )
          messages.push({
            role: "user",
            content: `OBSERVATION : outil « ${toolKey} » non autorisé. Utilise uniquement : ${ctx.allowedTools.join(", ")}, ou clôture l'étape avec FINISH_STEP.`,
          })
          continue
        }

        const args = (decision.data.args ?? {}) as Record<string, unknown>
        if (isToolDangerous(toolKey)) {
          const authorized = await callbacks.authorizeDangerousTool?.(toolKey, args)
          if (authorized === false) {
            observations.push(`OBSERVATION : l'opération sensible « ${toolKey} » a été REFUSÉE par la politique de sécurité.`)
            messages.push({ role: "assistant", content: decision.raw.slice(0, 1000) })
            messages.push({
              role: "user",
              content: `OBSERVATION : l'opération sensible « ${toolKey} » a été refusée par la politique de sécurité. Trouve une autre approche SANS cet outil, ou clôture l'étape en expliquant la limite.`,
            })
            continue
          }
        }

        // v3.1 : appel d'outil protégé par son circuit breaker dédié.
        let result: ToolResult
        try {
          result = await getBreaker(`tool:${toolKey}`).run(() =>
            runTool(toolKey, args, { userId: ctx.userId, agentId: ctx.agentId, taskId: ctx.taskId })
          )
        } catch (breakerErr) {
          if (breakerErr instanceof AppError && breakerErr.code === "RETRY_BUDGET_EXCEEDED") {
            // Circuit ouvert : SWITCH_TOOL effectif — le modèle est informé
            // et doit trouver une approche sans cet outil.
            toolFailures.add(toolKey)
            observations.push(
              `OBSERVATION : l'outil « ${toolKey} » est temporairement indisponible (circuit ouvert après échecs répétés). Utilise un autre outil ou une autre méthode.`
            )
            messages.push({ role: "assistant", content: decision.raw.slice(0, 1000) })
            messages.push({
              role: "user",
              content: `OBSERVATION : l'outil « ${toolKey} » est indisponible (circuit ouvert). Poursuis avec un autre outil ou clôture l'étape en expliquant la limite rencontrée.`,
            })
            continue
          }
          throw breakerErr
        }
        toolsUsed.add(toolKey)
        if (!result.ok) toolFailures.add(toolKey)
        await callbacks.onToolCall?.(toolKey, args, result)
        observations.push(`OBSERVATION (outil ${toolKey}) — ${result.ok ? "succès" : `ÉCHEC : ${result.error}`}:\n${result.output.slice(0, 3500)}`)
        stepEvidence.push({
          type: "TOOL_OUTPUT",
          description: `Outil ${toolKey} — ${JSON.stringify(args).slice(0, 200)}`,
          content: result.output.slice(0, 2000),
        })
        messages.push({ role: "assistant", content: decision.raw.slice(0, 1000) })
        messages.push({
          role: "user",
          content: `OBSERVATION (outil ${toolKey}) — ${result.ok ? "succès" : `ÉCHEC : ${result.error}`}:\n${result.output.slice(0, 3500)}\n\nDécide : CALL_TOOL pour approfondir, ou FINISH_STEP avec le résultat consolidé.`,
        })
      }

      if (!stepOutput) {
        // Aucune clôture explicite après les tours autorisés.
        stepOutput = observations.join("\n\n").slice(0, 3000) || "(étape sans sortie exploitable)"
        stepReasoning = "Clôture implicite après épuisement des tours d'outils."
        stepEvidence.push({
          type: "LLM_OUTPUT",
          description: `Étape ${i + 1} — observations brutes`,
          content: stepOutput.slice(0, 2000),
        })
      }
    } catch (err) {
      failed = true
      stepError = err instanceof Error ? err.message : String(err)
      await callbacks.onStepFailed?.(i, stepError)
      throw err
    }

    const entry: ExecutionLogEntry = {
      stepIndex: i,
      title: step.title,
      status: failed ? "FAILED" : "DONE",
      tool: step.tool,
      output: stepOutput,
      reasoning: stepReasoning,
      tokensIn: stepTokensIn,
      tokensOut: stepTokensOut,
      latencyMs: Date.now() - stepStarted, // v3.1 : latence RÉELLE mesurée
      evidence: stepEvidence,
      attempt: 1,
    }
    steps.push(entry)
    evidence.push(...stepEvidence)
    await callbacks.onStepDone?.(entry)
    // v3.1 : checkpoint après chaque étape — un crash ne perd plus le travail.
    await Promise.resolve(callbacks.onCheckpoint?.({ steps: [...steps] })).catch(() => undefined)

    // Le contexte s'enrichit pour l'étape suivante.
    contextBlock.push(`RÉSULTAT ÉTAPE ${i + 1} (${step.title}) :\n${stepOutput.slice(0, 1500)}`)
  }

  // --- Synthèse finale ---
  const synthesis = await chat({
    messages: [
      {
        role: "system",
        content:
          "Tu es le synthétiseur final de GEN3IA. À partir de la demande initiale et des résultats d'étapes, tu produis la réponse finale : complète, structurée, en français, directement exploitable par l'utilisateur. Cite les faits issus des outils ; n'invente rien. Si des éléments manquent, signale-le explicitement.",
      },
      {
        role: "user",
        content:
          `${contextBlock.join("\n\n")}\n\nCritères de succès attendus :\n${analysis.successCriteria.map((c) => `- ${c}`).join("\n")}\n\nRédige la réponse finale.`,
      },
    ],
    taskType: "EXECUTION",
    temperature: 0.5,
    maxTokens: 3000,
    provider: ctx.providerOverride ?? planModelProvider(plan),
    model: ctx.modelOverride,
    userId: ctx.userId,
    taskId: ctx.taskId,
    agentId: ctx.agentId ?? undefined,
  } as never)
  tokensIn += synthesis.tokensIn
  tokensOut += synthesis.tokensOut
  await callbacks.onLLMUsage?.(
    synthesis.tokensIn,
    synthesis.tokensOut,
    creditsForTokens(synthesis.provider, synthesis.model, synthesis.tokensIn, synthesis.tokensOut),
    synthesis.provider,
    synthesis.model
  )
  evidence.push({
    type: "LLM_OUTPUT",
    description: "Synthèse finale",
    content: synthesis.content.slice(0, 3000),
  })

  return {
    steps,
    finalAnswer: synthesis.content,
    evidence,
    tokensIn,
    tokensOut,
    toolsUsed: [...toolsUsed],
    toolFailures: [...toolFailures],
  }
}
