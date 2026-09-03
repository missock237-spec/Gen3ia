import { describe, test, expect } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { buildOpenApiDocument, API_V1_ENDPOINTS } from "@/lib/sdk/openapi"
import { estimateStepCosts } from "@/components/tasks/plan-graph"

/**
 * v3.6 — DX & API :
 *  1. OpenAPI 3.1 complète (routes réelles /api/v1, schémas, sécurité) ;
 *  2. simulation de coûts du mode Explain (fonction pure) ;
 *  3. SDK typés générés depuis Prisma (manifeste, parsing, exclusion secrets).
 */

const ROOT = join(import.meta.dir, "../..")

describe("OpenAPI 3.1", () => {
  const doc = buildOpenApiDocument() as {
    openapi: string
    paths: Record<string, Record<string, unknown>>
    components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> }
  }

  test("couvre les 6 endpoints réels de l'API v1", () => {
    for (const endpoint of API_V1_ENDPOINTS) {
      expect(doc.paths[endpoint]).toBeTruthy()
    }
    expect(Object.keys(doc.paths)).toHaveLength(API_V1_ENDPOINTS.length)
  })

  test("schémas de sécurité Bearer + enveloppe d'erreur", () => {
    expect(doc.components.securitySchemes.BearerApiKey).toEqual(
      expect.objectContaining({ type: "http", scheme: "bearer" })
    )
    expect(doc.components.schemas.Error).toEqual(
      expect.objectContaining({ required: expect.arrayContaining(["ok", "error"]) })
    )
  })

  test("chaque opération documente ses réponses (y compris erreurs)", () => {
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        const responses = (op as { responses?: Record<string, unknown> }).responses
        expect(responses, `${method} ${path} sans réponses`).toBeTruthy()
        expect(Object.keys(responses!)).toContain("200")
      }
    }
  })

  test("POST /chat exige un message (contraintes Zod reflétées)", () => {
    const schema = (doc.paths["/api/v1/chat"]!.post as { requestBody: { content: Record<string, { schema: unknown }> } })
      .requestBody.content["application/json"].schema as { $ref: string }
    expect(schema.$ref).toBe("#/components/schemas/ChatRequest")
    const chatRequest = doc.components.schemas.ChatRequest as { required: string[]; properties: Record<string, { maxLength?: number }> }
    expect(chatRequest.required).toContain("message")
    expect(chatRequest.properties.message.maxLength).toBe(8000)
  })

  test("cycle machine : JSON sérialisable strict", () => {
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow()
  })
})

describe("Simulation de coûts (mode Explain)", () => {
  const plan = { estimatedCostCredits: 10 }

  test("étapes vides → aucune estimation", () => {
    expect(estimateStepCosts(plan, [])).toHaveLength(0)
  })

  test("poids normalisés : la somme vaut 1, le cumul vaut le total", () => {
    const steps = [
      { title: "A", detail: "x".repeat(100) },
      { title: "B", detail: "y".repeat(200), tool: "web_search" },
      { title: "C", detail: "z".repeat(50) },
    ]
    const est = estimateStepCosts(plan, steps)
    expect(est).toHaveLength(3)
    const weightSum = est.reduce((a, e) => a + e.weight, 0)
    expect(Math.abs(weightSum - 1)).toBeLessThan(0.001)
    expect(est[2].cumulativeCredits).toBeCloseTo(10, 1)
    // Cumul strictement croissant.
    expect(est[1].cumulativeCredits).toBeGreaterThan(est[0].cumulativeCredits)
  })

  test("une étape outillée coûte PLUS qu'une étape équivalente sans outil", () => {
    const withTool = estimateStepCosts(plan, [
      { title: "A", detail: "d".repeat(100), tool: "web_search" },
      { title: "B", detail: "d".repeat(100) },
    ])
    expect(withTool[0].credits).toBeGreaterThan(withTool[1].credits)
  })

  test("temps réel : l'édition d'une étape change la répartition", () => {
    const before = estimateStepCosts(plan, [
      { title: "A", detail: "court" },
      { title: "B", detail: "court" },
    ])
    const after = estimateStepCosts(plan, [
      { title: "A", detail: "court" },
      { title: "B", detail: "très long détail rallongé massivement pour changer le poids" },
    ])
    expect(after[1].credits).toBeGreaterThan(before[1].credits)
    expect(after[0].credits).toBeLessThan(before[0].credits)
  })

  test("convention planner : 1 crédit ≈ 1000 tokens de sortie", () => {
    const est = estimateStepCosts(plan, [{ title: "A", detail: "détail" }])
    expect(est[0].tokensOut).toBe(Math.round(est[0].credits * 1000))
  })
})

describe("SDK typés générés depuis Prisma", () => {
  test("manifeste : 53 modèles, sorties présentes", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "sdks/manifest.json"), "utf8")) as {
      models: number
      outputs: string[]
    }
    expect(manifest.models).toBe(53)
    expect(manifest.outputs).toHaveLength(4)
    for (const out of manifest.outputs) {
      expect(existsSync(join(ROOT, out)), `${out} manquant`).toBe(true)
    }
  })

  test("TypeScript : 53 interfaces, parse propre, aucun champ secret", () => {
    const ts = require("typescript") as typeof import("typescript")
    const source = readFileSync(join(ROOT, "sdks/typescript/src/types.gen.ts"), "utf8")
    const sf = ts.createSourceFile("types.gen.ts", source, ts.ScriptTarget.ES2017, true)
    expect(sf.parseDiagnostics).toHaveLength(0)
    expect((source.match(/export interface /g) ?? []).length).toBe(53)
    // Task expose les métriques publiques réelles…
    expect(source).toContain("costCredits: number")
    expect(source).toContain("tokensIn: number")
    // …et AUCUN secret.
    expect(source).not.toMatch(/^\s*passwordHash:/m)
    expect(source).not.toMatch(/^\s*encryptedData:/m)
    expect(source).not.toMatch(/^\s*keyHash:/m)
  })

  test("client TypeScript : méthodes typées de bout en bout, parse propre", () => {
    const ts = require("typescript") as typeof import("typescript")
    const source = readFileSync(join(ROOT, "sdks/typescript/src/client.ts"), "utf8")
    const sf = ts.createSourceFile("client.ts", source, ts.ScriptTarget.ES2017, true)
    expect(sf.parseDiagnostics).toHaveLength(0)
    for (const method of ["chat", "runTask", "getTask", "listTransactions", "listApiKeys", "listAgents"]) {
      expect(source).toContain(`async ${method}(`)
    }
  })

  test("Python : dataclasses importables avec les champs publics", async () => {
    const { execSync } = require("node:child_process") as typeof import("node:child_process")
    // Import réel (la syntaxe ET l'ordre des champs dataclass sont vérifiés).
    const code =
      "import dataclasses; from gen3ia.types_gen import Task, Agent; " +
      "f=[x.name for x in dataclasses.fields(Task)]; " +
      "assert 'cost_credits' in f and 'created_at' in f; " +
      "print('PY-OK')"
    const out = execSync(`python3 -c "${code}"`, { cwd: join(ROOT, "sdks/python"), encoding: "utf8" })
    expect(out.trim()).toBe("PY-OK")
  })
})
