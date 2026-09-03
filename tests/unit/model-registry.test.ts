import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"

/**
 * v4.0 — Model Registry : amorçage, lecture, filtres, auto-seed paresseux,
 * évolution sans modification du code (synchronisation HF simulée hors-ligne).
 * Base dédiée db/test-registry.db (ensureSchema) — aucun réseau requis.
 */

mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-registry.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
// Aucun provider LLM nécessaire : le registre est une donnée, pas un appel.

import { ensureSchema } from "@/lib/db-init"
import { db } from "@/lib/db"
import {
  listModels,
  seedRegistry,
  getModel,
  getDefaultModel,
  staticModel,
  registryStats,
  invalidateRegistryCache,
} from "@/lib/ai/model-registry"

beforeAll(async () => {
  await ensureSchema()
  await db.aIModel.deleteMany({})
  invalidateRegistryCache()
})

afterAll(async () => {
  try {
    rmSync(TEST_DB_PATH, { force: true })
    rmSync(`${TEST_DB_PATH}-journal`, { force: true })
  } catch {}
})

describe("Model Registry — amorçage", () => {
  test("seedRegistry : crée les modèles HF + Gemini + catalogue historique", async () => {
    const result = await seedRegistry()
    expect(result.created).toBeGreaterThan(10)
    expect(result.updated).toBe(0)

    const stats = await registryStats()
    expect(stats.total).toBe(result.created)
    // HF est présent comme provider principal.
    expect(stats.byProvider["huggingface"]).toBeGreaterThan(0)
    expect(stats.byProvider["gemini"]).toBeGreaterThan(0)
    expect(stats.byProvider["glm"]).toBeGreaterThan(0)
  })

  test("seedRegistry est idempotent (re-seed = update, pas de doublon)", async () => {
    const before = await db.aIModel.count()
    const result = await seedRegistry()
    expect(result.created).toBe(0)
    expect(result.updated).toBe(before)
    expect(await db.aIModel.count()).toBe(before)
  })

  test("le re-seed N'ÉCRASE PAS les champs appris (successRate, sampleCount)", async () => {
    const row = await db.aIModel.findFirstOrThrow({ where: { provider: "huggingface" } })
    await db.aIModel.update({
      where: { id: row.id },
      data: { successRate: 0.97, sampleCount: 42, qualityScore: 0.88 },
    })
    await seedRegistry()
    const after = await db.aIModel.findUniqueOrThrow({ where: { id: row.id } })
    expect(after.successRate).toBe(0.97)
    expect(after.sampleCount).toBe(42)
    expect(after.qualityScore).toBe(0.88)
  })

  test("amorçage automatique paresseux : base vierge → seed au premier listModels", async () => {
    await db.aIModel.deleteMany({})
    invalidateRegistryCache()
    // Reset du mémo d'auto-seed en rechargeant le module n'est pas trivial en
    // bun:test : on simule en appelant listModels qui déclenche ensureSeeded.
    const models = await listModels()
    expect(models.length).toBeGreaterThan(5)
    expect(await db.aIModel.count()).toBeGreaterThan(5)
  })
})

describe("Model Registry — lecture et filtres", () => {
  test("listModels ne retourne que les modèles ACTIFS par défaut", async () => {
    const row = await db.aIModel.findFirstOrThrow({ where: { provider: "glm" } })
    await db.aIModel.update({ where: { id: row.id }, data: { status: "DISABLED" } })
    invalidateRegistryCache()
    const active = await listModels({ provider: "glm" })
    expect(active.every((m) => m.status === "ACTIVE")).toBe(true)
    const all = await listModels({ provider: "glm", includeDisabled: true })
    expect(all.some((m) => m.status === "DISABLED")).toBe(true)
    await db.aIModel.update({ where: { id: row.id }, data: { status: "ACTIVE" } })
    invalidateRegistryCache()
  })

  test("filtre par tâche : les modèles retournés supportent la tâche", async () => {
    const forPlanning = await listModels({ taskType: "PLANNING" })
    expect(forPlanning.length).toBeGreaterThan(0)
    for (const m of forPlanning) {
      expect(m.supportedTasks).toContain("PLANNING")
    }
  })

  test("getModel résout un modèle précis (provider, modelId)", async () => {
    const model = await getModel("huggingface", "meta-llama/Llama-3.3-70B-Instruct")
    expect(model).not.toBeNull()
    expect(model!.name).toContain("Llama")
    expect(model!.creditsPerKIn).toBe(0.1)
  })

  test("getDefaultModel retourne le modèle marqué isDefault du provider", async () => {
    const model = await getDefaultModel("huggingface")
    expect(model).not.toBeNull()
    expect(model!.isDefault).toBe(true)
  })

  test("repli statique quand le modèle n'est pas au registre", () => {
    const model = staticModel("glm", "glm-4.5")
    expect(model).not.toBeNull()
    expect(model!.provider).toBe("glm")
    expect(model!.creditsPerKIn).toBe(0.4)
    expect(staticModel("unknown", "void")).toBeNull()
  })
})

describe("Model Registry — évolution sans code", () => {
  test("un modèle ajouté en base est immédiatement routable (aucune modification de code)", async () => {
    await db.aIModel.create({
      data: {
        provider: "custom",
        modelId: "test/new-model-9000",
        name: "Nouveau modèle test",
        modality: "text",
        supportedTasks: JSON.stringify(["CHAT", "EXECUTION"]),
        contextLength: 65536,
        creditsPerKIn: 0.01,
        creditsPerKOut: 0.02,
        priority: 1,
        status: "ACTIVE",
      },
    })
    invalidateRegistryCache()
    const found = await getModel("custom", "test/new-model-9000")
    expect(found).not.toBeNull()
    expect(found!.priority).toBe(1)
    await db.aIModel.deleteMany({ where: { provider: "custom" } })
    invalidateRegistryCache()
  })

  test("les capacités sont persistées et relues (ModelCapability)", async () => {
    const row = await db.aIModel.findFirstOrThrow({ where: { provider: "huggingface" } })
    const caps = await db.modelCapability.findMany({ where: { modelId: row.id } })
    expect(caps.length).toBeGreaterThan(0)
    const model = await getModel(row.provider, row.modelId)
    expect(model!.capabilities.length).toBeGreaterThan(0)
  })
})
