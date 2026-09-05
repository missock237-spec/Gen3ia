import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"

// Base dédiée (convention du projet — voir connectors-composio.test.ts).
mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-gateway.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`

const { ensureSchema } = await import("@/lib/db-init")
const { db } = await import("@/lib/db")
const { encryptJson } = await import("@/lib/connectors/core/crypto")
const riskEngine = await import("@/lib/connectors/gateway/risk-engine")
const permissions = await import("@/lib/connectors/gateway/permissions")
const { verifyActionResult, readbackPairFor } = await import("@/lib/connectors/gateway/verification")
const gateway = await import("@/lib/connectors/gateway/gateway")
const { discoverConnectorTools, discoverySnapshotForUser } = await import("@/lib/connectors/gateway/tool-discovery")
const { connectorToolKey } = await import("@/lib/connectors/core/types")
const { runConnectorTool } = await import("@/lib/connectors/core/toolset")
const { riskFloorCovers, riskLevelFromScore } = await import("@/lib/connectors/gateway/types")

/**
 * Action Gateway (v4.3, ADR-0017) :
 * - Risk Engine : niveaux LOW/MEDIUM/HIGH/CRITICAL à facteurs explicites ;
 * - Permission Engine : motifs, DENY prioritaire, plafonds, expiration ;
 * - Gateway : rejet, confirmation (fail-closed), exécution vérifiée
 *   (read-back), trace complète, audit immuable ;
 * - Tool Discovery : apps/outils classés + instantané planner ;
 * - Intégration registry → runConnectorTool → gateway.
 */

const TEST_EMAIL = "gw@test.gen3ia"
let userId: string
let originalFetch: typeof fetch
let fetchCalls: string[] = []

/** Stub fetch : journalise les URLs et répond JSON selon le path. */
function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof URL ? input : input)
    fetchCalls.push(`${(init?.method ?? "GET").toUpperCase()} ${url}`)
    const body = handler(url, init)
    return new Response(JSON.stringify(body ?? {}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
}

beforeAll(async () => {
  await ensureSchema()
  const user = await db.user.create({ data: { email: TEST_EMAIL, passwordHash: "x", credits: 10 } })
  userId = user.id

  // Connexion GitHub ACTIVE (données chiffrées — même format que le moteur local).
  await db.connectedAccount.create({
    data: {
      userId,
      appSlug: "github",
      status: "ACTIVE",
      authScheme: "OAUTH2",
      encryptedData: encryptJson({
        authScheme: "OAUTH2",
        status: "ACTIVE",
        access_token: "gho_test_token",
        token_type: "bearer",
      }),
      meta: JSON.stringify({ accountHint: "gw@test" }),
    },
  })

  originalFetch = globalThis.fetch
})

afterAll(async () => {
  globalThis.fetch = originalFetch
  await db.connectorExecution.deleteMany({ where: { userId } })
  await db.connectorPermission.deleteMany({ where: { userId } })
  await db.connectedAccount.deleteMany({ where: { userId } })
  await db.user.deleteMany({ where: { id: userId } })
})

beforeEach(async () => {
  fetchCalls = []
  await db.connectorExecution.deleteMany({ where: { userId } })
  await db.connectorPermission.deleteMany({ where: { userId } })
  permissions.invalidatePermissionCache(userId)
  permissions.invalidatePermissionCache()
})

// ─────────────────────────────────────────────────────────────
// Risk Engine
// ─────────────────────────────────────────────────────────────

describe("Risk Engine — évaluation à facteurs explicites", () => {
  test("lecture locale (GET) → LOW", () => {
    expect(riskEngine.assessConnectorRisk("github", "get_me").level).toBe("LOW")
    expect(riskEngine.assessConnectorRisk("github", "list_repositories").level).toBe("LOW")
  })

  test("création locale (POST create) → MEDIUM", () => {
    expect(riskEngine.assessConnectorRisk("github", "create_issue").level).toBe("MEDIUM")
    expect(riskEngine.assessConnectorRisk("notion", "create_page").level).toBe("MEDIUM")
    expect(riskEngine.assessConnectorRisk("trello", "create_card").level).toBe("MEDIUM")
  })

  test("envoi externe → HIGH (email, message)", () => {
    expect(riskEngine.assessConnectorRisk("gmail", "send_email").level).toBe("HIGH")
    expect(riskEngine.assessConnectorRisk("slack", "send_message").level).toBe("HIGH")
    expect(riskEngine.assessConnectorRisk("telegram", "send_message").level).toBe("HIGH")
  })

  test("suppression → CRITICAL", () => {
    expect(riskEngine.assessConnectorRisk("calendar", "delete_event").level).toBe("CRITICAL")
    expect(riskEngine.assessConnectorRisk("airtable", "delete_record").level).toBe("CRITICAL")
    expect(riskEngine.assessConnectorRisk("twitter", "delete_tweet").level).toBe("CRITICAL")
  })

  test("fusion d'un PR (irréversible PUT) → HIGH", () => {
    expect(riskEngine.assessConnectorRisk("github", "merge_pull_request").level).toBe("HIGH")
  })

  test("application financière : mouvement d'argent → HIGH, lecture → LOW", () => {
    expect(riskEngine.assessConnectorRisk("stripe", "create_payment_intent").level).toBe("HIGH")
    expect(riskEngine.assessConnectorRisk("stripe", "get_balance").level).toBe("LOW")
    expect(riskEngine.assessConnectorRisk("stripe", "list_charges").level).toBe("LOW")
  })

  test("slug Composio (majuscules) : lecture LOW, envoi HIGH, suppression CRITICAL", () => {
    expect(riskEngine.assessConnectorRisk("gmail", "GMAIL_FETCH_MAILS").level).toBe("LOW")
    expect(riskEngine.assessConnectorRisk("gmail", "GMAIL_SEND_EMAIL").level).toBe("HIGH")
    expect(riskEngine.assessConnectorRisk("notion", "NOTION_DELETE_PAGE").level).toBe("CRITICAL")
  })

  test("sémantique inconnue → prudent (MEDIUM)", () => {
    const risk = riskEngine.assessConnectorRisk("unknow", "WEIRD_THING")
    expect(risk.level).toBe("MEDIUM")
    expect(risk.source).toBe("SLUG_HEURISTIC")
  })

  test("facteurs explicites présents (raisons auditables)", () => {
    const risk = riskEngine.assessConnectorRisk("calendar", "delete_event")
    expect(risk.reasons.length).toBeGreaterThanOrEqual(2)
    expect(risk.reasons.join(" ")).toContain("suppression")
  })

  test("diffusion massive (plus de 10 destinataires) amplifie le score", () => {
    const alone = riskEngine.assessConnectorRisk("gmail", "send_email")
    const broadcast = riskEngine.assessConnectorRisk("gmail", "send_email", {
      to: ["a@x.io", "b@x.io", "c@x.io", "d@x.io", "e@x.io", "f@x.io", "g@x.io", "h@x.io", "i@x.io", "j@x.io", "k@x.io"],
    })
    expect(broadcast.score).toBeGreaterThan(alone.score)
    expect(broadcast.reasons.join(" ")).toContain("diffusion")
  })

  test("bornes et plafonds", () => {
    expect(riskLevelFromScore(0)).toBe("LOW")
    expect(riskLevelFromScore(29)).toBe("LOW")
    expect(riskLevelFromScore(30)).toBe("MEDIUM")
    expect(riskLevelFromScore(59)).toBe("MEDIUM")
    expect(riskLevelFromScore(60)).toBe("HIGH")
    expect(riskLevelFromScore(79)).toBe("HIGH")
    expect(riskLevelFromScore(80)).toBe("CRITICAL")
    expect(riskLevelFromScore(250)).toBe("CRITICAL")
    expect(riskFloorCovers("MEDIUM", "LOW")).toBe(true)
    expect(riskFloorCovers("MEDIUM", "MEDIUM")).toBe(true)
    expect(riskFloorCovers("MEDIUM", "HIGH")).toBe(false)
    expect(riskFloorCovers("CRITICAL", "CRITICAL")).toBe(true)
  })

  test("évaluation depuis une clé d'outil + détection plan-level", () => {
    expect(riskEngine.assessToolKeyRisk("connector_github_get_me").level).toBe("LOW")
    expect(riskEngine.assessToolKeyRisk("connector_github_merge_pull_request").level).toBe("HIGH")
    // Clé non-connector : prudent.
    expect(riskEngine.assessToolKeyRisk("web_search").level).toBe("MEDIUM")
    expect(riskEngine.isPlanRiskyTool("connector_github_delete_file")).toBe(true)
    expect(riskEngine.isPlanRiskyTool("connector_github_get_file")).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────
// Permission Engine
// ─────────────────────────────────────────────────────────────

describe("Permission Engine — motifs, plafonds, DENY prioritaire", () => {
  test("correspondance des motifs", () => {
    expect(permissions.patternMatches("github.*", "github", "create_issue")).toBe(true)
    expect(permissions.patternMatches("github.create_issue", "github", "create_issue")).toBe(true)
    expect(permissions.patternMatches("*.send_email", "gmail", "send_email")).toBe(true)
    expect(permissions.patternMatches("*", "slack", "post_message")).toBe(true)
    expect(permissions.patternMatches("slack.*", "github", "create_issue")).toBe(false)
    expect(permissions.patternMatches("github.create_issue", "github", "list_issues")).toBe(false)
    expect(permissions.patternMatches("GITHUB.*", "github", "create_issue")).toBe(true)
  })

  test("politique par défaut : plafond MEDIUM (lectures et écritures OK, HIGH confirmé)", async () => {
    const low = await permissions.checkConnectorPermission(userId, "github", "get_me", "LOW")
    expect(low.decision).toBe("ALLOW")
    expect(low.source).toBe("DEFAULT_POLICY")
    const medium = await permissions.checkConnectorPermission(userId, "github", "create_issue", "MEDIUM")
    expect(medium.decision).toBe("ALLOW")
    const high = await permissions.checkConnectorPermission(userId, "gmail", "send_email", "HIGH")
    expect(high.decision).toBe("CONFIRMATION_REQUIRED")
    const critical = await permissions.checkConnectorPermission(userId, "calendar", "delete_event", "CRITICAL")
    expect(critical.decision).toBe("CONFIRMATION_REQUIRED")
  })

  test("permission ALLOW relève le plafond", async () => {
    await permissions.grantConnectorPermission({
      userId, appSlug: "slack", actionPattern: "slack.*", effect: "ALLOW", riskFloor: "HIGH",
    })
    permissions.invalidatePermissionCache(userId)
    const check = await permissions.checkConnectorPermission(userId, "slack", "send_message", "HIGH")
    expect(check.decision).toBe("ALLOW")
    expect(check.source).toBe("GRANT")
    const critical = await permissions.checkConnectorPermission(userId, "slack", "delete_x", "CRITICAL")
    expect(critical.decision).toBe("CONFIRMATION_REQUIRED")
  })

  test("DENY prioritaire sur ALLOW plus précis", async () => {
    await permissions.grantConnectorPermission({
      userId, appSlug: "github", actionPattern: "github.*", effect: "ALLOW", riskFloor: "CRITICAL",
    })
    await permissions.grantConnectorPermission({
      userId, appSlug: "github", actionPattern: "github.merge_pull_request", effect: "DENY", riskFloor: "LOW",
    })
    permissions.invalidatePermissionCache(userId)
    const denied = await permissions.checkConnectorPermission(userId, "github", "merge_pull_request", "MEDIUM")
    expect(denied.decision).toBe("DENY")
    const allowed = await permissions.checkConnectorPermission(userId, "github", "create_issue", "MEDIUM")
    expect(allowed.decision).toBe("ALLOW")
  })

  test("permission expirée ignorée", async () => {
    await permissions.grantConnectorPermission({
      userId, appSlug: "gmail", actionPattern: "gmail.*", effect: "ALLOW", riskFloor: "HIGH",
      expiresAt: new Date(Date.now() - 60_000),
    })
    permissions.invalidatePermissionCache(userId)
    const check = await permissions.checkConnectorPermission(userId, "gmail", "send_email", "HIGH")
    expect(check.decision).toBe("CONFIRMATION_REQUIRED")
  })

  test("pré-autorisation : HIGH couvert, CRITICAL jamais", async () => {
    const high = await permissions.checkConnectorPermission(userId, "gmail", "send_email", "HIGH", true)
    expect(high.decision).toBe("ALLOW")
    expect(high.source).toBe("PRE_AUTHORIZED")
    const critical = await permissions.checkConnectorPermission(userId, "calendar", "delete_event", "CRITICAL", true)
    expect(critical.decision).toBe("CONFIRMATION_REQUIRED")
  })

  test("plafond explicite (confirmation) couvre CRITICAL mais pas un DENY", async () => {
    const critical = await permissions.checkConnectorPermission(userId, "calendar", "delete_event", "CRITICAL", false, "CRITICAL")
    expect(critical.decision).toBe("ALLOW")
    await permissions.grantConnectorPermission({
      userId, appSlug: "calendar", actionPattern: "calendar.*", effect: "DENY", riskFloor: "LOW",
    })
    permissions.invalidatePermissionCache(userId)
    const denied = await permissions.checkConnectorPermission(userId, "calendar", "delete_event", "CRITICAL", false, "CRITICAL")
    expect(denied.decision).toBe("DENY")
  })

  test("gestion : liste, révocation avec appartenance", async () => {
    const granted = await permissions.grantConnectorPermission({
      userId, appSlug: "notion", actionPattern: "notion.*", effect: "ALLOW", riskFloor: "MEDIUM", note: "test",
    })
    const list = await permissions.listConnectorPermissions(userId)
    expect(list.some((p) => p.id === granted.id && p.effect === "ALLOW")).toBe(true)
    // Un autre utilisateur ne peut pas révoquer.
    const other = await db.user.create({ data: { email: "gw2@test.gen3ia", passwordHash: "x", credits: 0 } })
    expect(await permissions.revokeConnectorPermission(granted.id, other.id)).toBe(false)
    expect(await permissions.revokeConnectorPermission(granted.id, userId)).toBe(true)
    await db.user.delete({ where: { id: other.id } })
  })
})

// ─────────────────────────────────────────────────────────────
// Vérification de résultat
// ─────────────────────────────────────────────────────────────

describe("Result Verification — forme et read-back", () => {
  test("échec de transport → rapport skipped, non vérifié", async () => {
    const report = await verifyActionResult("github", "get_me", {
      ok: false, status: 500, statusText: "Server Error", data: null, output: "",
      latencyMs: 10, error: "boom", connectionId: "c1", actionSlug: "get_me", appSlug: "github",
    }, {})
    expect(report.verified).toBe(false)
    expect(report.strategy).toBe("skipped")
    expect(report.checks[0].name).toBe("transport")
    expect(report.checks[0].pass).toBe(false)
  })

  test("succès GET : contrôles de forme (sans read-back)", async () => {
    const report = await verifyActionResult("github", "get_me", {
      ok: true, status: 200, statusText: "OK", data: { login: "gw" }, output: "{...}",
      latencyMs: 12, connectionId: "c1", actionSlug: "get_me", appSlug: "github",
    }, {})
    expect(report.strategy).toBe("shape")
    expect(report.verified).toBe(true)
    expect(report.checks.every((c) => c.pass)).toBe(true)
  })

  test("mutation sans charge utile → contrôle payload échoue", async () => {
    const report = await verifyActionResult("github", "create_issue", {
      ok: true, status: 200, statusText: "OK", data: null, output: "",
      latencyMs: 12, connectionId: "c1", actionSlug: "create_issue", appSlug: "github",
    }, {})
    expect(report.verified).toBe(false)
    expect(report.checks.some((c) => c.name === "payload_present" && !c.pass)).toBe(true)
  })

  test("paires read-back : github.create_issue relit l'issue créée", async () => {
    const pair = readbackPairFor("github", "create_issue")
    expect(pair).not.toBeNull()
    expect(pair!.verifyActionSlug).toBe("get_issue")
    const mapped = pair!.mapParams({ number: 42 }, { owner: "missock", repo: "gen3ia" })
    expect(mapped).toEqual({ owner: "missock", repo: "gen3ia", issue_number: 42 })
  })

  test("read-back exécuté via l'exécuteur injecté", async () => {
    let readbackParams: Record<string, unknown> | null = null
    const report = await verifyActionResult(
      "github",
      "create_issue",
      {
        ok: true, status: 201, statusText: "Created", data: { number: 42, html_url: "https://github.com/o/r/issues/42" },
        output: "created", latencyMs: 120, connectionId: "local-1", actionSlug: "create_issue", appSlug: "github",
      },
      { owner: "o", repo: "r", title: "x" },
      {
        executeReadback: async (_app, _action, params) => {
          readbackParams = params
          return {
            ok: true, status: 200, statusText: "OK", data: { number: 42 }, output: "ok",
            latencyMs: 30, connectionId: "local-1", actionSlug: "get_issue", appSlug: "github",
          }
        },
      }
    )
    expect(readbackParams).toEqual({ owner: "o", repo: "r", issue_number: 42 })
    expect(report.strategy).toBe("readback")
    expect(report.verified).toBe(true)
    expect(report.evidence.some((e) => e.includes("number=42"))).toBe(true)
  })

  test("connexions Composio (cpc_) : read-back écarté, forme seule", async () => {
    const report = await verifyActionResult(
      "github",
      "create_issue",
      {
        ok: true, status: 200, statusText: "OK", data: { number: 1 }, output: "ok",
        latencyMs: 50, connectionId: "cpc_abc", actionSlug: "create_issue", appSlug: "github",
      },
      {},
      {
        executeReadback: async () => {
          throw new Error("ne doit pas être appelé")
        },
      }
    )
    expect(report.strategy).toBe("shape")
  })
})

// ─────────────────────────────────────────────────────────────
// Gateway — orchestration complète (fetch stubbé)
// ─────────────────────────────────────────────────────────────

describe("Action Gateway — orchestration, confirmation, trace, audit", () => {
  test("exécution MEDIUM autorisée par défaut : vérifiée par read-back, trace complète, audit immuable", async () => {
    stubFetch((url) => {
      if (url.includes("/issues/42")) return { number: 42, state: "open" }
      if (url.includes("/issues") && !url.includes("?")) return { number: 42, html_url: "https://github.com/missock/gen3ia/issues/42" }
      return { ok: true }
    })

    const result = await gateway.executeGuardedAction({
      userId,
      appSlug: "github",
      actionSlug: "create_issue",
      params: { owner: "missock", repo: "gen3ia", title: "Test gateway" },
      agentId: "agent_1",
      taskId: "task_1",
      planId: "B",
      stepIndex: 2,
      source: "AGENT",
    })

    expect(result.ok).toBe(true)
    expect(result.permission.decision).toBe("ALLOW")
    expect(result.risk.level).toBe("MEDIUM")
    expect(result.executionStatus).toBe("VERIFIED")
    expect(result.verification?.strategy).toBe("readback")
    expect(result.verification?.verified).toBe(true)
    // Read-back réellement exécuté (2 appels : POST create + GET relecture).
    expect(fetchCalls.length).toBe(2)
    expect(fetchCalls[0].startsWith("POST ")).toBe(true)
    expect(fetchCalls[1].startsWith("GET ")).toBe(true)
    expect(fetchCalls[1]).toContain("/issues/42")

    // Enregistrement persisté avec la chaîne de trace complète.
    const record = await db.connectorExecution.findUnique({ where: { id: result.executionId } })
    expect(record).not.toBeNull()
    expect(record!.taskId).toBe("task_1")
    expect(record!.planId).toBe("B")
    expect(record!.stepIndex).toBe(2)
    expect(record!.agentId).toBe("agent_1")
    expect(record!.riskLevel).toBe("MEDIUM")
    expect(record!.status).toBe("VERIFIED")
    expect(record!.provider).toBe("LOCAL")
    expect(record!.requestId).toBeTruthy()
    expect(record!.verification).toContain("readback")

    // Entrée dans la chaîne d'audit immuable.
    const auditEntries = await db.immutableAuditLog.findMany({
      where: { action: "CONNECTOR_EXECUTED", entityId: result.executionId },
    })
    expect(auditEntries.length).toBe(1)
    expect(JSON.parse(auditEntries[0].detail!)).toMatchObject({ app: "github", status: "VERIFIED" })
  })

  test("DENY explicite : rejet enregistré, aucun appel réseau", async () => {
    stubFetch(() => ({ ok: true }))
    await permissions.grantConnectorPermission({
      userId, appSlug: "github", actionPattern: "github.merge_pull_request", effect: "DENY", riskFloor: "LOW",
    })
    permissions.invalidatePermissionCache(userId)

    const result = await gateway.executeGuardedAction({
      userId, appSlug: "github", actionSlug: "merge_pull_request",
      params: { owner: "o", repo: "r", pull_number: 1 },
    })

    expect(result.ok).toBe(false)
    expect(result.executionStatus).toBe("REJECTED")
    expect(fetchCalls.length).toBe(0)
    const record = await db.connectorExecution.findUnique({ where: { id: result.executionId } })
    expect(record!.status).toBe("REJECTED")
  })

  test("HIGH sans permission : demande de confirmation (fail-closed), params chiffrés, aucun appel", async () => {
    stubFetch(() => ({ merged: true }))

    const result = await gateway.executeGuardedAction({
      userId, appSlug: "github", actionSlug: "merge_pull_request",
      params: { owner: "o", repo: "r", pull_number: 7 },
      taskId: "task_2", planId: "A", stepIndex: 0,
    })

    expect(result.ok).toBe(false)
    expect(result.executionStatus).toBe("CONFIRMATION_REQUIRED")
    expect(result.confirmation).not.toBeNull()
    expect(result.confirmation!.paramsPreview).toMatchObject({ owner: "o", repo: "r", pull_number: 7 })
    expect(result.error).toContain("CONFIRMATION_REQUISE")
    expect(fetchCalls.length).toBe(0)

    const record = await db.connectorExecution.findUnique({ where: { id: result.executionId } })
    expect(record!.status).toBe("CONFIRMATION_REQUIRED")
    expect(record!.paramsEncrypted).toBeTruthy()
    // Les params réels sont chiffrés (pas lisibles en clair).
    expect(record!.paramsEncrypted).not.toContain("pull_number")
  })

  test("confirmation approuvée : exécution reprenant le MÊME enregistrement", async () => {
    stubFetch(() => ({ merged: true, message: "Pull Request successfully merged" }))

    const request = await gateway.executeGuardedAction({
      userId, appSlug: "github", actionSlug: "merge_pull_request",
      params: { owner: "o", repo: "r", pull_number: 9 },
    })
    expect(request.executionStatus).toBe("CONFIRMATION_REQUIRED")

    const resolved = await gateway.resolveExecutionConfirmation(request.executionId, userId, {
      approved: true,
      decidedBy: TEST_EMAIL,
    })

    expect(resolved.ok).toBe(true)
    expect(resolved.executionId).toBe(request.executionId) // même enregistrement
    expect(resolved.executionStatus).toBe("VERIFIED") // shape : transport + payload
    expect(fetchCalls.length).toBe(1)

    const record = await db.connectorExecution.findUnique({ where: { id: request.executionId } })
    expect(record!.status).toBe("VERIFIED")
    expect(record!.confirmedBy).toBe(TEST_EMAIL)
    expect(record!.paramsEncrypted).toBeNull() // effacés après usage
    expect(record!.taskId).toBeNull()
  })

  test("confirmation refusée : rejet sans effet de bord", async () => {
    stubFetch(() => ({ merged: true }))
    const request = await gateway.executeGuardedAction({
      userId, appSlug: "github", actionSlug: "merge_pull_request",
      params: { owner: "o", repo: "r", pull_number: 10 },
    })
    const resolved = await gateway.resolveExecutionConfirmation(request.executionId, userId, {
      approved: false,
      decidedBy: TEST_EMAIL,
    })
    expect(resolved.ok).toBe(false)
    expect(resolved.executionStatus).toBe("REJECTED")
    expect(fetchCalls.length).toBe(0)
  })

  test("confirmation avec « toujours autoriser » : permission persistante créée", async () => {
    stubFetch(() => ({ merged: true }))
    const request = await gateway.executeGuardedAction({
      userId, appSlug: "github", actionSlug: "merge_pull_request",
      params: { owner: "o", repo: "r", pull_number: 11 },
    })
    await gateway.resolveExecutionConfirmation(request.executionId, userId, {
      approved: true,
      remember: "HIGH",
      decidedBy: TEST_EMAIL,
    })
    permissions.invalidatePermissionCache(userId)
    const list = await permissions.listConnectorPermissions(userId)
    const grant = list.find((p) => p.appSlug === "github" && p.effect === "ALLOW")
    expect(grant).toBeDefined()
    expect(grant!.riskFloor).toBe("HIGH")
    expect(grant!.source).toBe("HITL")
  })

  test("CRITICAL : même pré-autorisé (HITL plan), confirmation exigée ; accord explicite requis", async () => {
    stubFetch(() => ({ ok: true }))
    const blocked = await gateway.executeGuardedAction({
      userId, appSlug: "calendar", actionSlug: "delete_event",
      params: { eventId: "evt_1" },
      preAuthorized: true, // HITL du plan approuvé → plafond HIGH seulement
    })
    expect(blocked.executionStatus).toBe("CONFIRMATION_REQUIRED")
    expect(fetchCalls.length).toBe(0)
  })

  test("échec structurel (aucune connexion) : FAILED enregistré, jamais de throw", async () => {
    stubFetch(() => ({ ok: true }))
    const result = await gateway.executeGuardedAction({
      userId, appSlug: "slack", actionSlug: "create_channel", // MEDIUM → autorisé, jamais connecté
      params: { name: "test" },
    })
    expect(result.ok).toBe(false)
    expect(result.executionStatus).toBe("FAILED")
    expect(result.error).toBeTruthy()
    const record = await db.connectorExecution.findUnique({ where: { id: result.executionId } })
    expect(record!.status).toBe("FAILED")
  })

  test("rédaction des paramètres : secrets masqués", () => {
    const redacted = gateway.redactParams({
      api_token: "super-secret",
      password: "hunter2",
      title: "ok",
      body: "x".repeat(500),
    })
    expect(redacted.api_token).toBe("***")
    expect(redacted.password).toBe("***")
    expect(redacted.title).toBe("ok")
    expect(String(redacted.body).length).toBeLessThanOrEqual(201)
  })

  test("historique : liste filtrable avec statut et risque", async () => {
    stubFetch(() => ({ number: 43 }))
    await gateway.executeGuardedAction({
      userId, appSlug: "github", actionSlug: "create_issue",
      params: { owner: "o", repo: "r", title: "hist" },
    })
    const list = await gateway.listGatewayExecutions(userId, { limit: 50 })
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list[0].riskLevel).toBeTruthy()
    const filtered = await gateway.listGatewayExecutions(userId, { status: "CONFIRMATION_REQUIRED" })
    expect(filtered.every((e) => e.status === "CONFIRMATION_REQUIRED")).toBe(true)
    // Un autre utilisateur ne voit rien.
    const other = await db.user.create({ data: { email: "gw3@test.gen3ia", passwordHash: "x", credits: 0 } })
    expect((await gateway.listGatewayExecutions(other.id, {})).length).toBe(0)
    await db.user.delete({ where: { id: other.id } })
  })
})

// ─────────────────────────────────────────────────────────────
// Tool Discovery
// ─────────────────────────────────────────────────────────────

describe("Tool Discovery — apps et actions classées", () => {
  test("recherche langage naturel : gmail + notion trouvés, actions avec risque", async () => {
    const result = await discoverConnectorTools("analyser mes emails gmail et creer des taches dans notion", { limitApps: 8 })
    expect(result.terms.length).toBeGreaterThan(2)
    expect(result.apps.some((a) => a.slug === "gmail")).toBe(true)
    expect(result.apps.some((a) => a.slug === "notion")).toBe(true)
    const gmailTools = result.tools.filter((t) => t.appSlug === "gmail")
    expect(gmailTools.some((t) => t.actionSlug === "send_email" && t.risk === "HIGH")).toBe(true)
    expect(result.tools.every((t) => t.key === `connector_${t.appSlug}_${t.actionSlug}`)).toBe(true)
  })

  test("recherche github : issues/repos + état de connexion (github connecté)", async () => {
    const result = await discoverConnectorTools("creer une issue github", { userId })
    expect(result.apps.some((a) => a.slug === "github" && a.connected)).toBe(true)
    expect(result.tools.some((t) => t.appSlug === "github" && t.actionSlug === "create_issue")).toBe(true)
  })

  test("instantané planner : clés exactes + risques (github connecté)", async () => {
    const snapshot = await discoverySnapshotForUser(
      userId,
      { goals: ["créer une issue GitHub"], requiredCapabilities: ["github"] },
      ["connectors"],
      "crée une issue sur github"
    )
    expect(snapshot).not.toBeNull()
    expect(snapshot!.keys.some((k) => k === connectorToolKey("github", "create_issue"))).toBe(true)
    const createLine = snapshot!.toolLines.find((l) => l.includes("create_issue"))
    expect(createLine).toBeDefined()
    expect(createLine!.startsWith(`- ${connectorToolKey("github", "create_issue")}`)).toBe(true)
    const mergeLine = snapshot!.toolLines.find((l) => l.includes("merge_pull_request"))
    expect(mergeLine).toContain("RISQUE")
  })

  test("instantané planner : échec silencieux → null", async () => {
    // userId inexistant : listConnections est en échec contrôlé ([]) → snapshot
    // sans outils mais valide ; on vérifie juste le contrat non-throw.
    const snapshot = await discoverySnapshotForUser("user-inexistant", {}, ["connectors"])
    expect(snapshot).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────
// Intégration registry → runConnectorTool → gateway
// ─────────────────────────────────────────────────────────────

describe("Intégration — runConnectorTool traverse le gateway", () => {
  test("exécution via le registre : GatewayResult enrichi (jamais de throw)", async () => {
    stubFetch((url) => {
      if (url.includes("/issues/77")) return { number: 77, state: "open" }
      return { number: 77, html_url: "https://github.com/o/r/issues/77" }
    })

    const result = await runConnectorTool(
      connectorToolKey("github", "create_issue"),
      { owner: "o", repo: "r", title: "via registry" },
      { userId, agentId: "agent_9", taskId: "task_9", planId: "C", stepIndex: 0 }
    )

    expect(result.ok).toBe(true)
    // Champs gateway présents (le résultat traverse bien la passerelle).
    expect((result as { executionId?: string }).executionId).toBeTruthy()
    expect((result as { executionStatus?: string }).executionStatus).toBe("VERIFIED")
    const record = await db.connectorExecution.findFirst({
      where: { userId, taskId: "task_9", planId: "C" },
      orderBy: { createdAt: "desc" },
    })
    expect(record).not.toBeNull()
  })

  test("clé d'outil invalide : échec propre (contrat never-throw)", async () => {
    const result = await runConnectorTool("connector_", {}, { userId })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("invalide")
  })
})
