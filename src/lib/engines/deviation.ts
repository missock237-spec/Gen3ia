import { chatJSON } from "@/lib/ai"
import { z } from "zod"
import type { DeviationReport, Plan, PlanStep } from "./types"
import { logger } from "@/lib/observability/logger"

const deviationSchema = z.object({
  deviationScore: z.number().min(0).max(1),
  shouldReplan: z.boolean(),
  reason: z.string(),
})

/**
 * DeviationDetector — Détecte quand un résultat intermédiaire s'écarte
 * des prévisions du plan, déclenchant une re-planification proactive
 * (pas seulement en cas d'échec).
 */
export class DeviationDetector {
  /**
   * Compare le résultat intermédiaire d'une étape à ce qui était prévu.
   * @returns Un rapport de déviation indiquant si une re-planification est nécessaire.
   */
  async detect(
    plan: Plan,
    stepIndex: number,
    step: PlanStep,
    actualOutput: string
  ): Promise<DeviationReport> {
    logger.info(`Détection de déviation pour l'étape ${stepIndex} du plan ${plan.id}`)

    const res = await chatJSON(
      {
        messages: [
          {
            role: "system",
            content: `Tu es le moteur de détection de déviation de GEN3IA. Analyse si le résultat intermédiaire d'une étape d'exécution s'écarte significativement de ce qui était prévu.
Évalue la déviation sur une échelle de 0 à 1 (0 = conforme, 1 = totalement hors-piste).
Si la déviation > 0.6, recommande une re-planification (shouldReplan = true).`,
          },
          {
            role: "user",
            content: `Plan sélectionné : ${plan.name} — ${plan.strategy}
Étape ${stepIndex} : ${step.title}
Détail prévu : ${step.detail}
 Résultat obtenu :
"""
${actualOutput}
"""
Le résultat est-il conforme aux attentes ? Évalue la déviation.`,
          },
        ],
        taskType: "EVALUATION",
        temperature: 0.1,
      },
      deviationSchema
    )

    return {
      stepIndex,
      expectedOutcome: step.detail,
      actualOutcome: actualOutput,
      deviationScore: res.data.deviationScore,
      shouldReplan: res.data.shouldReplan,
      reason: res.data.reason,
    }
  }

  /**
   * Vérifie si une re-planification est nécessaire après chaque étape d'exécution.
   * Retourne true si le pipeline doit re-planifier.
   */
  async shouldReplanAfterStep(
    plan: Plan,
    stepIndex: number,
    actualOutput: string
  ): Promise<boolean> {
    const step = plan.steps[stepIndex]
    if (!step) return false

    const report = await this.detect(plan, stepIndex, step, actualOutput)
    if (report.shouldReplan) {
      logger.warn(`Re-planification recommandée à l'étape ${stepIndex} : ${report.reason}`)
      return true
    }
    return false
  }
}

export const deviationDetector = new DeviationDetector()
