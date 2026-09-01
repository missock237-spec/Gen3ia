import { z } from "zod"
import { chatJSON } from "@/lib/ai/structured"
import { writeMemory } from "@/lib/memory/store"
import type { LearningOutcome, Plan, PromptAnalysis, VerificationReport } from "./types"

/**
 * Learning Engine — après chaque tâche, extrait les leçons durables et les
 * préférences utilisateur, puis les écrit dans la mémoire à long terme.
 * Les tâches suivantes récupèrent automatiquement ces leçons (boucle
 * d'amélioration continue).
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
      importance: 0.7,
      taskId,
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

  return { learning, tokensIn: result.tokensIn, tokensOut: result.tokensOut }
}
