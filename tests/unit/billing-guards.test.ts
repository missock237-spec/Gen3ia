import { describe, test, expect, beforeAll } from "bun:test"
import crypto from "crypto"
import { mkdirSync } from "node:fs"

/**
 * Tests critiques du code qui touche à l'ARGENT — v3.2 (audit tests).
 *
 * Les 71 tests existants couvrent le pipeline IA mais AUCUN ne couvrait :
 *  - la vérification de signature HMAC du webhook Chariow ;
 *  l'idempotence du crédit (pas de double-crédit sur rejeu) ;
 *  - l'atomicité du Credit Ledger (débit impossible à solde insuffisant) ;
 *  - les guards requireUser / requireAdmin.
 *
 * Base dédiée : db/test-billing.db — aucune clé API nécessaire.
 */

// Base dédiée (chemin portable, résolu relativement à ce fichier — CI inclus).
// v3.2 : le dossier db/ est gitignoré → il faut le créer sur un checkout
// frais (CI) sinon SQLite échoue avec « Unable to open the database file ».
mkdirSync(new URL("../../db", import.meta.url).pathname, { recursive: true })
const TEST_DB_PATH = new URL("../../db/test-billing.db", import.meta.url).pathname
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`
process.env.CHARIOW_WEBHOOK_SECRET = "secret-webhook-test-3.2"
delete process.env.CHARIOW_API_KEY // le webhook ne doit pas en dépendre

// ---------- Imports dynamiques (après configuration de l'environnement) ----------

const { db } = await import("@/lib/db")
const { ensureSchema } = await import("@/lib/db-init")
const { verifyChariowSignature } = await import("@/lib/payments/chariow")
const { grantCredits, chargeCredits, InsufficientCreditsError, getBalance } = await import("@/lib/credits/ledger")
const { createSession, destroySession } = await import("@/lib/auth/session")
const { requireUser, requireAdmin } = await import("@/lib/auth/guards")
const { ApiError } = await import("@/lib/api")
const { NextRequest } = await import("next/server")
const webhookRoute = await import("@/app/api/billing/webhook/route")

const WEBHOOK_URL = "http://localhost:3000/api/billing/webhook"

function sign(body: string): string {
  return crypto
    .createHmac("sha256", process.env.CHARIOW_WEBHOOK_SECRET!)
    .update(body, "utf8")
    .digest("hex")
}

function webhookRequest(body: string, signature?: string | null): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (signature !== undefined) headers["x-chariow-signature"] = signature
  return new NextRequest(WEBHOOK_URL, { method: "POST", headers, body })
}

let user: { id: string; credits: number; plan: string }
let admin: { id: string }

beforeAll(async () => {
  await ensureSchema()
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  user = await db.user.create({
    data: {
      email: `billing-${stamp}@gen3ia.test`,
      name: "Test Billing",
      passwordHash: "test-hash",
      credits: 25,
      plan: "FREE",
    },
  })
  admin = await db.user.create({
    data: {
      email: `admin-${stamp}@gen3ia.test`,
      name: "Test Admin",
      passwordHash: "test-hash",
      role: "ADMIN",
      credits: 100,
    },
  })
})

// ---------- 1. Signature HMAC Chariow ----------

describe("verifyChariowSignature — HMAC-SHA256 sur corps brut", () => {
  const body = JSON.stringify({ event: "payment.succeeded", data: { id: "chk_123" } })

  test("signature valide acceptée", () => {
    expect(verifyChariowSignature(body, sign(body))).toBe(true)
  })

  test("signature invalide rejetée (corps modifié)", () => {
    expect(verifyChariowSignature(body + " ", sign(body))).toBe(false)
  })

  test("signature absente rejetée", () => {
    expect(verifyChariowSignature(body, null)).toBe(false)
  })

  test("secret absent → rejet systématique (fail-closed)", () => {
    const sig = sign(body) // calculé AVANT de retirer le secret
    const saved = process.env.CHARIOW_WEBHOOK_SECRET
    delete process.env.CHARIOW_WEBHOOK_SECRET
    try {
      expect(verifyChariowSignature(body, sig)).toBe(false)
    } finally {
      process.env.CHARIOW_WEBHOOK_SECRET = saved
    }
  })

  test("comparaison insensible à la casse/espaces du header", () => {
    expect(verifyChariowSignature(body, `  ${sign(body)}  `)).toBe(true)
  })
})

// ---------- 2. Webhook Chariow — sécurité et idempotence ----------

describe("POST /api/billing/webhook — point d'entrée unique des paiements", () => {
  test("signature invalide → 401, aucun effet en base", async () => {
    const before = await db.payment.count()
    const res = await webhookRoute.POST(webhookRequest(JSON.stringify({ data: { id: "x" } }), "deadbeef"))
    expect(res.status).toBe(401)
    expect(await db.payment.count()).toBe(before)
  })

  test("paiement inconnu → ignoré proprement (ok:true, ignored:true)", async () => {
    const body = JSON.stringify({ event: "payment.succeeded", data: { id: `chk_unknown_${Date.now()}` } })
    const res = await webhookRoute.POST(webhookRequest(body, sign(body)))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.ignored).toBe(true)
  })

  test("succès → paiement SUCCEEDED + crédits accordés + plan PRO", async () => {
    const payment = await db.payment.create({
      data: {
        userId: user.id,
        provider: "chariow",
        checkoutId: `chk_ok_${Date.now()}`,
        plan: "pro",
        amount: 10000,
        currency: "XOF",
        credits: 1500,
        status: "PENDING",
      },
    })
    const balanceBefore = await getBalance(user.id)

    const body = JSON.stringify({ event: "payment.succeeded", data: { id: payment.checkoutId!, status: "succeeded" } })
    const res = await webhookRoute.POST(webhookRequest(body, sign(body)))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)

    const [updated, balanceAfter] = await Promise.all([
      db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      getBalance(user.id),
    ])
    expect(updated.status).toBe("SUCCEEDED")
    expect(balanceAfter).toBeCloseTo(balanceBefore + 1500, 3)

    // Écriture au ledger (pas de modification directe du solde).
    const tx = await db.transaction.findFirst({
      where: { userId: user.id, refType: "payment", refId: payment.id },
    })
    expect(tx).toBeTruthy()
    expect(tx!.amount).toBe(1500)
    expect(tx!.type).toBe("TOPUP")

    // Le plan est passé à PRO (offer « pro »), pas ENTERPRISE.
    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(fresh.plan).toBe("PRO")

    // Rejeu du MÊME webhook : idempotence — aucun double crédit.
    const balanceBeforeReplay = await getBalance(user.id)
    const replay = await webhookRoute.POST(webhookRequest(body, sign(body)))
    expect(replay.status).toBe(200)
    expect((await replay.json()).ignored).toBe(true)
    expect(await getBalance(user.id)).toBeCloseTo(balanceBeforeReplay, 3)

    // Et une seule écriture TOPUP pour ce paiement.
    const count = await db.transaction.count({
      where: { userId: user.id, refType: "payment", refId: payment.id },
    })
    expect(count).toBe(1)
  })

  test("échec de paiement → FAILED, aucun crédit accordé", async () => {
    const payment = await db.payment.create({
      data: {
        userId: user.id,
        provider: "chariow",
        checkoutId: `chk_fail_${Date.now()}`,
        plan: "starter",
        amount: 2000,
        currency: "XOF",
        credits: 200,
        status: "PENDING",
      },
    })
    const balanceBefore = await getBalance(user.id)

    const body = JSON.stringify({ event: "payment.failed", data: { id: payment.checkoutId!, status: "failed" } })
    const res = await webhookRoute.POST(webhookRequest(body, sign(body)))
    expect(res.status).toBe(200)

    const updated = await db.payment.findUniqueOrThrow({ where: { id: payment.id } })
    expect(updated.status).toBe("FAILED")
    expect(await getBalance(user.id)).toBeCloseTo(balanceBefore, 3)
  })
})

// ---------- 3. Credit Ledger — atomicité ----------

describe("Credit Ledger — toute variation est journalisée", () => {
  test("grantCredits crée l'écriture et met à jour le solde", async () => {
    const before = await getBalance(user.id)
    const { balanceAfter } = await grantCredits(user.id, 10, { type: "BONUS", description: "bonus test" })
    expect(balanceAfter).toBeCloseTo(before + 10, 3)
    const tx = await db.transaction.findFirst({
      where: { userId: user.id, type: "BONUS" },
      orderBy: { createdAt: "desc" as const },
    })
    expect(tx).toBeTruthy()
    expect(tx!.balanceAfter).toBeCloseTo(balanceAfter, 3)
  })

  test("chargeCredits débite atomiquement et journalise le négatif", async () => {
    const before = await getBalance(user.id)
    const { balanceAfter } = await chargeCredits(user.id, 2.5, { type: "USAGE", description: "usage test" })
    expect(balanceAfter).toBeCloseTo(before - 2.5, 3)
    const tx = await db.transaction.findFirst({
      where: { userId: user.id, type: "USAGE" },
      orderBy: { createdAt: "desc" as const },
    })
    expect(tx!.amount).toBe(-2.5)
    expect(tx!.balanceAfter).toBeCloseTo(balanceAfter, 3)
  })

  test("solde insuffisant → InsufficientCreditsError, solde INTACT", async () => {
    const before = await getBalance(user.id)
    await expect(
      chargeCredits(user.id, before + 1000, { type: "USAGE", description: "débit impossible" })
    ).rejects.toThrow(InsufficientCreditsError)
    expect(await getBalance(user.id)).toBeCloseTo(before, 3)
  })

  test("débit nul : aucune écriture parasite au journal", async () => {
    const countBefore = await db.transaction.count({ where: { userId: user.id } })
    const { balanceAfter } = await chargeCredits(user.id, 0, { type: "USAGE", description: "néant" })
    expect(balanceAfter).toBeCloseTo(await getBalance(user.id), 3)
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(countBefore)
  })
})

// ---------- 4. Guards d'authentification ----------

describe("requireUser / requireAdmin — protection des routes", () => {
  const GUARD_URL = "http://localhost:3000/api/admin"

  test("sans cookie → ApiError 401 UNAUTHENTICATED", async () => {
    const req = new NextRequest(GUARD_URL)
    try {
      await requireUser(req)
      throw new Error("devrait avoir levé")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(401)
      expect((err as ApiError).code).toBe("UNAUTHENTICATED")
    }
  })

  test("token de session inconnu → 401", async () => {
    const req = new NextRequest(GUARD_URL, {
      headers: { cookie: "g3ia_session=" + "0".repeat(64) },
    })
    await expect(requireUser(req)).rejects.toThrow("Authentification requise")
  })

  test("session valide → l'utilisateur est renvoyé", async () => {
    const token = await createSession(user.id)
    try {
      const req = new NextRequest(GUARD_URL, { headers: { cookie: `g3ia_session=${token}` } })
      const resolved = await requireUser(req)
      expect(resolved.id).toBe(user.id)
    } finally {
      await destroySession(token)
    }
  })

  test("session expirée → 401 (et purge de la ligne)", async () => {
    const token = await createSession(user.id)
    await db.session.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
    try {
      const req = new NextRequest(GUARD_URL, { headers: { cookie: `g3ia_session=${token}` } })
      await expect(requireUser(req)).rejects.toThrow("Authentification")
    } finally {
      await destroySession(token)
    }
  })

  test("utilisateur non-admin → requireAdmin lève 403 FORBIDDEN", async () => {
    const token = await createSession(user.id)
    try {
      const req = new NextRequest(GUARD_URL, { headers: { cookie: `g3ia_session=${token}` } })
      try {
        await requireAdmin(req)
        throw new Error("devrait avoir levé")
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError)
        expect((err as ApiError).status).toBe(403)
        expect((err as ApiError).code).toBe("FORBIDDEN")
      }
    } finally {
      await destroySession(token)
    }
  })

  test("admin authentifié → requireAdmin renvoie l'admin", async () => {
    const token = await createSession(admin.id)
    try {
      const req = new NextRequest(GUARD_URL, { headers: { cookie: `g3ia_session=${token}` } })
      const resolved = await requireAdmin(req)
      expect(resolved.id).toBe(admin.id)
      expect(resolved.role).toBe("ADMIN")
    } finally {
      await destroySession(token)
    }
  })
})
