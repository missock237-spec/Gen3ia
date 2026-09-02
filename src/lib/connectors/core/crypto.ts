/**
 * Chiffrement des secrets de connexion — AES-256-GCM.
 *
 * Les tokens d'accès, refresh tokens et clés d'API ne sont JAMAIS
 * persistés en clair : chaque payload ConnectionData est chiffré
 * avant écriture en base (colonne ConnectedAccount.encryptedData)
 * et déchiffré uniquement en mémoire au moment de l'exécution.
 *
 * Clé maître : CONNECTORS_ENCRYPTION_KEY (hex 64 caractères = 32 octets,
 * ou base64). En son absence, une clé dérivée de SESSION_SECRET est
 * utilisée (SHA-256) pour que le développement reste fluide — en
 * production il faut définir une CONNECTORS_ENCRYPTION_KEY dédiée.
 */

import crypto from "node:crypto"
import { logger } from "@/lib/observability/logger"

const FALLBACK_HINT =
  "CONNECTORS_ENCRYPTION_KEY absente : clé dérivée de SESSION_SECRET (développement uniquement)."

/** Récupère la clé maître (32 octets) — priorité à la clé dédiée. */
function masterKey(): Buffer {
  const dedicated = process.env.CONNECTORS_ENCRYPTION_KEY?.trim()
  if (dedicated) {
    // Hex (64 chars) ou base64 — sinon hachage déterministe.
    if (/^[0-9a-fA-F]{64}$/.test(dedicated)) return Buffer.from(dedicated, "hex")
    try {
      const b = Buffer.from(dedicated, "base64")
      if (b.length === 32) return b
    } catch {
      /* format invalide : on hache */
    }
    return crypto.createHash("sha256").update(dedicated).digest()
  }
  const session = process.env.SESSION_SECRET ?? "gen3ia-dev-secret"
  if (process.env.NODE_ENV === "production") {
    logger.warn(fallbackMessage())
  }
  return crypto.createHash("sha256").update(`connectors:${session}`).digest()
}

function fallbackMessage(): string {
  return FALLBACK_HINT
}

/** Chiffre un objet → "v1:<iv-hex>:<tag-hex>:<ciphertext-hex>". */
export function encryptJson(value: unknown): string {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8")
  const iv = crypto.randomBytes(12) // GCM standard : 96 bits
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`
}

/** Déchiffre un payload "v1:…" — lève une erreur explicite si invalide. */
export function decryptJson<T>(payload: string): T {
  const parts = payload.split(":")
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Payload chiffré invalide (format attendu v1:iv:tag:data).")
  }
  const [, ivHex, tagHex, dataHex] = parts
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8")
  return JSON.parse(plaintext) as T
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
 * Signe un `state` OAuth (anti-CSRF) : "reqId.hmac".
 * Le HMAC lie la requête de connexion à l'utilisateur et à l'app.
 */
export function signState(requestId: string, userId: string, appSlug: string): string {
  const mac = crypto.createHmac("sha256", masterKey())
  mac.update(`${requestId}:${userId}:${appSlug}`)
  return `${requestId}.${mac.digest("hex")}`
}

/** Vérifie un state signé. Retourne l'ID de requête si valide. */
export function verifyState(state: string, userId: string, appSlug: string): string | null {
  const [requestId, macHex] = state.split(".")
  if (!requestId || !macHex) return null
  const expected = signState(requestId, userId, appSlug)
  const a = Buffer.from(state.split(".")[1] ?? "", "hex")
  const b = Buffer.from(expected.split(".")[1] ?? "", "hex")
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return requestId
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
