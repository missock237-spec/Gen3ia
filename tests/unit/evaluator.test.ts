import { describe, test, expect } from "bun:test"
import { evaluatePlans } from "@/lib/engines/evaluator"
import type { Plan, FeedbackSnapshot } from "@/lib/engines/feedback"

/** Plan Evaluation Engine — formule pondérée + boucle de feedback. */

function plan(overrides: Partial<Plan>): Plan {
  return {
    id: "A",
    name: "Plan de test",
    strategy: "Stratégie de test",
    steps: [
      { title: "Étape 1", detail: "détail" },
      { title: "Étape 2", detail: "détail" },
    ],
    requiredTools: [],
    risks: [],
    estimatedCostCredits: 2,
    successProbability: 0.7,
    rationale: "rationale suffisamment long",
    requiresHumanConfirmation: false,
    ...overrides,
  }
}

describe("evaluator — formule pondérée", () => {
  test("sélectionne le plan au meilleur score", () => {
    const plans = [
      plan({ id: "A", successProbability: 0.5, estimatedCostCredits: 5 }),
      plan({ id: "B", successProbability: 0.9, estimatedCostCredits: 1 }),
    ]
    const result = evaluatePlans({ plans, availableTools: [], userCredits: 100 })
    expect(result.selectedPlanId).toBe("B")
    expect(result.scores).toHaveLength(2)
  })

  test("décomposition du score tracée (6 critères)", () => {
    const result = evaluatePlans({ plans: [plan({})], availableTools: [], userCredits: 100 })
    const breakdown = result.scores[0].breakdown
    expect(breakdown.map((b) => b.criterion)).toEqual([
      "successRate", "accuracy", "cost", "latency", "risk", "completeness",
    ])
    // Somme des contributions = score pondéré.
    const sum = breakdown.reduce((acc, b) => acc + b.contribution, 0)
    expect(sum).toBeCloseTo(result.scores[0].weighted, 2)
  })

  test("plan trop cher disqualifié si un abordable existe", () => {
    const plans = [
      plan({ id: "A", successProbability: 0.95, estimatedCostCredits: 500 }),
      plan({ id: "B", successProbability: 0.6, estimatedCostCredits: 3 }),
    ]
    const result = evaluatePlans({ plans, availableTools: [], userCredits: 10 })
    expect(result.selectedPlanId).toBe("B")
  })

  test("outils requis indisponibles pénalisent la complétude", () => {
    const available = ["web_search"]
    const withUnavailable = plan({ id: "A", requiredTools: ["web_search", "code_runner"] })
    const withAvailable = plan({ id: "B", requiredTools: ["web_search"] })
    const result = evaluatePlans({
      plans: [withUnavailable, withAvailable],
      availableTools: available,
      userCredits: 100,
    })
    const completenessA = result.scores.find((s) => s.planId === "A")!.breakdown.find((b) => b.criterion === "completeness")!
    const completenessB = result.scores.find((s) => s.planId === "B")!.breakdown.find((b) => b.criterion === "completeness")!
    expect(completenessA.value).toBeLessThan(completenessB.value)
  })
})

describe("evaluator — boucle de feedback (v3.1)", () => {
  const feedback: FeedbackSnapshot = {
    strategies: [
      { planId: "A", runs: 10, successRate: 0.9 }, // archétype A performant
      { planId: "B", runs: 10, successRate: 0.25 }, // archétype B défaillant
    ],
    tools: [
      { tool: "web_search", runs: 20, failures: 1, successRate: 0.95 },
      { tool: "code_runner", runs: 10, failures: 8, successRate: 0.2 }, // outil défaillant
    ],
    toolsToAvoid: ["code_runner"],
    performingStrategies: ["A"],
  }

  test("taux observé mélange la probabilité déclarée", () => {
    const plans = [plan({ id: "A", successProbability: 0.5 })]
    const result = evaluatePlans({ plans, availableTools: [], userCredits: 100, feedback })
    // blended = 0.7·0.5 + 0.3·0.9 = 0.62
    const successRate = result.scores[0].breakdown.find((b) => b.criterion === "successRate")!
    expect(successRate.value).toBeCloseTo(0.62, 2)
  })

  test("outil historiquement défaillant pénalise le plan", () => {
    const good = plan({ id: "A", requiredTools: ["web_search"], successProbability: 0.8 })
    const bad = plan({ id: "B", requiredTools: ["code_runner"], successProbability: 0.8 })
    const result = evaluatePlans({ plans: [good, bad], availableTools: ["web_search", "code_runner"], userCredits: 100, feedback })
    const successGood = result.scores.find((s) => s.planId === "A")!.breakdown.find((b) => b.criterion === "successRate")!
    const successBad = result.scores.find((s) => s.planId === "B")!.breakdown.find((b) => b.criterion === "successRate")!
    expect(successBad.value).toBeLessThan(successGood.value)
  })

  test("sans feedback : comportement identique à la v3.0", () => {
    const plans = [plan({ id: "A", successProbability: 0.7 })]
    const without = evaluatePlans({ plans, availableTools: [], userCredits: 100, feedback: undefined })
    expect(without.scores[0].breakdown.find((b) => b.criterion === "successRate")!.value).toBeCloseTo(0.7, 3)
  })
})
