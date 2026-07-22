// ============================================================
// AUTH — Hachage et vérification des mots de passe
// Utilise argon2id (recommandé OWASP 2026)
// ============================================================

import * as argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,      // 64 MB
  timeCost: 3,            // 3 itérations
  parallelism: 4,         // 4 threads
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

  if (password.length < 12) {
    reasons.push("Le mot de passe doit contenir au moins 12 caractères");
  }
  if (!/[A-Z]/.test(password)) {
    reasons.push("Le mot de passe doit contenir au moins une majuscule");
  }
  if (!/[a-z]/.test(password)) {
    reasons.push("Le mot de passe doit contenir au moins une minuscule");
  }
  if (!/[0-9]/.test(password)) {
    reasons.push("Le mot de passe doit contenir au moins un chiffre");
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    reasons.push("Le mot de passe doit contenir au moins un caractère spécial");
  }

  return { valid: reasons.length === 0, reasons };
}