import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test"
import { mkdirSync } from "node:fs"

/**
 * v3.6 — Intelligence :
 *  1. RAG ajustable (poids sémantique/lexical par agent) ;
 *  2. re-ranker cross-encoder (fail-open sans LLM) ;
 *  3. méta-learning cross-agent (patrons anonymes, anti-fuite, dédup) ;
 *  4. débat amélioré (contre-arguments + vote pondéré, anti-auto-élection).
 */

// Base de test dédiée.
mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-intel.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`

import { ensureSchema } from "@/lib/db-init"
import { db } from "@/lib/db"
import { localEmbedForTest } from "./test-utils"
import { clampSemanticWeight, rerankEnabled, searchKnowledge } from "@/lib/rag/retriever"
import { rerankChunks } from "@/lib/rag/reranker"
import type { ScoredChunk } from "@/lib/rag/retriever"

const USER = "intel-user-test"

beforeAll(async () => {
  await ensureSchema()
  await db.user.create({
    data: { id: USER, email: "intel@test.local", passwordHash: "x" },
  }).catch(() => undefined)
})

// ------------------------------------------------------------------
// 1-2. RAG : poids ajustables + re-ranker
// ------------------------------------------------------------------

describe("RAG ajustable", () => {
  test("clampSemanticWeight borne [0, 1] avec défaut 0.6", () => {
    expect(clampSemanticWeight(undefined)).toBe(0.6)
    expect(clampSemanticWeight(0)).toBe(0)
    expect(clampSemanticWeight(1)).toBe(1)
    expect(clampSemanticWeight(-3)).toBe(0)
    expect(clampSemanticWeight(9)).toBe(1)
    expect(clampSemanticWeight(NaN)).toBe(0.6)
  })

  test("rerankEnabled : booléen, les surcharges explicites priment", () => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.OPENAI_API_KEY
    expect(typeof rerankEnabled({})).toBe("boolean")
    expect(rerankEnabled({ rerank: true })).toBe(true)
    expect(rerankEnabled({ rerank: false })).toBe(false)
  })

  test("searchKnowledge accepte les poids extrêmes sans erreur (0 et 1)", async () => {
    // Corpus de test : un document avec vecteur local indexé.
    const doc = await db.document.create({
      data: {
        userId: USER,
        title: "Mémoire technique du moteur électrique",
        content: "Le moteur électrique consomme 12 kW en pointe et exige un refroidissement continu.",
        chunks: JSON.stringify([{ text: "Le moteur électrique consomme 12 kW en pointe et exige un refroidissement continu." }]),
      },
    })
    const vec = localEmbedForTest("Le moteur électrique consomme 12 kW en pointe et exige un refroidissement continu.")
    // Le modèle doit correspondre à CELUI du fournisseur local courant
    // (searchVector filtre par userId + model).
    const { embedText } = await import("@/lib/rag/embeddings")
    const providerModel = (await embedText("sonde")).model
    await db.embedding.create({
      data: {
        userId: USER,
        documentId: doc.id,
        chunkIndex: 0,
        chunkText: "Le moteur électrique consomme 12 kW en pointe et exige un refroidissement continu.",
        embedding: JSON.stringify(vec.vector.map((x) => Math.round(x * 10000) / 10000)),
        dim: vec.vector.length,
        norm: vec.norm,
        model: providerModel,
      },
    })

    const lexical = await searchKnowledge(USER, "moteur électrique refroidissement", 2, { semanticWeight: 0, rerank: false })
    const semantic = await searchKnowledge(USER, "moteur électrique refroidissement", 2, { semanticWeight: 1, rerank: false })
    const hybrid = await searchKnowledge(USER, "moteur électrique refroidissement", 2, { semanticWeight: 0.6, rerank: false })

    expect(lexical.length).toBeGreaterThan(0)
    expect(semantic.length).toBeGreaterThan(0)
    expect(hybrid.length).toBeGreaterThan(0)
    // Sans LLM configuré, pas de re-rank : méthode hybride classique.
    expect(hybrid[0].method).toBe("hybrid")
    await db.document.delete({ where: { id: doc.id } }).catch(() => undefined)
  })
})

describe("Re-ranker cross-encoder", () => {
  const chunks: ScoredChunk[] = [
    { documentId: "d1", title: "Doc 1", text: "réponse directe à la question", score: 0.9, method: "hybrid" },
    { documentId: "d2", title: "Doc 2", text: "contexte vaguement lié", score: 0.7, method: "hybrid" },
    { documentId: "d3", title: "Doc 3", text: "hors sujet", score: 0.5, method: "hybrid" },
  ]

  test("fail-open sans LLM : ordre hybride conservé, topK respecté", async () => {
    const realStructured = await import("@/lib/ai/structured")
    mock.module("@/lib/ai/structured", () => ({
      ...realStructured,
      chatJSON: async () => {
        throw new Error("fournisseur LLM indisponible (simulation)")
      },
    }))
    const { rerankChunks: rerankMocked } = await import("@/lib/rag/reranker")
    const result = await rerankMocked("question", chunks, { topK: 2 })
    expect(result.length).toBe(2)
    expect(result[0].documentId).toBe("d1")
    expect(result[1].documentId).toBe("d2")
    mock.module("@/lib/ai/structured", () => realStructured)
  })

  test("re-rank réel (mock LLM) : l'ordre suit les scores jugés", async () => {
    const realStructured = await import("@/lib/ai/structured")
    mock.module("@/lib/ai/structured", () => ({
      ...realStructured,
      chatJSON: async () => ({
        data: { rankings: [
          { index: 0, score: 10 }, // Doc 1 jugé faible
          { index: 1, score: 95 }, // Doc 2 jugé excellent
          { index: 2, score: 50 },
        ] },
        tokensIn: 10, tokensOut: 10, raw: "{}", provider: "mock", model: "mock",
      }),
    }))
    // Réimport pour appliquer le mock.
    const { rerankChunks: rerankMocked } = await import("@/lib/rag/reranker")
    const result = await rerankMocked("question", chunks, { topK: 2 })
    expect(result[0].documentId).toBe("d2") // ré-ordonné selon le jugement
    expect(result[0].method).toBe("hybrid+rerank")
    mock.module("@/lib/ai/structured", () => realStructured)
  })
})

// ------------------------------------------------------------------
// 3. Méta-learning cross-agent
// ------------------------------------------------------------------

describe("Méta-learning cross-agent", () => {
  test("extraction LLM → patrons anonymes stockés, dédupliqués, comptés", async () => {
    const { recordCrossAgentPatterns, sharedFailureContext, metaLearningStats } = await import("@/lib/learning/meta-learning")
    const realStructured = await import("@/lib/ai/structured")
    let call = 0
    mock.module("@/lib/ai/structured", () => ({
      ...realStructured,
      chatJSON: async () => {
        call++
        return {
          data: {
            patterns: [
              { pattern: "Pour un objectif d'analyse chiffrée, privilégier l'outil calculator plutôt qu'une estimation LLM directe.", tags: ["tool:calculator"] },
              { pattern: "Contact: admin@corp.example — fuite intentionnelle pour tester le filtre.", tags: [] }, // doit être REJETÉ (email)
            ],
          },
          tokensIn: 5, tokensOut: 5, raw: "{}", provider: "mock", model: "mock",
        }
      },
    }))

    const input = {
      prompt: "Analyse le marché des panneaux solaires au Cameroun",
      analysis: { intent: "analyse de marché", goals: [], constraints: [], requiredCapabilities: [] } as never,
      plan: {
        id: "A" as const, name: "P", strategy: "directe", steps: [], requiredTools: ["calculator"],
        risks: [], estimatedCostCredits: 1, successProbability: 0.8, rationale: "x", requiresHumanConfirmation: false,
      },
      outcome: "SUCCESS" as const,
    }

    await db.crossAgentPattern.deleteMany({})
    const first = await recordCrossAgentPatterns({ userId: USER, input, plan: input.plan })
    expect(first.extracted).toBe(2)
    expect(first.stored).toBe(1) // le pattern avec email est rejeté
    expect(first.rejected).toBe(1)

    // Deuxième passage, même tâche : dédup (occurrences++), pas de doublon.
    const second = await recordCrossAgentPatterns({ userId: USER, input, plan: input.plan })
    expect(second.stored).toBe(1)
    const rows = await db.crossAgentPattern.findMany({})
    expect(rows.length).toBe(1)
    expect(rows[0].occurrences).toBe(2)
    expect(rows[0].distinctUsers).toBe(1) // même utilisateur

    // Le stockage n'expose JAMAIS l'email ni le prompt.
    expect(rows[0].pattern).not.toContain("@")
    expect(rows[0].pattern).not.toContain("Cameroon")
    void call

    // Un patron vu d'un SEUL utilisateur n'est pas partagé (bruit).
    expect(await sharedFailureContext()).toHaveLength(0)

    // Stats honnêtes.
    const stats = await metaLearningStats()
    expect(stats.patterns).toBe(1)
    expect(stats.maxDistinctUsers).toBe(1)
    mock.module("@/lib/ai/structured", () => realStructured)
  })

  test("partage à partir de 2 utilisateurs distincts (empreintes hachées)", async () => {
    const { recordCrossAgentPatterns, sharedFailureContext } = await import("@/lib/learning/meta-learning")
    const realStructured = await import("@/lib/ai/structured")
    mock.module("@/lib/ai/structured", () => ({
      ...realStructured,
      chatJSON: async () => ({
        data: { patterns: [{ pattern: "Pour un objectif d'analyse chiffrée, privilégier l'outil calculator plutôt qu'une estimation LLM directe.", tags: ["tool:calculator"] }] },
        tokensIn: 5, tokensOut: 5, raw: "{}", provider: "mock", model: "mock",
      }),
    }))

    const input = {
      prompt: "Autre formulation utilisateur totalement différente",
      analysis: { intent: "x", goals: [], constraints: [], requiredCapabilities: [] } as never,
      plan: {
        id: "A" as const, name: "P", strategy: "directe", steps: [], requiredTools: ["calculator"],
        risks: [], estimatedCostCredits: 1, successProbability: 0.8, rationale: "x", requiresHumanConfirmation: false,
      },
      outcome: "SUCCESS" as const,
    }

    // Un autre utilisateur rencontre le MÊME patron (même hash normalisé).
    const USER2 = "intel-user-test-2"
    await db.user.create({ data: { id: USER2, email: "intel2@test.local", passwordHash: "x" } }).catch(() => undefined)
    await recordCrossAgentPatterns({ userId: USER2, input, plan: input.plan })

    const shared = await sharedFailureContext()
    expect(shared.length).toBe(1)
    expect(shared[0].distinctUsers).toBe(2)

    // Les empreintes ne contiennent JAMAIS l'identifiant en clair.
    const row = await db.crossAgentPattern.findFirst({})
    const seenBy = JSON.parse(row!.seenBy ?? "[]") as string[]
    expect(seenBy.some((s) => s.includes(USER))).toBe(false)
    mock.module("@/lib/ai/structured", () => realStructured)
  })
})

// ------------------------------------------------------------------
// 4. Débat : contre-arguments + vote pondéré
// ------------------------------------------------------------------

describe("Débat amélioré", () => {
  afterAll(async () => {
    await db.swarmSession.deleteMany({}).catch(() => undefined)
    await db.$disconnect?.().catch(() => undefined)
  })

  test("phases complètes : propositions → contre-arguments → votes pondérés → arbitrage", async () => {
    const realStructured = await import("@/lib/ai/structured")
    let call = 0
    const proposalByCall = ["propagion pragmatique", "propagion visionnaire", "propagion critique"]

    mock.module("@/lib/ai/structured", () => ({
      ...realStructured,
      chatJSON: async (opts: { messages: { role: string; content: string }[]; taskType?: string }) => {
        call++
        const system = opts.messages[0]?.content ?? ""
        // Phase propositions.
        if (system.includes("Propose une solution structurée")) {
          return {
            data: { proposal: proposalByCall[(call - 1) % 3], arguments: ["argument A", "argument B"], confidence: 0.8 },
            tokensIn: 10, tokensOut: 10, raw: "{}", provider: "mock", model: "mock",
          }
        }
        // Phase vote (détectée EN PREMIER : le prompt de vote cite aussi
        // les contre-arguments reçus).
        if (system.includes("VOTES")) {
          const others = ["agent_pragmatic", "agent_visionary", "agent_critical"].filter(
            (id) => !system.includes(id)
          )
          return {
            data: { scores: others.map((id) => ({ targetAgentId: id, score: 7, justification: "correct" })) },
            tokensIn: 10, tokensOut: 10, raw: "{}", provider: "mock", model: "mock",
          }
        }
        // Phase contre-arguments (critère exclusif : le prompt de l'arbitre
        // mentionne aussi les contre-arguments, il ne doit PAS matcher ici).
        if (system.includes("Tu critiques maintenant")) {
          return {
            data: { counterArguments: ["angle mort sur le coût", "hypothèse fragile sur les délais", "cas limite non traité"] },
            tokensIn: 10, tokensOut: 10, raw: "{}", provider: "mock", model: "mock",
          }
        }
        // Phase arbitre.
        return {
          data: {
            refereeVerdict: "verdict",
            winningProposalAgentId: "agent_visionary",
            consensusScore: 0.7,
            synthesis: "synthèse",
          },
          tokensIn: 10, tokensOut: 10, raw: "{}", provider: "mock", model: "mock",
        }
      },
    }))

    const { DebateOrchestrator } = await import("@/lib/engines/debate")
    const orchestrator = new DebateOrchestrator()
    const { result, tokensIn, tokensOut } = await orchestrator.runDebate(USER, "sujet de débat de test")

    expect(tokensIn).toBeGreaterThan(0)
    expect(tokensOut).toBeGreaterThan(0)

    // Phase 1 : trois propositions.
    expect(result.proposals).toHaveLength(3)

    // Phase 2 : contre-arguments croisés (chaque concurrent critique les autres).
    expect(result.rebuttals.length).toBeGreaterThanOrEqual(6) // 3 participants × 2 cibles
    const targets = new Set(result.rebuttals.map((r) => r.targetAgentId))
    expect(targets.size).toBe(3)
    for (const r of result.rebuttals) {
      expect(r.agentId).not.toBe(r.targetAgentId) // jamais d'auto-critique
      expect(r.counterArguments.length).toBeGreaterThan(0)
    }

    // Phase 3 : votes pondérés sans auto-élection.
    expect(result.votes.length).toBe(6) // 3 votants × 2 cibles
    for (const v of result.votes) {
      expect(v.voterAgentId).not.toBe(v.targetAgentId)
      expect(v.score).toBeGreaterThanOrEqual(0)
      expect(v.score).toBeLessThanOrEqual(10)
      expect(v.weight).toBeGreaterThan(0)
    }
    // Tally : chaque proposition reçoit le total pondéré des 2 votes reçus.
    for (const p of result.proposals) {
      const received = result.votes.filter((v) => v.targetAgentId === p.agentId)
      const expected = received.reduce((acc, v) => acc + v.score * v.weight, 0)
      expect(result.voteTally[p.agentId]).toBeCloseTo(Math.round(expected * 100) / 100, 1)
    }

    // Phase 4 : arbitrage complet.
    expect(result.refereeVerdict).toBe("verdict")
    expect(result.synthesis).toBe("synthèse")
    expect(result.winningProposalAgentId).toBe("agent_visionary")

    mock.module("@/lib/ai/structured", () => realStructured)
  })
})
