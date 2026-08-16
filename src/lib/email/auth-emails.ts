// Auth Emails — envoi automatique des emails d'authentification

import { sendEmail } from '@/lib/email/sender';
import { welcomeEmail, verifyEmailEmail, resetPasswordEmail, loginAlertEmail } from '@/lib/email/templates';

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const tpl = welcomeEmail(name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

export async function sendVerificationCode(to: string, name: string, code: string): Promise<boolean> {
  const tpl = verifyEmailEmail(code, name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

export async function sendPasswordReset(to: string, name: string, token: string): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const resetLink = baseUrl + '/reset-password?token=' + token;
  const tpl = resetPasswordEmail(resetLink, name);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}

export async function sendLoginAlert(to: string, name: string, ip: string, device: string, location: string): Promise<boolean> {
  const tpl = loginAlertEmail(name, ip, device, location);
  const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html });
  return result.success;
}
