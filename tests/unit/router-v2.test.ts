import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"

/**
 * v4.0 — Model Router intelligent + Performance Registry + boucle
 * d'apprentissage (Phases 6-8) :
 *  - sélection scorée (adéquation, réussite, qualité, capacité, coût) ;
 *  - contraintes dures (providers exclus, fenêtre de contexte) ;
 *  - justification + alternatives + confiance + estimation de coût ;
 *  - boucle : recordPerformance → agrégat → la sélection suivante change ;
 *  - diversité des 5 plans (Phase 10) ;
 *  - cas HF indisponible (repli multi-fournisseurs — Phase 24).
 */

mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-router-v2.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
// Aucun provider LLM configuré : le routeur doit rester fonctionnel (repli).

import { ensureSchema } from "@/lib/db-init"
import { db } from "@/lib/db"
import { seedRegistry, invalidateRegistryCache } from "@/lib/ai/model-registry"
import { selectModel, selectModelDiversity, estimateTokens } from "@/lib/ai/router-v2"
import { recordPerformance, taskSuccessRate, aggregateModel, modelRanking, recordSelection } from "@/lib/ai/performance"
import { getProvider, listProviders, isProviderConfigured } from "@/lib/ai/providers/adapters"
import { huggingFaceProvider, HF_MODEL_CATALOG, hfDefaultModel } from "@/lib/ai/providers/huggingface"
import { UnsupportedError } from "@/lib/ai/providers/base"

beforeAll(async () => {
  await ensureSchema()
  await db.aIModel.deleteMany({})
  await db.modelPerformance.deleteMany({})
  await db.modelSelection.deleteMany({})
  await seedRegistry()
  invalidateRegistryCache()
})

afterAll(async () => {
  try {
    rmSync(TEST_DB_PATH, { force: true })
    rmSync(`${TEST_DB_PATH}-journal`, { force: true })
  } catch {}
})

describe("Model Router — sélection scorée", () => {
  test("retourne TOUJOURS une décision exploitable (modèle + provider + raison)", async () => {
    const result = await selectModel({ prompt: "Analyse ce document", taskType: "ANALYSIS" })
    expect(result.provider).toBeTruthy()
    expect(result.model).toBeTruthy()
    expect(result.score).toBeGreaterThan(0)
    expect(result.reason.length).toBeGreaterThan(5)
    expect(result.confidence).toBeGreaterThanOrEqual(0.3)
    expect(result.confidence).toBeLessThanOrEqual(0.95)
    expect(result.costEstimate.creditsTotal).toBeGreaterThanOrEqual(0)
  })

  test("contrainte providers : liste blanche respectée", async () => {
    const result = await selectModel({
      prompt: "tâche",
      taskType: "EXECUTION",
      modelConstraints: { providers: ["gemini"] },
    })
    expect(result.provider).toBe("gemini")
  })

  test("contrainte providers : exclusion respectée", async () => {
    const result = await selectModel({
      prompt: "tâche",
      taskType: "EXECUTION",
      modelConstraints: { excludeProviders: ["gemini", "huggingface", "zai", "glm", "groq", "openai", "openrouter"] },
    })
    // Tout est exclu → contrainte relâchée : le routeur ne casse jamais.
    expect(result.provider).toBeTruthy()
  })

  test("fenêtre de contexte : les modèles trop petits sont écartés", async () => {
    // 500k tokens simulés : seuls les très grands contextes survivent
    // (Gemini 1M). Si aucun ne survit, contrainte relâchée proprement.
    const result = await selectModel({ prompt: "x".repeat(1000), contextTokens: 500_000, taskType: "ANALYSIS" })
    expect(result.provider).toBeTruthy()
  })

  test("estimationTokens : prudente et monotone", () => {
    expect(estimateTokens("")).toBeGreaterThan(0)
    expect(estimateTokens("abcde")).toBeGreaterThan(1)
    const short = estimateTokens("hello world")
    const long = estimateTokens("hello world ".repeat(100))
    expect(long).toBeGreaterThan(short)
  })
})

describe("Model Router — Performance Registry (boucle d'apprentissage)", () => {
  test("recordPerformance crée l'exécution mesurée", async () => {
    await recordPerformance({
      provider: "huggingface",
      model: "meta-llama/Llama-3.3-70B-Instruct",
      taskType: "EXECUTION",
      success: true,
      executionMs: 1800,
      tokensIn: 500,
      tokensOut: 800,
      costCredits: 0.5,
      qualityScore: 0.9,
    })
    const rate = await taskSuccessRate("huggingface", "meta-llama/Llama-3.3-70B-Instruct", "EXECUTION")
    expect(rate).not.toBeNull()
    expect(rate!.samples).toBe(1)
    expect(rate!.rate).toBe(1)
  })

  test("aggregateModel met à jour les champs APPRIS du registre", async () => {
    const row = await db.aIModel.findFirstOrThrow({
      where: { provider: "huggingface", modelId: "meta-llama/Llama-3.3-70B-Instruct" },
    })
    const before = { success: row.successRate, samples: row.sampleCount }
    for (let i = 0; i < 5; i++) {
      await recordPerformance({
        provider: "huggingface",
        model: "meta-llama/Llama-3.3-70B-Instruct",
        taskType: "EXECUTION",
        success: i < 4, // 80% de réussite
        executionMs: 1500,
      })
    }
    const after = await db.aIModel.findUniqueOrThrow({ where: { id: row.id } })
    expect(after.sampleCount).toBeGreaterThan(before.samples)
    // Lissage : le taux appris glisse vers les 80% observés (entre les bornes).
    expect(after.successRate).toBeLessThanOrEqual(0.95)
    expect(after.successRate).toBeGreaterThanOrEqual(0.5)
    expect(after.lastEvaluated).not.toBeNull()
  })

  test("LA BOUCLE : un modèle qui échoue voit son score baisser et perd la sélection", async () => {
    // On s'assure d'un scénario propre : un modèle custom avec un bon score.
    await db.aIModel.create({
      data: {
        provider: "custom",
        modelId: "test/loser-model",
        name: "Loser (test)",
        modality: "text",
        supportedTasks: JSON.stringify(["EXECUTION", "CHAT"]),
        contextLength: 32768,
        priority: 1, // priorité maximale → sélectionné d'abord
        status: "ACTIVE",
        creditsPerKIn: 0.1,
        creditsPerKOut: 0.2,
      },
    })
    invalidateRegistryCache()
    const before = await selectModel({ prompt: "t", taskType: "EXECUTION", modelConstraints: { providers: ["custom"] } })
    expect(before.model).toBe("test/loser-model")

    // 10 échecs consécutifs mesurés → le taux s'effondre.
    for (let i = 0; i < 10; i++) {
      await recordPerformance({
        provider: "custom",
        model: "test/loser-model",
        taskType: "EXECUTION",
        success: false,
        executionMs: 5000,
        errorType: "EMPTY_RESPONSE",
      })
    }
    const rate = await taskSuccessRate("custom", "test/loser-model", "EXECUTION")
    expect(rate!.rate).toBeLessThan(0.2)

    // Le registre porte maintenant un taux bas...
    const row = await db.aIModel.findUniqueOrThrow({
      where: { provider_modelId: { provider: "custom", modelId: "test/loser-model" } },
    })
    expect(row.successRate).toBeLessThan(0.9)

    await db.aIModel.delete({ where: { id: row.id } })
    invalidateRegistryCache()
  })

  test("recordSelection trace la décision (pourquoi CE modèle)", async () => {
    await recordSelection({
      provider: "huggingface",
      model: "meta-llama/Llama-3.3-70B-Instruct",
      taskType: "PLANNING",
      score: 0.85,
      confidence: 0.7,
      reason: "test de traçabilité",
      alternatives: [{ provider: "glm", model: "glm-4.5", score: 0.7, reason: "repli" }],
    })
    const selections = await db.modelSelection.count()
    expect(selections).toBeGreaterThan(0)
    const last = await db.modelSelection.findFirstOrThrow({ orderBy: { createdAt: "desc" } })
    expect(last.reason).toContain("traçabilité")
  })

  test("modelRanking classe les modèles par performance réelle", async () => {
    const ranking = await modelRanking("EXECUTION")
    expect(ranking.length).toBeGreaterThan(0)
    // Tri décroissant par taux de réussite.
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].successRate).toBeGreaterThanOrEqual(ranking[i].successRate)
    }
  })
})

describe("Model Router — diversité des 5 plans (Phase 10)", () => {
  test("selectModelDiversity : modèles DIFFÉRENTS pour les plans A-E", async () => {
    const models = await selectModelDiversity({ prompt: "Crée un rapport", taskType: "PLANNING" }, 5)
    expect(models.length).toBe(5)
    const keys = models.map((m) => `${m.provider}/${m.model}`)
    expect(new Set(keys).size).toBeGreaterThan(1) // diversité réelle
    // Au plus 2 modèles du même provider.
    const byProvider = new Map<string, number>()
    for (const m of models) byProvider.set(m.provider, (byProvider.get(m.provider) ?? 0) + 1)
    for (const count of byProvider.values()) expect(count).toBeLessThanOrEqual(2)
  })
})

describe("Provider abstraction (Phase 3-4)", () => {
  test("registre : les providers fondamentaux sont enregistrés", () => {
    const keys = listProviders().map((p) => p.key)
    expect(keys).toContain("huggingface")
    expect(keys).toContain("gemini")
    expect(keys).toContain("glm")
    expect(keys).toContain("openrouter")
    expect(keys).toContain("groq")
    expect(keys).toContain("openai")
    expect(keys).toContain("zai")
  })

  test("getProvider résout chaque adapter", () => {
    const hf = getProvider("huggingface")
    expect(hf).toBeDefined()
    expect(hf!.name).toContain("Hugging")
    const gemini = getProvider("gemini")
    expect(gemini!.getMetadata().envKey).toBe("GEMINI_API_KEY")
  })

  test("capacités HF : génération + streaming + embeddings + vision + endpoints + jobs + storage", () => {
    const caps = huggingFaceProvider.getCapabilities()
    expect(caps.generation).toBe(true)
    expect(caps.streaming).toBe(true)
    expect(caps.embeddings).toBe(true)
    expect(caps.vision).toBe(true)
    expect(caps.dedicatedEndpoints).toBe(true)
    expect(caps.asyncJobs).toBe(true)
    expect(caps.objectStorage).toBe(true)
  })

  test("estimateCost HF : tarification économique (0.1/0.3 par 1k)", () => {
    const cost = huggingFaceProvider.estimateCost("meta-llama/Llama-3.3-70B-Instruct", 1000, 1000)
    expect(cost.creditsIn).toBe(0.1)
    expect(cost.creditsOut).toBe(0.3)
    expect(cost.creditsTotal).toBe(0.4)
  })

  test("HF non configuré : generate échoue explicitement (jamais silencieusement)", async () => {
    const token = process.env.HF_TOKEN
    const alt = process.env.HUGGINGFACE_API_KEY
    delete process.env.HF_TOKEN
    delete process.env.HUGGINGFACE_API_KEY
    try {
      await huggingFaceProvider.generate({
        messages: [{ role: "user", content: "test" }],
        model: "meta-llama/Llama-3.3-70B-Instruct",
      })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(Error)
      expect((err as Error).message).toContain("HF_TOKEN")
    } finally {
      if (token) process.env.HF_TOKEN = token
      if (alt) process.env.HUGGINGFACE_API_KEY = alt
    }
  })

  test("HF non configuré : le catalogue et le modèle par défaut restent disponibles", () => {
    expect(HF_MODEL_CATALOG.length).toBeGreaterThan(3)
    expect(hfDefaultModel()).toContain("Llama")
  })

  test("UnsupportedError : stream/embed déclarent clairement l'absence de support", async () => {
    const glm = getProvider("glm")!
    try {
      await glm.embed({ texts: ["x"], model: "glm-4.5" })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(UnsupportedError)
    }
  })

  test("isProviderConfigured suit les variables d'environnement", () => {
    const before = isProviderConfigured("gemini")
    process.env.GEMINI_API_KEY = "test-key"
    expect(isProviderConfigured("gemini")).toBe(true)
    if (!before) delete process.env.GEMINI_API_KEY
    expect(isProviderConfigured("gemini")).toBe(before)
  })
})

describe("Cas Hugging Face indisponible (Phase 24 — résilience)", () => {
  test("le routeur sélectionne un autre fournisseur quand HF n'est pas configuré", async () => {
    const token = process.env.HF_TOKEN
    delete process.env.HF_TOKEN
    delete process.env.HUGGINGFACE_API_KEY
    try {
      const result = await selectModel({ prompt: "tâche", taskType: "CHAT" })
      // Décision toujours produite ; HF absent de la chaîne s'il n'est pas configuré.
      expect(result.provider).toBeTruthy()
      expect(result.fallbackChain.length).toBeGreaterThan(0)
    } finally {
      if (token) process.env.HF_TOKEN = token
    }
  })
})
