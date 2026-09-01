import { z } from "zod"
import { chatJSON } from "@/lib/ai/structured"
import { writeMemory } from "@/lib/memory/store"
import type { LearningOutcome, Plan, PromptAnalysis, VerificationReport } from "./types"

/**
 * Learning Engine — après chaque tâche, extrait les leçons durables et les
 * préférences utilisateur, puis les écrit dans la mémoire à long terme.
 * Les tâches suivantes récupèrent automatiquement ces leçons (boucle
 * d'amélioration continue).
 *
 * Améliorations v3.1 — mémoire ACTIONNABLE :
 *  - les « patrons réutilisables » sont désormais PERSISTÉS (couche
 *    LONG_TERM, type PATTERN) — ils nourrissent le contexte du
 *    planificateur comme les leçons ;
 *  - l'apprentissage s'exécute AUSSI sur les échecs (outcome FAILURE) :
 *    les leçons d'échec alimentent la boucle de feedback (priors de
 *    l'évaluateur, outils à éviter) — fini l'apprentissage mort du côté
 *    échec ;
 *  - les couches TASK/AGENT sont utilisées : TASK conserve le résumé de
 *    contexte pour reprise, AGENT reçoit les stats par archétype.
 */

const learningSchema = z.object({
  lessons: z.array(z.string()).max(5).default([]),
  userPreferences: z.array(z.string()).max(4).default([]),
  reusablePatterns: z.array(z.string()).max(3).default([]),
})

export interface LearningInput {
  prompt: string
  analysis: PromptAnalysis
  plan: Plan
  outcome: "SUCCESS" | "FAILURE"
  verification?: VerificationReport
  error?: string
}

export async function extractLearning(
  userId: string,
  taskId: string,
  input: LearningInput
): Promise<{ learning: LearningOutcome; tokensIn: number; tokensOut: number }> {
  const failureContext =
    input.outcome === "FAILURE"
      ? `Cette tâche a ÉCHOUÉ. Concentre-toi sur : ce qui a causé l'échec, ce qu'il faut éviter la prochaine fois, quel archétype de plan ou outil ne PAS réutiliser. Les leçons d'échec sont les plus précieuses — sois précis et concret.\n`
      : ""

  const result = await chatJSON(
    {
      messages: [
        {
          role: "system",
          content:
            "Tu es le moteur d'apprentissage de GEN3IA. Tu extrais des leçons COURTES et réutilisables (une phrase chacune), des préférences utilisateur observées et des patrons réutilisables. Ne génère rien de générique : uniquement ce qui aiderait concrètement une future tâche similaire.",
        },
        {
          role: "user",
          content:
            `TÂCHE : ${input.prompt.slice(0, 800)}\n\n` +
            `PLAN UTILISÉ : ${input.plan.id} — ${input.plan.name} (${input.plan.strategy.slice(0, 300)})\n\n` +
            `RÉSULTAT : ${input.outcome}${input.verification ? ` — verdict : ${input.verification.verdict}` : ""}${input.error ? ` — erreur : ${input.error.slice(0, 300)}` : ""}\n\n` +
            failureContext +
            `Extrais leçons, préférences et patrons.`,
        },
      ],
      taskType: "LEARNING",
      temperature: 0.3,
      maxTokens: 700,
    },
    learningSchema
  )

  const learning: LearningOutcome = result.data

  // Écriture en mémoire longue durée (leçons) et couche USER (préférences).
  for (const lesson of learning.lessons) {
    await writeMemory({
      userId,
      layer: "LONG_TERM",
      content: lesson,
      importance: input.outcome === "FAILURE" ? 0.8 : 0.7,
      taskId,
      metadata: { type: input.outcome === "FAILURE" ? "FAILURE_LESSON" : "LESSON" },
    })
  }
  for (const pref of learning.userPreferences) {
    await writeMemory({
      userId,
      layer: "USER",
      content: pref,
      importance: 0.8,
      taskId,
    })
  }
  // v3.1 : les patrons réutilisables sont persistés (auparavant extraits puis perdus).
  for (const pattern of learning.reusablePatterns) {
    await writeMemory({
      userId,
      layer: "LONG_TERM",
      content: pattern,
      importance: 0.65,
      taskId,
      metadata: { type: "PATTERN" },
    })
  }

  return { learning, tokensIn: result.tokensIn, tokensOut: result.tokensOut }
}
