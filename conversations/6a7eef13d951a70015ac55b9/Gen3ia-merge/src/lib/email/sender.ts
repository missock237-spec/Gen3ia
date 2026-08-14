// Email Sender — envoi d'emails via SMTP ou fallback Resend API
// Pas besoin de serveur SMTP: Resend fonctionne avec une simple cle API

import nodemailer from 'nodemailer';

interface EmailResult { success: boolean; messageId?: string; error?: string; }
interface EmailOpts { to: string; subject: string; html: string; text?: string; }

let transportInstance: nodemailer.Transporter | null = null;
let useResend = false;

function getSMTPConfig() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const fromName = process.env.SMTP_FROM_NAME || 'Genova AI';
  const fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@genova.ai';
  if (!host || !user || !pass) return null;
  return { host, port, secure, user, pass, fromName, fromEmail };
}

export async function sendEmail(options: EmailOpts): Promise<EmailResult> {
  // Essayer SMTP d'abord
  if (!useResend && !transportInstance) {
    const config = getSMTPConfig();
    if (config) {
      try {
        transportInstance = nodemailer.createTransport({
          host: config.host, port: config.port, secure: config.secure,
          auth: { user: config.user, pass: config.pass },
          tls: { rejectUnauthorized: false },
        });
        const info = await transportInstance.sendMail({
          from: '"' + config.fromName.replace(/"/g, '\\"').replace(/\r\n/g, '') + '" <' + config.fromEmail.replace(/[<>"\r\n]/g, '') + '>',
          to: options.to, subject: options.subject,
          html: options.html, text: options.text || options.html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' '),
        });
        return { success: true, messageId: info.messageId };
      } catch (err) {
        console.log('[Email] SMTP echoue, fallback Resend:', err instanceof Error ? err.message : '?');
        transportInstance = null;
        useResend = true;
      }
    } else {
      useResend = true;
    }
  }

  // Fallback: Resend API (pas de SMTP requis)
  if (useResend) {
    return sendViaResend(options);
  }

  // Derniere tentative SMTP
  try {
    const config = getSMTPConfig();
    if (!config) return sendViaResend(options);
    const transport = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false },
    });
    const info = await transport.sendMail({
      from: '"' + config.fromName.replace(/"/g, '\\"').replace(/\r\n/g, '') + '" <' + config.fromEmail.replace(/[<>"\r\n]/g, '') + '>',
      to: options.to, subject: options.subject,
      html: options.html, text: options.text || options.html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' '),
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur envoi' };
  }
}

async function sendViaResend(options: EmailOpts): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: 'Aucun moyen d\'envoi configure. Ajoutez SMTP_* ou RESEND_API_KEY dans .env',
    };
  }

  const fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@genova.ai';
  const fromName = process.env.SMTP_FROM_NAME || 'Genova AI';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromName + ' <' + fromEmail + '>',
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' '),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: 'Resend: ' + (data.message || JSON.stringify(data)) };
    }
    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: 'Resend: ' + (error instanceof Error ? error.message : 'Erreur') };
  }
}

export async function verifyConnection() {
  // Si Resend est configure, tester
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY },
      });
      return { connected: res.ok, method: 'resend' };
    } catch {
      return { connected: false, method: 'none', error: 'Resend API inaccessible' };
    }
  }

  // Tester SMTP
  const config = getSMTPConfig();
  if (!config) {
    return { connected: false, method: 'none', error: 'Ni SMTP ni RESEND_API_KEY configure' };
  }
  try {
    const transport = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false },
    });
    await transport.verify();
    return { connected: true, method: 'smtp' };
  } catch (error) {
    return { connected: false, method: 'smtp', error: error instanceof Error ? error.message : 'Erreur' };
  }
}

export function getEmailConfig() {
  const smtp = getSMTPConfig();
  if (smtp) return { method: 'smtp' as const, ...smtp };
  if (process.env.RESEND_API_KEY) return { method: 'resend' as const, apiKey: process.env.RESEND_API_KEY.slice(0, 8) + '...' };
  return null;
}
