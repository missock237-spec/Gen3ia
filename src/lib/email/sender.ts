// Email Sender — envoi unifié d'emails via Resend API ou SMTP.
//
// Priorité :
//   1. Si RESEND_API_KEY est défini → Resend API (recommandé en production)
//   2. Sinon, si SMTP_HOST/USER/PASS sont définis et réels → SMTP
//   3. Sinon → erreur explicite (pas de mock en production)
//
// Pour le dev sans clé, le système fonctionne en mode mock via src/lib/email.ts.

import nodemailer from 'nodemailer';

interface EmailResult {
  success: boolean;
  messageId?: string;
  id?: string;
  error?: string;
  provider?: 'resend' | 'smtp';
}

interface EmailOpts {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

// --- Configuration ---

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

function getSMTPConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const fromName = process.env.SMTP_FROM_NAME
    || process.env.EMAIL_FROM_NAME
    || 'Gen3ia';
  const fromEmail = process.env.SMTP_FROM_EMAIL
    || process.env.EMAIL_FROM
    || 'onboarding@resend.dev';

  // Détecte les placeholders non remplacés
  const isPlaceholder = (v?: string) => !v || v.includes('your-');
  if (!host || isPlaceholder(user) || isPlaceholder(pass)) return null;
  return { host, port, secure, user, pass, fromName, fromEmail };
}

function getFromHeader(): string {
  const fromName = process.env.SMTP_FROM_NAME
    || process.env.EMAIL_FROM_NAME
    || 'Gen3ia';
  const fromEmail = process.env.SMTP_FROM_EMAIL
    || process.env.EMAIL_FROM
    || 'onboarding@resend.dev';
  // sanitize pour éviter les injections d'en-têtes
  const safeName = fromName.replace(/"/g, '\\"').replace(/[\r\n]/g, '');
  const safeEmail = fromEmail.replace(/[<>"\r\n]/g, '');
  return `"${safeName}" <${safeEmail}>`;
}

let _smtpTransport: nodemailer.Transporter | null = null;

// --- API publique ---

export async function sendEmail(options: EmailOpts): Promise<EmailResult> {
  // 1) Resend API en priorité si la clé est configurée
  if (RESEND_API_KEY) {
    return sendViaResend(options);
  }

  // 2) Fallback SMTP
  const config = getSMTPConfig();
  if (!config) {
    return {
      success: false,
      error: 'Aucun moyen d\'envoi configuré. Définissez RESEND_API_KEY (recommandé) ou SMTP_HOST/SMTP_USER/SMTP_PASS.',
    };
  }

  try {
    if (!_smtpTransport) {
      _smtpTransport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
        tls: { rejectUnauthorized: false },
      });
    }
    const info = await _smtpTransport.sendMail({
      from: getFromHeader(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' '),
      replyTo: options.replyTo,
    });
    return { success: true, messageId: info.messageId, provider: 'smtp' };
  } catch (err) {
    console.warn('[Email] SMTP a échoué:', err instanceof Error ? err.message : '?');
    _smtpTransport = null; // reset pour prochaine tentative
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur SMTP',
      provider: 'smtp',
    };
  }
}

async function sendViaResend(options: EmailOpts): Promise<EmailResult> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getFromHeader(),
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' '),
        reply_to: options.replyTo,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        provider: 'resend',
        error: 'Resend: ' + (data.message || data.error || JSON.stringify(data)),
      };
    }
    return { success: true, provider: 'resend', id: data.id, messageId: data.id };
  } catch (error) {
    return {
      success: false,
      provider: 'resend',
      error: 'Resend: ' + (error instanceof Error ? error.message : 'Erreur'),
    };
  }
}

// --- Diagnostic ---

export async function verifyConnection(): Promise<{
  connected: boolean;
  method?: 'resend' | 'smtp' | 'none';
  error?: string;
  details?: Record<string, unknown>;
}> {
  // Test Resend : on appelle GET /domains (plus représentatif que GET /emails)
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + RESEND_API_KEY },
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        const domains = Array.isArray(body?.data) ? body.data : [];
        const verified = domains.filter((d: { status?: string }) => d.status === 'verified');
        return {
          connected: true,
          method: 'resend',
          details: {
            totalDomains: domains.length,
            verifiedDomains: verified.length,
            domains: domains.map((d: { name?: string; status?: string }) => ({ name: d.name, status: d.status })),
          },
        };
      }
      return {
        connected: false,
        method: 'resend',
        error: `Resend API a renvoyé HTTP ${res.status}`,
        details: body,
      };
    } catch (e) {
      return {
        connected: false,
        method: 'resend',
        error: 'Resend API inaccessible: ' + (e instanceof Error ? e.message : '?'),
      };
    }
  }

  // Test SMTP
  const config = getSMTPConfig();
  if (!config) {
    return {
      connected: false,
      method: 'none',
      error: 'Ni RESEND_API_KEY ni SMTP_* configuré',
    };
  }
  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false },
    });
    await transport.verify();
    return { connected: true, method: 'smtp' };
  } catch (error) {
    return {
      connected: false,
      method: 'smtp',
      error: error instanceof Error ? error.message : 'Erreur SMTP',
    };
  }
}

export function getEmailConfig() {
  if (RESEND_API_KEY) {
    return {
      method: 'resend' as const,
      apiKeyPrefix: RESEND_API_KEY.slice(0, 6) + '…',
      fromEmail: process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || 'onboarding@resend.dev',
      fromName: process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Gen3ia',
    };
  }
  const smtp = getSMTPConfig();
  if (smtp) {
    return { method: 'smtp' as const, ...smtp };
  }
  return null;
}
