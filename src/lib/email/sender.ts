// Email Sender — envoi d'emails via SMTP direct (nodemailer)
// Fonctionne avec n'importe quel serveur SMTP sans dependance externe

import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transportInstance: nodemailer.Transporter | null = null;

export function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const fromName = process.env.SMTP_FROM_NAME || 'Genova AI';
  const fromEmail = process.env.SMTP_FROM_EMAIL || user || 'noreply@genova.ai';

  if (!host || !user || !pass) return null;
  return { host, port, secure, user, pass, fromName, fromEmail };
}

export function getTransport() {
  if (transportInstance) return transportInstance;
  const config = getEmailConfig();
  if (!config) return null;
  transportInstance = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false },
  });
  return transportInstance;
}

export async function sendEmail(options: EmailOptions) {
  const transport = getTransport();
  if (!transport) {
    return { success: false, error: 'SMTP non configure. Ajoutez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env' };
  }
  const config = getEmailConfig()!;
  try {
    const info = await transport.sendMail({
      from: '"' + config.fromName + '" <' + config.fromEmail + '>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[Email] Erreur:', msg);
    return { success: false, error: msg };
  }
}

export async function verifyConnection() {
  const transport = getTransport();
  if (!transport) return { connected: false, error: 'SMTP non configure' };
  try {
    await transport.verify();
    return { connected: true };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : 'Erreur' };
  }
}
