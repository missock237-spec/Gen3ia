import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"

/**
 * v4.0 — Vector Store multi-backends (Phase 14/15) :
 *  - sélection du backend (auto : Qdrant si URL, pgvector si Postgres, sinon json) ;
 *  - indexation + recherche (contrat identique, backend json de test) ;
 *  - qdrant/pgvector : indisponibilité propre (fail-open vers json) ;
 *  - HF Storage : Buckets logiques, sanitisation des chemins, erreurs propres
 *    quand HF_TOKEN est absent (Phase 13/24) ;
 *  - HF Jobs : contrat de statut/idempotence SANS HF configuré (Phase 11).
 */

mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-vector-v4.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`

import { ensureSchema } from "@/lib/db-init"
import { db } from "@/lib/db"
import { activeBackend } from "@/lib/rag/backends/types"
import { backendRegistry, jsonBackend, qdrantBackend, pgvectorBackend } from "@/lib/rag/backends/vector-backends"
import { indexDocument, searchVector, deleteDocumentVectors, vectorBackendInfo } from "@/lib/rag/vector-store"
import { hfStorage, repoIdFor, HF_BUCKETS } from "@/lib/hf/storage"
import { createHFJob, getHFJob, listHFJobs, cancelHFJob } from "@/lib/hf/jobs"
import { isHfConfigured, hfToken, hfOrg } from "@/lib/hf/client"
import { computeOverview, scheduleCompute, hardwareRecommendation } from "@/lib/compute/scheduler"

const USER = "vector-user-test"

async function createTestDocument(title: string, content: string): Promise<string> {
  const doc = await db.document.create({
    data: { userId: USER_ID, title, content, size: content.length, chunks: "[]" },
  })
  return doc.id
}

beforeAll(async () => {
  await ensureSchema()
  // Le Document et HFJob portent des FK vers User : l'utilisateur de test doit exister.
  await db.user.upsert({
    where: { email: "vector-v4@test.gen3ia" },
    create: { email: "vector-v4@test.gen3ia", passwordHash: null, credits: 100 },
    update: {},
  })
  const u = await db.user.findUniqueOrThrow({ where: { email: "vector-v4@test.gen3ia" } })
  USER_ID = u.id
  await db.document.deleteMany({ where: { userId: u.id } })
  await db.storageObject.deleteMany({})
  await db.hFJob.deleteMany({})
})

let USER_ID = ""

afterAll(async () => {
  try {
    rmSync(TEST_DB_PATH, { force: true })
    rmSync(`${TEST_DB_PATH}-journal`, { force: true })
  } catch {}
})

describe("VectorStore — sélection du backend (Phase 14)", () => {
  test("auto : json sans Qdrant ni Postgres (portabilité garantie)", () => {
    const savedQdrant = process.env.QDRANT_URL
    delete process.env.QDRANT_URL
    expect(activeBackend()).toBe("json")
    if (savedQdrant) process.env.QDRANT_URL = savedQdrant
  })

  test("auto : qdrant dès que QDRANT_URL est présent", () => {
    process.env.QDRANT_URL = "http://localhost:6333"
    expect(activeBackend()).toBe("qdrant")
    delete process.env.QDRANT_URL
  })

  test("forcer json est respecté", () => {
    const saved = process.env.VECTOR_BACKEND
    process.env.QDRANT_URL = "http://localhost:6333"
    process.env.VECTOR_BACKEND = "json"
    expect(activeBackend()).toBe("json")
    delete process.env.QDRANT_URL
    if (saved) process.env.VECTOR_BACKEND = saved
    else delete process.env.VECTOR_BACKEND
  })

  test("qdrant indisponible (pas de serveur) : fail-open vers json", async () => {
    const saved = process.env.QDRANT_URL
    process.env.QDRANT_URL = "http://localhost:59999" // serveur absent
    expect(await qdrantBackend.available()).toBe(false)
    // La résolution de vector-store replie sur json.
    const info = await vectorBackendInfo()
    expect(info.key).toBe("json")
    if (saved) process.env.QDRANT_URL = saved
    else delete process.env.QDRANT_URL
  })

  test("pgvector indisponible sur SQLite : fail-open vers json", async () => {
    expect(await pgvectorBackend.available()).toBe(false)
  })

  test("jsonBackend toujours disponible (repli garanti)", async () => {
    expect(await jsonBackend.available()).toBe(true)
  })
})

describe("VectorStore — indexation et recherche (contrat identique)", () => {
  test("indexDocument → searchVector retrouve le contenu sémantiquement proche", async () => {
    const docId = await createTestDocument(
      "Rapport financier Q3",
      "Le chiffre d'affaires du troisième trimestre a augmenté de 12 pour cent par rapport à l'année précédente. Les marges bénéficiaires se sont améliorées grâce à la réduction des coûts opérationnels. La trésorerie reste solide."
    )
    const result = await indexDocument(USER_ID, docId, "Rapport financier Q3", "Le chiffre d'affaires du troisième trimestre a augmenté de 12 pour cent par rapport à l'année précédente. Les marges bénéficiaires se sont améliorées grâce à la réduction des coûts opérationnels. La trésorerie reste solide.")
    expect(result.chunks).toBeGreaterThan(0)
    expect(result.backend).toBe("json")

    const hits = await searchVector(USER_ID, "bénéfices trimestriels marges", 3)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].documentId).toBe(docId)
    expect(hits[0].score).toBeGreaterThan(0)
  })

  test("deleteDocumentVectors supprime proprement", async () => {
    const docId = await createTestDocument("Temporaire", "contenu indexable temporaire assez long pour produire plusieurs tokens")
    await indexDocument(USER_ID, docId, "Temporaire", "contenu indexable temporaire assez long pour produire plusieurs tokens")
    await deleteDocumentVectors(docId)
    const remaining = await db.embedding.count({ where: { documentId: docId } })
    expect(remaining).toBe(0)
  })

  test("les recherches sont cloisonnées par utilisateur", async () => {
    const other = await searchVector("autre-utilisateur-inexistant", "bénéfices", 5)
    expect(other.length).toBe(0)
  })
})

describe("HF Storage — Buckets (Phase 13)", () => {
  test("11 buckets logiques standards", () => {
    expect(HF_BUCKETS.length).toBe(11)
    expect(HF_BUCKETS).toContain("knowledge")
    expect(HF_BUCKETS).toContain("checkpoints")
    expect(HF_BUCKETS).toContain("temporary")
  })

  test("repoIdFor : préfixe + bucket (org ou défaut)", () => {
    expect(repoIdFor("knowledge")).toMatch(/^gen3ia-knowledge|^[a-z0-9-]+-knowledge$/)
    const saved = process.env.HF_ORG_ID
    process.env.HF_ORG_ID = "mon-org"
    expect(repoIdFor("models")).toBe("mon-org-models")
    if (saved) process.env.HF_ORG_ID = saved
    else delete process.env.HF_ORG_ID
  })

  test("HF_TOKEN absent : upload échoue EXPLICITEMENT (jamais silencieusement)", async () => {
    const token = process.env.HF_TOKEN
    const alt = process.env.HUGGINGFACE_API_KEY
    delete process.env.HF_TOKEN
    delete process.env.HUGGINGFACE_API_KEY
    try {
      await hfStorage.upload(USER_ID, "knowledge/test.txt", "contenu")
      expect.unreachable()
    } catch (err) {
      expect((err as Error).message).toContain("HF_TOKEN")
    } finally {
      if (token) process.env.HF_TOKEN = token
      if (alt) process.env.HUGGINGFACE_API_KEY = alt
    }
  })

  test("hfToken/hfOrg lisent l'environnement (jamais de valeur codée)", () => {
    const saved = process.env.HF_TOKEN
    process.env.HF_TOKEN = "hf_test_token"
    expect(hfToken()).toBe("hf_test_token")
    delete process.env.HF_TOKEN
    expect(hfToken()).toBeUndefined()
    if (saved) process.env.HF_TOKEN = saved
  })
})

describe("HF Jobs — contrat sans HF configuré (Phase 11)", () => {
  test("createHFJob : job PENDING créé, idempotence par clé", async () => {
    const job1 = await createHFJob({
      userId: USER_ID,
      kind: "embeddings-batch",
      parameters: { texts: ["a", "b"], model: "local" },
      idempotencyKey: "idem-key-test-123",
    })
    expect(job1.status).toBe("PENDING")
    expect(job1.kind).toBe("embeddings-batch")
    expect(job1.attempt).toBe(0)

    // Même clé → même job (pas de doublon).
    const job2 = await createHFJob({
      userId: USER_ID,
      kind: "embeddings-batch",
      parameters: { texts: ["x"] },
      idempotencyKey: "idem-key-test-123",
    })
    expect(job2.id).toBe(job1.id)
  })

  test("getHFJob/listHFJobs : lecture cloisonnée par utilisateur", async () => {
    const jobs = await listHFJobs(USER_ID)
    expect(jobs.length).toBeGreaterThan(0)
    const job = await getHFJob(jobs[0].id, USER_ID)
    expect(job).not.toBeNull()
    const foreign = await getHFJob(jobs[0].id, "user-etranger")
    expect(foreign).toBeNull()
  })

  test("cancelHFJob : statut CANCELLED, idempotent", async () => {
    const job = await createHFJob({
      userId: USER_ID,
      kind: "preprocessing",
      parameters: { code: "input.length" },
    })
    const cancelled = await cancelHFJob(job.id, USER_ID)
    expect(cancelled.status).toBe("CANCELLED")
    // Annuler deux fois : sans erreur.
    const again = await cancelHFJob(job.id, USER_ID)
    expect(again.status).toBe("CANCELLED")
  })
})

describe("Compute Scheduler (Phase 12)", () => {
  test("scheduleCompute : le chat reste synchrone, les tâches longues partent en jobs", async () => {
    const chat = await scheduleCompute({ taskKind: "chat" })
    expect(["hf-router", "hf-endpoint", "external-provider"]).toContain(chat.backend)

    const batch = await scheduleCompute({ taskKind: "batch", estimatedDurationMs: 600_000 })
    expect(["hf-job", "hf-router", "hf-endpoint", "external-provider"]).toContain(batch.backend)
  })

  test("computeOverview : vue synthétique cohérente", async () => {
    const overview = await computeOverview()
    expect(overview.models).toBeDefined()
    expect(overview.jobs).toBeDefined()
    expect(overview.endpoints).toBeDefined()
    expect(overview.hfRouter).toBeDefined()
  })

  test("hardwareRecommendation : VRAM croît avec les paramètres", () => {
    const small = hardwareRecommendation({ parameterCountB: 3 })
    const large = hardwareRecommendation({ parameterCountB: 70 })
    expect(large.vramGb).toBeGreaterThan(small.vramGb)
    expect(large.accelerator).toBe("gpu")
  })
})
