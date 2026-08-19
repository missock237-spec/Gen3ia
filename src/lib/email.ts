// Email — envoi d'emails via Resend API (SDK)
// En production, RESEND_API_KEY doit être défini (déjà configuré sur Vercel).
// En dev sans clé, le système fonctionne en mode "mock" (log console uniquement).

import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.EMAIL_FROM
  || process.env.SMTP_FROM_EMAIL
  || 'onboarding@resend.dev';
const FROM_NAME = process.env.EMAIL_FROM_NAME
  || process.env.SMTP_FROM_NAME
  || 'Gen3ia';

// Instance Resend initialisée paresseusement (évite de planter en dev sans clé)
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(RESEND_API_KEY);
  return _resend;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType?: string;
  }>;
}

interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
  provider?: 'resend' | 'mock';
}

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 24px; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo img { width: 64px; height: 64px; border-radius: 12px; }
    h1 { font-size: 20px; font-weight: 700; color: #09090b; margin: 0 0 8px 0; }
    p { font-size: 14px; line-height: 1.6; color: #52525b; margin: 0 0 16px 0; }
    .btn { display: inline-block; padding: 12px 24px; background: #7c3aed; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 0; }
    .btn:hover { background: #6d28d9; }
    .footer { text-align: center; padding: 24px 0; color: #a1a1aa; font-size: 12px; }
    .footer a { color: #7c3aed; text-decoration: none; }
    .code { font-size: 32px; font-weight: 700; color: #7c3aed; text-align: center; padding: 16px; letter-spacing: 8px; background: #f4f4f5; border-radius: 8px; margin: 16px 0; }
    @media (max-width: 480px) { .card { padding: 16px; } }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo"><img src="${(process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia.online') + '/logo.png'}" alt="Gen3ia" /></div>
    <div class="card">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Gen3ia. Tous droits réservés.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  // Mode mock : pas de clé Resend configurée → on logge uniquement
  if (!RESEND_API_KEY) {
    console.log(`[Email Mock] À: ${Array.isArray(options.to) ? options.to.join(',') : options.to} | Sujet: ${options.subject}`);
    return { success: true, id: 'mock_' + Date.now(), provider: 'mock' };
  }

  try {
    const { data, error } = await getResend().emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments,
    });

    if (error) {
      console.error('[Email Error]:', error);
      return { success: false, error: error.message || JSON.stringify(error), provider: 'resend' };
    }

    return { success: true, id: data?.id, provider: 'resend' };
  } catch (err) {
    console.error('[Email Exception]:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur d\'envoi',
      provider: 'resend',
    };
  }
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Bienvenue sur Gen3ia 🚀',
    html: baseHtml(`
      <h1>Bienvenue sur Gen3ia, ${name} !</h1>
      <p>Votre compte a été créé avec succès. Vous avez accès à :</p>
      <ul style="font-size: 14px; color: #52525b; line-height: 2;">
        <li>🧠 Agents IA intelligents</li>
        <li>🤖 Automatisation des tâches</li>
        <li>📊 Analytics en temps réel</li>
      </ul>
      <p style="text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/agents" class="btn">
          Créer mon premier agent
        </a>
      </p>
      <p>Si vous avez des questions, notre équipe est là pour vous aider.</p>
    `),
  });
}

export async function sendPasswordResetEmail(email: string, resetCode: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Réinitialisation de votre mot de passe',
    html: baseHtml(`
      <h1>Réinitialisation de mot de passe</h1>
      <p>Vous avez demandé la réinitialisation de votre mot de passe. Utilisez le code ci-dessous :</p>
      <div class="code">${resetCode}</div>
      <p>Ce code expire dans 15 minutes. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
    `),
  });
}

export async function sendVerificationEmail(email: string, verificationCode: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Vérifiez votre adresse email',
    html: baseHtml(`
      <h1>Vérification de votre email</h1>
      <p>Pour activer votre compte Gen3ia, utilisez le code de vérification ci-dessous :</p>
      <div class="code">${verificationCode}</div>
      <p>Ce code expire dans 30 minutes.</p>
    `),
  });
}

export async function sendInvoiceEmail(email: string, amount: number, currency: string, pdfUrl?: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: `Votre facture Gen3ia - ${amount} ${currency}`,
    html: baseHtml(`
      <h1>Facture ${currency} ${amount.toLocaleString()}</h1>
      <p>Merci pour votre paiement. Votre abonnement Gen3ia est actif.</p>
      ${pdfUrl ? `<p style="text-align: center;"><a href="${pdfUrl}" class="btn">Télécharger la facture</a></p>` : ''}
      <p>Montant : <strong>${amount.toLocaleString()} ${currency}</strong></p>
      <p>Date : ${new Date().toLocaleDateString('fr-FR')}</p>
    `),
  });
}

// Diagnostic — vérifie l'état du système email
export function getEmailDiagnostics() {
  return {
    provider: RESEND_API_KEY ? 'resend' : 'mock',
    apiKeyConfigured: !!RESEND_API_KEY,
    apiKeyPrefix: RESEND_API_KEY ? RESEND_API_KEY.slice(0, 6) + '…' : null,
    fromEmail: FROM_EMAIL,
    fromName: FROM_NAME,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
  };
}
