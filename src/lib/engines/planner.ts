import { z } from "zod"
import { chatJSON } from "@/lib/ai/structured"
import type { Plan, PlanId, PlanStep, PromptAnalysis } from "./types"

/**
 * Planner — génère TOUJOURS cinq plans distincts (A à E) pour une tâche :
 * chaque plan possède sa stratégie, ses étapes, ses outils, ses risques,
 * son coût estimé et sa probabilité de succès auto-évaluée.
 * La sélection se fait ensuite par le Plan Evaluation Engine (jamais à l'aveugle).
 */

const planStepSchema = z.object({
  title: z.string().min(3),
  detail: z.string().min(5),
  tool: z.string().optional(),
  model: z.string().optional(),
})

const planSchema = z.object({
  id: z.enum(["A", "B", "C", "D", "E"]),
  name: z.string().min(3),
  strategy: z.string().min(5),
  steps: z.array(planStepSchema).min(1).max(8),
  requiredTools: z.array(z.string()).max(8).default([]),
  risks: z.array(z.string()).max(6).default([]),
  estimatedCostCredits: z.number().min(0.1).max(100).catch(2),
  successProbability: z.number().min(0.05).max(0.95).catch(0.6),
  rationale: z.string().min(10).catch(""),
  requiresHumanConfirmation: z.boolean().default(false),
})

// Le modèle peut renvoyer {"plans":[...]} ou directement un tableau [...] —
// z.preprocess normalise avant validation (messages d'erreur précis).
const plansSchema = z.preprocess(
  (v) => (Array.isArray(v) ? { plans: v } : v),
  z.object({ plans: z.array(planSchema).min(3).max(5) })
)
const PLANS_SKELETON = `{"plans":[{"id":"A","name":"...","strategy":"...","steps":[{"title":"...","detail":"...","tool":"web_search|null"}],"requiredTools":["..."],"risks":["..."],"estimatedCostCredits":2,"successProbability":0.8,"rationale":"...","requiresHumanConfirmation":false}, ... B, C, D, E]}`

const AVAILABLE_TOOLS = [
  "web_search",
  "page_reader",
  "calculator",
  "code_runner",
  "knowledge_search",
  "memory_recall",
  "http_fetch",
]

const SYSTEM_PROMPT = `Tu es le planificateur de GEN3IA. Pour toute demande, tu produis EXACTEMENT 5 plans nommés A, B, C, D, E, chacun avec une STRATÉGIE radicalement différente :

- Plan A : approche directe et rapide (minimum d'étapes).
- Plan B : approche approfondie (recherche et validation élargies).
- Plan C : approche économie de coût (outils gratuits, modèle léger).
- Plan D : approche robuste (vérifications croisées, redondance).
- Plan E : approche créative ou alternative (angle original, autres outils).

Règles strictes :
- "steps" : 1 à 8 étapes concrètes, chacune avec un "detail" exploitable (le moteur exécutera littéralement ces étapes).
- "tool" : une seule valeur parmi ${AVAILABLE_TOOLS.join(", ")} — uniquement si l'étape en a réellement besoin.
- "requiredTools" : union des tools des étapes.
- "requiresHumanConfirmation" : true si le plan implique une opération sensible (exécution de code externe, requête HTTP sortante, action irréversible).
- "estimatedCostCredits" : coût estimé en crédits (1 crédit ≈ 1000 tokens de sortie).
- "successProbability" : ta probabilité honnête de réussite (0.05 à 0.95).
- Les "risks" doivent être concrets et propres à chaque plan.`

export async function generatePlans(
  prompt: string,
  analysis: PromptAnalysis,
  context?: { previousFailure?: string; memories?: string[] }
): Promise<{ plans: Plan[]; tokensIn: number; tokensOut: number }> {
  const failureBlock = context?.previousFailure
    ? `\nATTENTION — une tentative précédente a échoué : ${context.previousFailure}\nLe plan qui a échoué doit être remplacé par une stratégie différente.\n`
    : ""
  const memoryBlock = context?.memories?.length
    ? `\nLeçons tirées des tâches passées :\n- ${context.memories.slice(0, 5).join("\n- ")}\n`
    : ""

  const result = await chatJSON(
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Demande :\n"""\n${prompt.slice(0, 3000)}\n"""\n\n` +
            `Analyse préalable :\n${JSON.stringify(analysis, null, 2).slice(0, 2500)}\n` +
            failureBlock +
            memoryBlock +
            `\nSquelette (respecte exactement ces clés, plans A à E) :\n${PLANS_SKELETON}\n\nProduis les 5 plans (A-E) en JSON.`,
        },
      ],
      taskType: "PLANNING",
      temperature: 0.5,
      maxTokens: 4500,
    },
    plansSchema
  )

  const plans: Plan[] = result.data.plans.map((p) => ({
    id: p.id as PlanId,
    name: p.name,
    strategy: p.strategy,
    steps: p.steps as PlanStep[],
    requiredTools: p.requiredTools,
    risks: p.risks,
    estimatedCostCredits: p.estimatedCostCredits,
    successProbability: p.successProbability,
    rationale: p.rationale,
    requiresHumanConfirmation: p.requiresHumanConfirmation,
  }))

  return { plans, tokensIn: result.tokensIn, tokensOut: result.tokensOut }
}
