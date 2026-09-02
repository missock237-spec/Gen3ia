import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test"

/**
 * Test d'intégration du pipeline d'orchestration COMPLET.
 *
 * La couche LLM (chat / chatJSON) est remplacée par des réponses
 * déterministes valides — c'est de l'INFRASTRUCTURE DE TEST (pas de mock
 * en production) : l'objectif est de vérifier l'enchaînement réel des
 * moteurs, la persistance des checkpoints, la télémétrie EngineRun, le
 * Credit Ledger et l'apprentissage, sans dépendre d'une clé API.
 *
 * Base dédiée : db/test.db (créée par ensureSchema).
 */

// Base dédiée (chemin portable, résolu relativement à ce fichier — CI inclus).
const TEST_DB_PATH = new URL("../../db/test.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
process.env.PLAN_CACHE = "on"

// ---------- Couche LLM simulée (réponses valides et déterministes) ----------

const ANALYSIS_DATA = {
  intent: "Réaliser une analyse de marché solaire et formuler des recommandations",
  goals: ["analyser le marché", "proposer des recommandations"],
  constraints: ["réponse en français"],
  requiredCapabilities: [],
  risks: [],
  successCriteria: ["la réponse est claire et étayée"],
  failureCriteria: ["réponse vide"],
  estimatedComplexity: "MEDIUM",
  estimatedSteps: 2,
  language: "fr",
  clarificationNeeded: false,
}

const PLANS_DATA = {
  plans: (["A", "B", "C", "D", "E"] as const).map((id) => ({
    id,
    name: `Plan ${id} de test`,
    strategy: `Stratégie ${id} — approche contrastée pour couvrir l'espace de solutions`,
    steps: [
      { title: "Étape 1 : collecte", detail: " Rassembler les informations nécessaires à l'analyse." },
      { title: "Étape 2 : synthèse", detail: "Consolider les résultats en recommandations concrètes." },
    ],
    requiredTools: [],
    risks: ["risque mineur"],
    estimatedCostCredits: 2,
    successProbability: 0.8,
    rationale: "rationale de test suffisamment long",
    requiresHumanConfirmation: false,
  })),
}

const VERIFICATION_DATA = {
  verified: true,
  confidence: 0.9,
  criteria: [
    { criterion: "la réponse est claire et étayée", met: true, evidence: "La réponse finale expose le raisonnement complet." },
  ],
  gaps: [],
  verdict: "Les critères de succès sont remplis, preuves à l'appui.",
}

const LEARNING_DATA = {
  lessons: ["Une demande d'analyse de marché se traite efficacement en deux étapes : collecte puis synthèse."],
  userPreferences: ["L'utilisateur préfère une réponse structurée en français."],
  reusablePatterns: ["Répondre directement puis vérifier les critères de succès."],
}

let chatCalls = 0
let chatJSONCalls = 0

// v3.2 — le mock doit PRÉSERVER les exports réels du module remplacé :
// self-correction.ts importe StructuredOutputError depuis ce même module.
// Bun ≥ 1.4 valide les exports nommés à l'import → un mock partiel
// (chatJSON seul) provoquait un SyntaxError en CI.
const realStructured = await import("@/lib/ai/structured")

mock.module("@/lib/ai/structured", () => ({
  ...realStructured,
  chatJSON: async (opts: { taskType?: string }) => {
    chatJSONCalls++
    const taskType = opts.taskType ?? "CHAT"
    const data =
      taskType === "ANALYSIS" ? ANALYSIS_DATA
      : taskType === "PLANNING" ? PLANS_DATA
      : taskType === "VERIFICATION" ? VERIFICATION_DATA
      : taskType === "LEARNING" ? LEARNING_DATA
      : { action: "FINISH_STEP", reasoning: "L'étape est complétée avec les éléments requis.", output: "Résultat de l'étape : analyse effectuée et documentée." }
    return {
      data,
      raw: JSON.stringify(data),
      tokensIn: 100,
      tokensOut: 200,
      provider: "zai",
      model: "glm-4.6",
      repairUsed: false,
    }
  },
}))

// Même précaution que ci-dessus : préserve les exports réels (router, types).
const realAi = await import("@/lib/ai")

mock.module("@/lib/ai", () => ({
  ...realAi,
  chat: async () => {
    chatCalls++
    return {
      content:
        "Réponse finale de synthèse : la demande a été traitée et vérifiée. " +
        "Le marché est en croissance, voici trois recommandations concrètes et sourcées.",
      tokensIn: 150,
      tokensOut: 300,
      provider: "zai",
      model: "glm-4.6",
    }
  },
}))

// ---------- Imports APRÈS les mocks (dynamic pour respecter l'ordre) ----------

const { advanceTask } = await import("@/lib/engines/orchestrator")
const { db } = await import("@/lib/db")
const { ensureSchema } = await import("@/lib/db-init")

describe("pipeline d'orchestration — intégration complète", () => {
  let userId: string
  let taskId: string

  beforeAll(async () => {
    await ensureSchema()
    chatCalls = 0
    chatJSONCalls = 0
  })

  test("une tâche traverse tout le pipeline jusqu'à COMPLETED", async () => {
    const user = await db.user.create({
      data: {
        email: `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@gen3ia.test`,
        name: "Test Pipeline",
        passwordHash: "test-hash",
        credits: 50,
      },
    })
    userId = user.id

    const task = await db.task.create({
      data: {
        userId: user.id,
        prompt: "Analyse le marché des panneaux solaires en Afrique de l'Ouest et propose 3 recommandations.",
      },
    })
    taskId = task.id

    // Le pipeline avance par appels successifs (comme les sondages HTTP).
    let current = task
    for (let round = 0; round < 12; round++) {
      if (["COMPLETED", "FAILED", "CANCELLED", "WAITING_FOR_HUMAN", "WAITING_PLAN_APPROVAL"].includes(current.status)) break
      current = (await advanceTask(current.id)) ?? current
    }

    expect(current.status).toBe("COMPLETED")
    expect(current.error).toBeNull()
    expect(current.selectedPlanId).toBeTruthy()

    // Livrable assemblé.
    const result = JSON.parse(current.result ?? "{}")
    expect(result.answer).toContain("synthèse")
    expect(result.plan).toBeTruthy()
    expect(result.metrics.attempts).toBeGreaterThanOrEqual(1)
    expect(result.metrics.totalRetries).toBeGreaterThanOrEqual(0)

    // Les 5 phases du pipeline ont laissé leurs étapes.
    const steps = await db.taskStep.findMany({ where: { taskId } })
    const phases = new Set(steps.map((s) => s.phase))
    expect(phases.has("ANALYZING")).toBe(true)
    expect(phases.has("PLANNING")).toBe(true)
    expect(phases.has("SIMULATING")).toBe(true)
    expect(phases.has("EXECUTING")).toBe(true)
    expect(phases.has("VERIFYING")).toBe(true)
    expect(phases.has("LEARNING")).toBe(true)

    // Étapes d'exécution réelles avec latence mesurée (v3.1 : plus jamais 0).
    const execSteps = steps.filter((s) => s.phase === "EXECUTING" && s.status === "DONE")
    expect(execSteps.length).toBeGreaterThanOrEqual(2)

    // Télémétrie EngineRun : chaque moteur a enregistré son exécution.
    const runs = await db.engineRun.findMany({ where: { taskId } })
    const engineNames = new Set(runs.map((r) => r.engine))
    expect(engineNames.has("PROMPT_ANALYSIS")).toBe(true)
    expect(engineNames.has("PLANNER")).toBe(true)
    expect(engineNames.has("EVALUATOR")).toBe(true)
    expect(engineNames.has("ETHICS")).toBe(true)
    expect(engineNames.has("EXECUTOR")).toBe(true)
    expect(engineNames.has("VERIFICATION")).toBe(true)
    expect(engineNames.has("LEARNING")).toBe(true)
    expect(engineNames.has("ORCHESTRATOR")).toBe(true)
    expect(runs.every((r) => r.ok)).toBe(true)

    // Vérification persistée avec critères.
    const verification = JSON.parse(current.verification ?? "{}")
    expect(verification.verified).toBe(true)

    // Learning persisté (shape complet pour l'UI).
    const learning = JSON.parse(current.learning ?? "{}")
    expect(learning.lessons.length).toBeGreaterThan(0)
    expect(learning.reusablePatterns.length).toBeGreaterThan(0)

    // Mémoire 5 couches : leçon + préférence + patron (PATTERN v3.1).
    const memories = await db.memory.findMany({ where: { userId } })
    expect(memories.length).toBeGreaterThanOrEqual(3)
    expect(memories.some((m) => m.layer === "USER")).toBe(true)

    // Credit Ledger : chaque phase facturée via transactions.
    const ledger = await db.transaction.findMany({ where: { userId, refId: taskId } })
    expect(ledger.length).toBeGreaterThanOrEqual(3)
    expect(current.costCredits).toBeGreaterThan(0)
    expect(current.tokensIn + current.tokensOut).toBeGreaterThan(0)

    // Verrouillage optimiste : version incrémentée par les fusions JSON.
    const fresh = await db.task.findUniqueOrThrow({ where: { id: taskId } })
    expect(fresh.version).toBeGreaterThanOrEqual(6)

    // Plan cache : les 5 plans générés sont mis en cache (v3.1).
    const cache = await db.planCache.findMany({ where: { userId } })
    expect(cache.length).toBeGreaterThanOrEqual(1)
    expect(JSON.parse(cache[0].plans).length).toBe(5)

    // Couche LLM effectivement sollicitée à chaque phase.
    expect(chatJSONCalls).toBeGreaterThanOrEqual(5) // analysis + 5 plans + étapes + vérif + learning
    expect(chatCalls).toBeGreaterThanOrEqual(1) // synthèse finale
  }, 120_000)

  afterAll(async () => {
    // Nettoyage : la tâche cascade ses artefacts ; le reste est explicite.
    if (taskId) {
      await db.engineRun.deleteMany({ where: { taskId } }).catch(() => undefined)
      await db.task.deleteMany({ where: { id: taskId } }).catch(() => undefined)
    }
    if (userId) {
      await db.planCache.deleteMany({ where: { userId } }).catch(() => undefined)
      await db.memory.deleteMany({ where: { userId } }).catch(() => undefined)
      await db.transaction.deleteMany({ where: { userId } }).catch(() => undefined)
      await db.session.deleteMany({ where: { userId } }).catch(() => undefined)
      await db.user.deleteMany({ where: { id: userId } }).catch(() => undefined)
    }
  })
})
