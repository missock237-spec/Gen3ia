/**
 * Chiffrement des secrets de connexion — AES-256-GCM + KEYRING multi-versions.
 *
 * Les tokens d'accès, refresh tokens et clés d'API ne sont JAMAIS
 * persistés en clair : chaque payload ConnectionData est chiffré
 * avant écriture en base (colonne ConnectedAccount.encryptedData)
 * et déchiffré uniquement en mémoire au moment de l'exécution.
 *
 * ROTATION SANS DOWNTIME (v3.6) :
 *  - variable CONNECTORS_ENCRYPTION_KEYS = "idActif:hex64;idAncien:hex64"
 *    (PREMIÈRE clé = active pour chiffrer, les suivantes restent capables
 *    de déchiffrer pendant la transition) ;
 *  - format de payload v2:<keyId>:<iv>:<tag>:<ct> → chaque secret sait avec
 *    quelle clé il est chiffré ; l'ancien format v1:… reste lisible (clé
 *    dérivée CONNECTORS_ENCRYPTION_KEY/SESSION_SECRET) ;
 *  - re-chiffrement PARESSEUX : à chaque lecture d'un secret encore en v1 ou
 *    en clé non active, la ligne est ré-écrite avec la clé active
 *    (cf. connections.ts → decryptConnectionData) — aucun downtime, aucune
 *    double écriture bloquante ;
 *  - endpoint admin /api/admin/crypto/rotate + CLI scripts/rotate-connectors-key.mjs
 *    pour générer une clé, re-chiffrer tout l'existant et produire la ligne
 *    d'environnement à poser sur l'hébergeur.
 *
 * Clé maître (compat) : CONNECTORS_ENCRYPTION_KEY (hex 64, ou base64). En
 * son absence, une clé dérivée de SESSION_SECRET est utilisée (dev only).
 */

import crypto from "node:crypto"
import { logger } from "@/lib/observability/logger"

const FALLBACK_HINT =
  "CONNECTORS_ENCRYPTION_KEY absente : clé dérivée de SESSION_SECRET (développement uniquement)."

// ─── Keyring multi-versions (rotation sans downtime) ───────────

export interface KeyringEntry {
  id: string
  key: Buffer
}

/** Normalise un matériau de clé (hex 64 / base64 / phrase) en 32 octets. */
function normalizeKeyMaterial(material: string): Buffer {
  const trimmed = material.trim()
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex")
  try {
    const b = Buffer.from(trimmed, "base64")
    if (b.length === 32) return b
  } catch {
    /* format invalide : on hache */
  }
  return crypto.createHash("sha256").update(trimmed).digest()
}

const LEGACY_KEY_ID = "v1"

function legacyMasterKey(): Buffer {
  const dedicated = process.env.CONNECTORS_ENCRYPTION_KEY?.trim()
  if (dedicated) return normalizeKeyMaterial(dedicated)
  const session = process.env.SESSION_SECRET ?? "gen3ia-dev-secret"
  if (process.env.NODE_ENV === "production") {
    logger.warn(FALLBACK_HINT)
  }
  return crypto.createHash("sha256").update(`connectors:${session}`).digest()
}

/**
 * Parse la liste de clés "idA:hex64;idB:hex64" (première = ACTIVE).
 * Les entrées invalides sont ignorées avec un avertissement (jamais fatal).
 */
export function parseKeyring(spec: string): KeyringEntry[] {
  const entries: KeyringEntry[] = []
  for (const part of spec.split(";")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(":")
    if (idx <= 0) continue
    const id = trimmed.slice(0, idx).trim()
    const material = trimmed.slice(idx + 1).trim()
    if (!id || !material) continue
    entries.push({ id, key: normalizeKeyMaterial(material) })
  }
  return entries
}

/**
 * Keyring effectif :
 *  1. CONNECTORS_ENCRYPTION_KEYS (multi-clés, rotation) ;
 *  2. sinon CONNECTORS_ENCRYPTION_KEY (mono-clé, id "v1") ;
 *  3. sinon SESSION_SECRET dérivée (développement).
 */
export function getKeyring(): KeyringEntry[] {
  const multi = process.env.CONNECTORS_ENCRYPTION_KEYS?.trim()
  if (multi) {
    const entries = parseKeyring(multi)
    if (entries.length > 0) return entries
  }
  return [{ id: LEGACY_KEY_ID, key: legacyMasterKey() }]
}

/** Clé ACTIVE (chiffre les nouvelles écritures) — première du keyring. */
export function activeKey(): KeyringEntry {
  const ring = getKeyring()
  return ring[0]
}

export function keyringStatus() {
  const ring = getKeyring()
  return {
    activeKeyId: ring[0]?.id,
    keys: ring.map((k) => ({ id: k.id })),
    keyCount: ring.length,
    legacyFallback: !process.env.CONNECTORS_ENCRYPTION_KEYS && !process.env.CONNECTORS_ENCRYPTION_KEY,
    multiKeyRotation: ring.length > 1,
  }
}

/** Chiffre un objet → "v2:<keyId>:<iv-hex>:<tag-hex>:<ct-hex>" (clé active). */
export function encryptJson(value: unknown, opts?: { key?: KeyringEntry }): string {
  const entry = opts?.key ?? activeKey()
  const plaintext = Buffer.from(JSON.stringify(value), "utf8")
  const iv = crypto.randomBytes(12) // GCM standard : 96 bits
  const cipher = crypto.createCipheriv("aes-256-gcm", entry.key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v2:${entry.id}:${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`
}

/**
 * Déchiffre un payload "v2:…" ou "v1:…" (legacy).
 * Le keyring complet est essayé pour v1 ; pour v2, la clé identifiée.
 * @param opts.keyring override (rotation admin : anncienne+ future clés)
 */
export function decryptJson<T>(payload: string, opts?: { keyring?: KeyringEntry[] }): T {
  const parts = payload.split(":")
  if (parts.length === 5 && parts[0] === "v2") {
    const [, keyId, ivHex, tagHex, dataHex] = parts
    const ring = opts?.keyring ?? getKeyring()
    const entry = ring.find((k) => k.id === keyId)
    if (!entry) {
      throw new Error(
        `Clé de chiffrement « ${keyId} » absente du keyring (rotation incomplète ? vérifiez CONNECTORS_ENCRYPTION_KEYS).`
      )
    }
    return decryptAesGcm(entry.key, ivHex, tagHex, dataHex)
  }
  if (parts.length === 4 && parts[0] === "v1") {
    // Legacy : la clé mono-version historique — ou toute clé du ring id "v1".
    const [, ivHex, tagHex, dataHex] = parts
    const ring = opts?.keyring ?? getKeyring()
    const legacy = ring.find((k) => k.id === LEGACY_KEY_ID) ?? { id: LEGACY_KEY_ID, key: legacyMasterKey() }
    return decryptAesGcm(legacy.key, ivHex, tagHex, dataHex)
  }
  throw new Error("Payload chiffré invalide (format attendu v2:keyId:iv:tag:data ou v1:iv:tag:data).")
}

function decryptAesGcm(key: Buffer, ivHex: string, tagHex: string, dataHex: string): any {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8")
  return JSON.parse(plaintext)
}

/**
 * true si le payload n'est PAS chiffré avec la clé active
 * (v1 legacy, ou v2 avec un keyId ≠ actif) → à re-chiffrer paresseusement.
 */
export function needsRotation(payload: string, opts?: { keyring?: KeyringEntry[] }): boolean {
  const active = (opts?.keyring ?? getKeyring())[0]
  const parts = payload.split(":")
  if (parts.length === 5 && parts[0] === "v2") return parts[1] !== active.id
  if (parts.length === 4 && parts[0] === "v1") return true
  return true
}

/** Test d'intégrité (roundtrip) — utilisé par les tests unitaires. */
export function isEncryptableRoundtrip(value: unknown): boolean {
  try {
    return JSON.stringify(decryptJson(encryptJson(value))) === JSON.stringify(value)
  } catch {
    return false
  }
}

// ─── État anti-rejeu du flux OAuth (state + PKCE) ───────────

/**
 * Signe un `state` OAuth (anti-CSRF) : "reqId.hmac" avec la clé ACTIVE.
 * La vérification accepte TOUTES les clés du keyring (états OAuth en vol
 * pendant une rotation : zéro interruption des connexions en cours).
 */
export function signState(requestId: string, userId: string, appSlug: string): string {
  const mac = crypto.createHmac("sha256", activeKey().key)
  mac.update(`${requestId}:${userId}:${appSlug}`)
  return `${requestId}.${mac.digest("hex")}`
}

/** Vérifie un state signé (toutes clés du ring). Retourne l'ID de requête si valide. */
export function verifyState(state: string, userId: string, appSlug: string): string | null {
  const [requestId, macHex] = state.split(".")
  if (!requestId || !macHex) return null
  for (const entry of getKeyring()) {
    const mac = crypto.createHmac("sha256", entry.key)
    mac.update(`${requestId}:${userId}:${appSlug}`)
    const expected = mac.digest("hex")
    const a = Buffer.from(macHex, "hex")
    const b = Buffer.from(expected, "hex")
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return requestId
  }
  return null
}

// ─── PKCE (RFC 7636) ─────────────────────────────────────────

/** Génère un code_verifier cryptographiquement aléatoire (43-128 chars). */
export function generatePkceVerifier(): string {
  return crypto.randomBytes(48).toString("base64url") // 64 chars
}

/** Dérive le code_challenge S256 du verifier. */
export function pkceChallengeFrom(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url")
}

/** Génère le couple complet { verifier, challenge }. */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = generatePkceVerifier()
  return { verifier, challenge: pkceChallengeFrom(verifier) }
}

// ─── Google Service Account → OAuth2 access token (RFC 7523) ─

interface GsaCredentials {
  client_email: string
  private_key: string
  token_uri?: string
}

/**
 * Échange un compte de service Google contre un access token
 * (JWT assertion signé RS256 — RFC 7523 JSON Web Token Profile).
 * Retourne le token + sa date d'expiration absolue.
 */
export async function googleServiceAccountAccessToken(
  credentialsJson: string,
  scopes: string[]
): Promise<{ accessToken: string; expiresAt: string }> {
  const creds = JSON.parse(credentialsJson) as GsaCredentials
  if (!creds.client_email || !creds.private_key) {
    throw new Error("Identifiants de compte de service Google incomplets.")
  }
  const tokenUri = creds.token_uri ?? "https://oauth2.googleapis.com/token"
  const iat = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const claimSet = {
    iss: creds.client_email,
    scope: scopes.join(" "),
    aud: tokenUri,
    iat,
    exp: iat + 3600,
  }
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url")
  const unsigned = `${b64(header)}.${b64(claimSet)}`
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(creds.private_key.replace(/\\n/g, "\n"), "base64url")
  const assertion = `${unsigned}.${signature}`

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Échange compte de service Google échoué : HTTP ${res.status} ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  }
}
