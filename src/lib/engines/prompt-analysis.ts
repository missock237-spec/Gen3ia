import { z } from "zod"
import { chatJSON } from "@/lib/ai/structured"
import type { PromptAnalysis } from "./types"

/**
 * Prompt Analysis Engine — première phase du pipeline.
 * Extrait de la demande : intention, objectifs, contraintes, capacités
 * nécessaires, risques, critères de succès/échec, complexité, langue.
 */

const analysisSchema = z.object({
  intent: z.string().min(3).catch(""),
  goals: z.array(z.string()).min(1).max(8),
  constraints: z.array(z.string()).max(10).default([]),
  requiredCapabilities: z.array(z.string()).max(12).default([]),
  risks: z.array(z.string()).max(8).default([]),
  successCriteria: z.array(z.string()).min(1).max(6),
  failureCriteria: z.array(z.string()).max(6).default([]),
  estimatedComplexity: z.enum(["LOW", "MEDIUM", "HIGH"]).catch("MEDIUM"),
  estimatedSteps: z.number().int().min(1).max(12).catch(3),
  language: z.string().min(2).max(5).catch("fr"),
  clarificationNeeded: z.boolean().catch(false),
})

const SYSTEM_PROMPT = `Tu es le moteur d'analyse de prompts de GEN3IA. Ton rôle est de décomposer une demande utilisateur en une analyse structurée, rigoureuse et exploitable par un planificateur.

Règles :
- "goals" : objectifs concrets et vérifiables (jamais vagues).
- "constraints" : contraintes explicites OU implicites déduites de la demande (langue, longueur, format, délais).
- "requiredCapabilities" : capacités nécessaires parmi ["web_search","page_reader","calculator","code_runner","knowledge_search","memory_recall","http_fetch","redaction","traduction","analyse"] — utilise ces clés quand c'est pertinent.
- "risks" : risques réels d'échec (données manquantes, sujet ambigu, opération sensible).
- "successCriteria" : critères OBJECTIFS et vérifiables a posteriori.
- "failureCriteria" : signaux d'échec détectables.
- "clarificationNeeded" : true uniquement si la demande est réellement incohérente ou incomplète de façon bloquante.`

export async function analyzePrompt(
  prompt: string,
  context?: { agentName?: string; agentSystemPrompt?: string; memories?: string[] }
): Promise<{ analysis: PromptAnalysis; tokensIn: number; tokensOut: number }> {
  const contextBlock: string[] = []
  if (context?.agentName) contextBlock.push(`Agent utilisé : ${context.agentName}`)
  if (context?.agentSystemPrompt)
    contextBlock.push(`Consigne système de l'agent : ${context.agentSystemPrompt.slice(0, 500)}`)
  if (context?.memories?.length)
    contextBlock.push(`Mémoire pertinente :\n- ${context.memories.slice(0, 5).join("\n- ")}`)

  const result = await chatJSON(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Demande à analyser :\n"""\n${prompt.slice(0, 4000)}\n"""\n` +
            (contextBlock.length ? `\nContexte additionnel :\n${contextBlock.join("\n")}\n` : "") +
            `\nSquelette attendu (complète chaque champ, [] si vide) :\n` +
            `{"intent":"...","goals":["..."],"constraints":["..."],"requiredCapabilities":["..."],"risks":["..."],"successCriteria":["..."],"failureCriteria":["..."],"estimatedComplexity":"LOW|MEDIUM|HIGH","estimatedSteps":3,"language":"fr","clarificationNeeded":false}\n\nRenvoie le JSON d'analyse.`,
        },
      ],
      taskType: "ANALYSIS",
      temperature: 0.3,
      maxTokens: 2000,
    },
    analysisSchema
  )

  return {
    analysis: result.data as PromptAnalysis,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  }
}
