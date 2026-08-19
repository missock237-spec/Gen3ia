// Auth Emails — envoi automatique des emails d'authentification
//
// Ce module expose deux styles d'API :
//   - sendVerificationCode / sendPasswordReset : basées sur un code/token (ancien style)
//   - sendVerificationLink / sendPasswordResetLink : basées sur un lien Firebase (nouveau style)
//
// Les routes Firebase (auth.ts) utilisent les versions *Link car Firebase génère
// des liens magiques. Les routes API legacy peuvent utiliser les versions code/token.

import { sendEmail } from '@/lib/email/sender';
import { welcomeEmail, verifyEmailLinkTemplate, resetPasswordEmail, loginAlertEmail } from '@/lib/email/templates';

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const tpl = welcomeEmail(name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

// --- Style lien Firebase (utilisé par firebase/auth.ts) ---

/** Envoie un email de vérification contenant un lien cliquable (généré par Firebase) */
export async function sendVerificationLink(to: string, name: string, link: string): Promise<boolean> {
  const tpl = verifyEmailLinkTemplate(link, name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

/** Envoie un email de reset mot de passe contenant un lien cliquable (généré par Firebase) */
export async function sendPasswordResetLink(to: string, name: string, link: string): Promise<boolean> {
  const tpl = resetPasswordEmail(link, name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

// --- Style code/token (legacy, pour les routes API directes) ---

/** Envoie un email avec un code de vérification à 6 chiffres */
export async function sendVerificationCode(to: string, name: string, code: string): Promise<boolean> {
  // Pour un code, on réutilise le template lien en insérant le code comme "lien"
  const tpl = verifyEmailLinkTemplate(code, name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

/** Envoie un email de reset avec un token (legacy) */
export async function sendPasswordReset(to: string, name: string, token: string): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia.online';
  const resetLink = baseUrl + '/reset-password?token=' + token;
  const tpl = resetPasswordEmail(resetLink, name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

// --- Autres emails ---

export async function sendLoginAlert(to: string, name: string, ip: string, device: string, location: string): Promise<boolean> {
  const tpl = loginAlertEmail(name, ip, device, location);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}
