/**
 * Politique de mot de passe — partagée client (UI d'inscription) et serveur.
 * Exigences : 12 caractères minimum, au moins une majuscule, une minuscule
 * et un caractère spécial. Aucun hash ici (voir lib/auth/password.ts) :
 * ce module est volontairement sans dépendance pour être importé côté client.
 */

export const PASSWORD_MIN_LENGTH = 12;

/** Caractères spéciaux acceptés (ponctuation et symboles courants). */
const SPECIAL_CHARS = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~§¤°`´]/;

export interface PasswordStrength {
  valid: boolean
  checks: {
    length: boolean
    uppercase: boolean
    lowercase: boolean
    special: boolean
  }
}

/** Évalue la conformité d'un mot de passe à la politique. */
export function validatePasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    special: SPECIAL_CHARS.test(password),
  }
  return {
    valid: checks.length && checks.uppercase && checks.lowercase && checks.special,
    checks,
  }
}

/** Liste des exigences non satisfaites (messages d'aide). */
export function failedRequirements(password: string): string[] {
  const { checks } = validatePasswordStrength(password)
  const missing: string[] = []
  if (!checks.length) missing.push(`au moins ${PASSWORD_MIN_LENGTH} caractères`)
  if (!checks.uppercase) missing.push("au moins une majuscule")
  if (!checks.lowercase) missing.push("au moins une minuscule")
  if (!checks.special) missing.push("au moins un caractère spécial")
  return missing
}
