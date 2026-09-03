import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import {
  encryptJson,
  decryptJson,
  needsRotation,
  parseKeyring,
  getKeyring,
  activeKey,
  keyringStatus,
  signState,
  verifyState,
  generatePkcePair,
  pkceChallengeFrom,
} from "@/lib/connectors/core/crypto"
import { generateRotationKey, buildTransitionKeyringSpec } from "@/lib/connectors/core/rotation"

/**
 * v3.6 — Rotation des clés de chiffrement des connecteurs :
 *  1. keyring multi-versions (v2:keyId:iv:tag:data) ;
 *  2. compatibilité lecture de l'ancien format v1 ;
 *  3. re-chiffrement transparent (needsRotation) ;
 *  4. états OAuth signés avant rotation toujours vérifiables ;
 *  5. protocole prepare → transition sans downtime.
 */

const ORIGINAL_KEYS = process.env.CONNECTORS_ENCRYPTION_KEYS
const ORIGINAL_KEY = process.env.CONNECTORS_ENCRYPTION_KEY

const KEY_A = "a".repeat(64)
const KEY_B = "b".repeat(64)

beforeAll(() => {
  delete process.env.CONNECTORS_ENCRYPTION_KEYS
  process.env.CONNECTORS_ENCRYPTION_KEY = KEY_A
})

afterAll(() => {
  if (ORIGINAL_KEYS === undefined) delete process.env.CONNECTORS_ENCRYPTION_KEYS
  else process.env.CONNECTORS_ENCRYPTION_KEYS = ORIGINAL_KEYS
  if (ORIGINAL_KEY === undefined) delete process.env.CONNECTORS_ENCRYPTION_KEY
  else process.env.CONNECTORS_ENCRYPTION_KEY = ORIGINAL_KEY
})

describe("parseKeyring", () => {
  test("parse la liste ordonnée (première = active)", () => {
    const ring = parseKeyring(`k20260904-01:${KEY_A};kOld:${KEY_B}`)
    expect(ring).toHaveLength(2)
    expect(ring[0].id).toBe("k20260904-01")
    expect(ring[0].key.toString("hex")).toBe(KEY_A)
    expect(ring[1].id).toBe("kOld")
    expect(ring[1].key.toString("hex")).toBe(KEY_B)
  })

  test("ignore les entrées invalides sans échouer", () => {
    const ring = parseKeyring(`;sans-deux-points;ok:${KEY_B};`)
    expect(ring).toHaveLength(1)
    expect(ring[0].id).toBe("ok")
  })
})

describe("Format v2 multi-clés", () => {
  test("chiffre avec la clé active et cite son keyId", () => {
    const payload = encryptJson({ access_token: "secret-abc" })
    const parts = payload.split(":")
    expect(parts[0]).toBe("v2")
    expect(parts[1]).toBe("v1") // CONNECTORS_ENCRYPTION_KEY mono-clé → id "v1"
    expect(decryptJson<{ access_token: string }>(payload).access_token).toBe("secret-abc")
  })

  test("payloads de différentes clés coexistent pendant la transition", () => {
    process.env.CONNECTORS_ENCRYPTION_KEYS = `new:${KEY_A};old:${KEY_B}`
    const secret = { refresh_token: "rt-42", scope: "repo" }

    // Chiffré avec la clé ACTIVE (new).
    const withNew = encryptJson(secret, { key: activeKey() })
    // Chiffré avec l'ancienne (old) — simulation de données pré-rotation.
    const withOld = encryptJson(secret, { key: { id: "old", key: Buffer.from(KEY_B, "hex") } })

    expect(withNew.split(":")[1]).toBe("new")
    expect(withOld.split(":")[1]).toBe("old")
    // Les DEUX restent déchiffrables avec le keyring de transition.
    expect(decryptJson<typeof secret>(withNew).refresh_token).toBe("rt-42")
    expect(decryptJson<typeof secret>(withOld).refresh_token).toBe("rt-42")

    // Clé absente du ring → erreur explicite (pas de silence).
    const orphan = encryptJson(secret, { key: { id: "ghost", key: Buffer.from("c".repeat(64), "hex") } })
    expect(() => decryptJson(orphan)).toThrow(/absente du keyring/)
  })

  test("needsRotation détecte v1 et clé non active", () => {
    process.env.CONNECTORS_ENCRYPTION_KEYS = `new:${KEY_A};old:${KEY_B}`
    const active = encryptJson({ a: 1 }, { key: activeKey() })
    const stale = encryptJson({ a: 1 }, { key: { id: "old", key: Buffer.from(KEY_B, "hex") } })
    const legacy = `v1:${"0".repeat(24)}:${"0".repeat(32)}:${"ab".repeat(16)}`

    expect(needsRotation(active)).toBe(false)
    expect(needsRotation(stale)).toBe(true)
    expect(needsRotation(legacy)).toBe(true)
  })

  test("tampering : tag GCM invalide → refus", () => {
    const payload = encryptJson({ t: 1 })
    const parts = payload.split(":")
    parts[3] = "ff".repeat(16) // tag falsifié
    expect(() => decryptJson(parts.join(":"))).toThrow()
  })
})

describe("Compatibilité v1 legacy", () => {
  test("un payload v1 historique reste déchiffrable", () => {
    // Re-produit le format v1 avec la clé mono-version courante.
    const { createCipheriv, randomBytes } = require("node:crypto") as typeof import("node:crypto")
    const key = Buffer.from(KEY_A, "hex")
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", key, iv)
    const ct = Buffer.concat([cipher.update(JSON.stringify({ legacy: true }), "utf8"), cipher.final()])
    const v1Payload = `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ct.toString("hex")}`

    expect(decryptJson<{ legacy: boolean }>(v1Payload).legacy).toBe(true)
    expect(needsRotation(v1Payload)).toBe(true)
  })
})

describe("États OAuth pendant rotation", () => {
  test("un state signé avec une clé non active reste vérifiable", () => {
    process.env.CONNECTORS_ENCRYPTION_KEYS = `new:${KEY_A}`
    // State signé AVANT la rotation (clé mono v1 = KEY_A via CONNECTORS_ENCRYPTION_KEY).
    const state = signState("req_123", "user_1", "github")
    expect(verifyState(state, "user_1", "github")).toBe("req_123")

    // Rotation : la nouvelle clé devient active, l'ancienne reste dans le ring.
    process.env.CONNECTORS_ENCRYPTION_KEYS = `new:${KEY_B};old:${KEY_A}`
    expect(verifyState(state, "user_1", "github")).toBe("req_123")

    // Falsifié → refus.
    expect(verifyState(`${"req_123"}.deadbeef`, "user_1", "github")).toBeNull()
    expect(verifyState(state, "user_2", "github")).toBeNull()
  })
})

describe("keyringStatus", () => {
  test("expose la clé active et le mode rotation", () => {
    process.env.CONNECTORS_ENCRYPTION_KEYS = `new:${KEY_A};old:${KEY_B}`
    const status = keyringStatus()
    expect(status.activeKeyId).toBe("new")
    expect(status.keyCount).toBe(2)
    expect(status.multiKeyRotation).toBe(true)
    delete process.env.CONNECTORS_ENCRYPTION_KEYS
    const mono = keyringStatus()
    expect(mono.activeKeyId).toBe("v1")
    expect(mono.multiKeyRotation).toBe(false)
  })
})

describe("Protocole de rotation (rotation.ts)", () => {
  test("generateRotationKey produit hex64 + keyId daté", () => {
    const { keyId, keyHex } = generateRotationKey()
    expect(keyHex).toMatch(/^[0-9a-f]{64}$/)
    expect(keyId).toMatch(/^k\d{8}-[0-9a-f]{6}$/)
  })

  test("buildTransitionKeyringSpec : nouvelle clé en tête, anciennes conservées", () => {
    const current = getKeyring()
    const spec = buildTransitionKeyringSpec({ newKeyId: "kNew", newKeyHex: KEY_B, current })
    const ring = parseKeyring(spec)
    expect(ring[0].id).toBe("kNew")
    expect(ring[0].key.toString("hex")).toBe(KEY_B)
    expect(ring.length).toBe(current.length + 1)
  })
})

describe("PKCE inchangé (non régression)", () => {
  test("challenge S256 conforme RFC 7636", () => {
    const { verifier, challenge } = generatePkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(pkceChallengeFrom(verifier)).toBe(challenge)
  })
})
