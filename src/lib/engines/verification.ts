import { z } from "zod"
import { chatJSON } from "@/lib/ai/structured"
import type { PromptAnalysis, VerificationReport, EvidenceItem } from "./types"

/**
 * Verification Engine — confronte le résultat aux critères de succès
 * définis lors de l'analyse. Vérification factuelle, preuve à l'appui :
 * sans preuve, le critère n'est PAS validé (règle anti-hallucination).
 */

const verificationSchema = z.object({
  verified: z.boolean().catch(false),
  confidence: z.number().min(0).max(1).catch(0),
  criteria: z
    .array(
      z.object({
        criterion: z.string().catch("critère"),
        met: z.boolean().catch(false),
        evidence: z.string().catch(""),
      })
    )
    .min(1)
    .catch([
      { criterion: "Critères de succès globaux", met: false, evidence: "" },
    ]),
  gaps: z.array(z.string()).max(6).default([]),
  verdict: z.string().min(5).catch("Verdict indisponible."),
})

const SYSTEM_PROMPT = `Tu es le moteur de vérification de GEN3IA. Tu évalues OBJECTIVEMENT si le résultat répond aux critères de succès.

Règles strictes :
- Un critère n'est "met: true" QUE si une preuve explicite figure dans le résultat ou les preuves fournies.
- En cas de doute, "met": false — ne jamais valider sans preuve.
- "gaps" : ce qui manque concrètement pour atteindre les critères non satisfaits.
- "verdict" : jugement global en une ou deux phrases, en français.
- "confidence" : ta confiance dans ta propre évaluation (0 à 1).`

export interface VerificationInput {
  prompt: string
  analysis: PromptAnalysis
  answer: string
  evidence: EvidenceItem[]
}

export async function verifyResult(
  input: VerificationInput
): Promise<{ report: VerificationReport; tokensIn: number; tokensOut: number }> {
  const evidenceDigest = input.evidence
    .slice(0, 12)
    .map((e, i) => `[P${i + 1}] (${e.type}) ${e.description}\n${e.content.slice(0, 800)}`)
    .join("\n\n")

  const result = await chatJSON(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `DEMANDE INITIALE :\n${input.prompt.slice(0, 1500)}\n\n` +
            `CRITÈRES DE SUCCÈS :\n${input.analysis.successCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\n` +
            `RÉSULTAT PRODUIT :\n${input.answer.slice(0, 4000)}\n\n` +
            `PREUVES DISPONIBLES :\n${evidenceDigest.slice(0, 6000) || "(aucune preuve d'outil)"}\n\n` +
            `Squelette attendu :\n{"verified":true,"confidence":0.9,"criteria":[{"criterion":"...","met":true,"evidence":"..."}],"gaps":["..."],"verdict":"..."}\n\n` +
            `Évalue chaque critère.`,
        },
      ],
      taskType: "VERIFICATION",
      temperature: 0.1,
      maxTokens: 1500,
    },
    verificationSchema
  )

  // Règle stricte anti-claims : la tâche n'est vérifiée que si TOUS les
  // critères sont satisfaits avec preuve (au-delà du verdict global du modèle).
  const allMet = result.data.criteria.every((c) => c.met)
  const report: VerificationReport = {
    verified: result.data.verified && allMet,
    confidence: result.data.confidence,
    criteria: result.data.criteria,
    gaps: result.data.verified && !allMet
      ? [...result.data.gaps, "Au moins un critère de succès n'est pas prouvé."]
      : result.data.gaps,
    verdict: result.data.verdict,
  }
  return { report, tokensIn: result.tokensIn, tokensOut: result.tokensOut }
}
