import { describe, test, expect } from "bun:test"
import {
  encryptJson,
  decryptJson,
  isEncryptableRoundtrip,
  signState,
  verifyState,
  generatePkcePair,
  pkceChallengeFrom,
} from "@/lib/connectors/core/crypto"

/** Chiffrement AES-256-GCM des secrets de connexion. */
describe("connectors/crypto — AES-256-GCM", () => {
  test("aller-retour chiffrement/déchiffrement intégral", () => {
    const payload = {
      authScheme: "OAUTH2",
      status: "ACTIVE",
      access_token: "ya29.a0AfH6SMB...",
      refresh_token: "1//0g...",
      expires_at: "2026-09-03T10:00:00.000Z",
    }
    const enc = encryptJson(payload)
    // v3.6 : format versionné v2:<keyId>:<iv>:<tag>:<data> (keyring multi-clés).
    expect(enc.startsWith("v2:")).toBe(true)
    expect(enc.split(":")).toHaveLength(5)
    const dec = decryptJson<typeof payload>(enc)
    expect(dec).toEqual(payload)
  })

  test("le ciphertext ne contient jamais le secret en clair", () => {
    const enc = encryptJson({ api_key: "sk_live_SUPER_SECRET_42" })
    expect(enc).not.toContain("sk_live_SUPER_SECRET_42")
  })

  test("toute altération du payload est détectée (tag GCM)", () => {
    const enc = encryptJson({ token: "valeur" })
    const parts = enc.split(":")
    // Corromp le ciphertext (v2: clé en parts[4], iv en parts[2], tag en parts[3]).
    parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith("00") ? "01" : "00")
    expect(() => decryptJson(parts.join(":"))).toThrow()
    // Corromp le tag d'authentification.
    const parts2 = enc.split(":")
    parts2[3] = "ff".repeat(16)
    expect(() => decryptJson(parts2.join(":"))).toThrow()
  })

  test("roundtrip générique", () => {
    expect(isEncryptableRoundtrip({ a: 1, b: "x", c: [true, null] })).toBe(true)
  })

  test("format invalide rejeté explicitement", () => {
    expect(() => decryptJson("pas-un-format")).toThrow(/format attendu/)
  })
})

describe("connectors/crypto — state OAuth (anti-CSRF)", () => {
  test("state signé vérifié pour le bon couple (user, app)", () => {
    const state = signState("req123", "user1", "github")
    expect(verifyState(state, "user1", "github")).toBe("req123")
  })

  test("state refusé si utilisateur différent", () => {
    const state = signState("req123", "user1", "github")
    expect(verifyState(state, "user2", "github")).toBeNull()
  })

  test("state refusé si app différente", () => {
    const state = signState("req123", "user1", "github")
    expect(verifyState(state, "user1", "slack")).toBeNull()
  })

  test("state tronqué/format invalide rejeté", () => {
    expect(verifyState("abc", "user1", "github")).toBeNull()
    expect(verifyState("abc.def.ghi", "user1", "github")).toBeNull()
  })
})

describe("connectors/crypto — PKCE (RFC 7636)", () => {
  test("verifier entre 43 et 128 caractères", () => {
    const { verifier } = generatePkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  test("challenge = BASE64URL(SHA256(verifier)) — vecteur RFC 7636", () => {
    // Vecteur officiel de l'annexe B du RFC 7636.
    expect(pkceChallengeFrom("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    )
  })

  test("deux générations produisent des couples distincts", () => {
    const a = generatePkcePair()
    const b = generatePkcePair()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })
})
