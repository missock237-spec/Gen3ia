import crypto from "crypto"

/**
 * Clés API GEN3IA — format : g3ia_live_<48 hex>.
 * Seul le SHA-256 est stocké ; le secret complet n'est visible qu'une fois,
 * à la création. Préfixe conservé en clair pour l'identification.
 */

export interface GeneratedKey {
  secret: string
  prefix: string
  keyHash: string
}

export function generateApiKey(): GeneratedKey {
  const secret = `g3ia_live_${crypto.randomBytes(24).toString("hex")}`
  return {
    secret,
    prefix: secret.slice(0, 16),
    keyHash: hashApiKey(secret),
  }
}

export function hashApiKey(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex")
}

/** Comparaison à temps constant pour l'authentification par clé. */
export function verifyApiKey(secret: string, keyHash: string): boolean {
  const candidate = hashApiKey(secret)
  const a = Buffer.from(candidate, "hex")
  const b = Buffer.from(keyHash, "hex")
  if (a.length !== b.length || a.length === 0) return false
  return crypto.timingSafeEqual(a, b)
}
