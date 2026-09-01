import crypto from "crypto"

/**
 * Hachage de mot de passe avec scrypt (N=16384, r=8, p=1) et sel aléatoire.
 * Format stocké : scrypt$<saltHex>$<hashHex>
 */

const KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, KEYLEN)
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, saltHex, hashHex] = stored.split("$")
    if (algo !== "scrypt" || !saltHex || !hashHex) return false
    const salt = Buffer.from(saltHex, "hex")
    const expected = Buffer.from(hashHex, "hex")
    const actual = crypto.scryptSync(password, salt, expected.length)
    return crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
