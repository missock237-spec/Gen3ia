// ============================================================
// AUTH — Hachage et verification des mots de passe
// Utilise argon2id (recommandation OWASP 2026)
// ============================================================

import * as argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
  saltLength: 16,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (password.length < 8) reasons.push("Minimum 8 caractères");
  if (!/[A-Z]/.test(password)) reasons.push("Au moins une majuscule");
  if (!/[a-z]/.test(password)) reasons.push("Au moins une minuscule");
  if (!/[0-9]/.test(password)) reasons.push("Au moins un chiffre");
  // Minimum 12 pour validation complete, 8 pour compatibilite inscription
  return { valid: password.length >= 8 && reasons.length <= 1, reasons };
}
