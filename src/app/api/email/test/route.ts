// ============================================================
// /api/email/test — Vérification & test du système d'envoi d'emails
// ============================================================
//  GET  : renvoie l'état de configuration (provider, from, domains vérifiés)
//  POST : envoie un email de test à l'adresse indiquée dans { to }
//         (en production, authentification requise — sauf si CRON_SECRET fourni)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { verifyConnection, getEmailConfig, sendEmail } from '@/lib/email/sender';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  // Autorisé si session utilisateur valide
  // OU si header X-Cron-Secret == CRON_SECRET (pour checks automatisés)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret');
    if (provided && provided === cronSecret) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const cronAuthorized = isAuthorized(req);

    if (!session?.user.id && !cronAuthorized) {
      return NextResponse.json(
        { error: 'Non authentifié. Ajoutez X-Cron-Secret ou connectez-vous.' },
        { status: 401 },
      );
    }

    const config = getEmailConfig();
    if (!config) {
      return NextResponse.json({
        configured: false,
        error: 'Aucun moyen d\'envoi configuré. Définissez RESEND_API_KEY (recommandé) ou SMTP_*',
        required: ['RESEND_API_KEY'],
        optional: ['EMAIL_FROM', 'EMAIL_FROM_NAME', 'NEXT_PUBLIC_APP_URL'],
      });
    }

    const connection = await verifyConnection();
    const safeConfig = config.method === 'resend'
      ? { method: config.method, apiKeyPrefix: config.apiKeyPrefix, fromEmail: config.fromEmail, fromName: config.fromName }
      : {
          method: config.method,
          host: config.host,
          port: config.port,
          secure: config.secure,
          user: (config.user || '').replace(/(.{3}).+(.{2})/, '$1…$2'),
          fromName: config.fromName,
          fromEmail: config.fromEmail,
        };

    return NextResponse.json({
      configured: true,
      connection,
      config: safeConfig,
      info: 'POST /api/email/test avec { to: "email@example.com" } pour envoyer un test',
    });
  } catch (error) {
    console.error('[/api/email/test] GET error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const cronAuthorized = isAuthorized(req);

    if (!session?.user.id && !cronAuthorized) {
      return NextResponse.json(
        { error: 'Non authentifié. Ajoutez X-Cron-Secret ou connectez-vous.' },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const to: string | undefined = body.to || session?.user?.email;

    if (!to) {
      return NextResponse.json({ error: 'Destinataire requis (to)' }, { status: 400 });
    }

    // Validation basique email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 });
    }

    const result = await sendEmail({
      to,
      subject: '[Gen3ia] Email de test — ' + new Date().toISOString(),
      html: `<!DOCTYPE html><html lang="fr"><body style="font-family:-apple-system,sans-serif;padding:32px">
        <h1 style="color:#7c3aed">Test email réussi !</h1>
        <p>Le système d'envoi d'email fonctionne correctement en production.</p>
        <p><strong>Destinataire :</strong> ${to}</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
        <p><strong>Provider :</strong> ${getEmailConfig()?.method || '?'}</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee">
        <p style="color:#999;font-size:12px">Cet email a été envoyé via /api/email/test — Gen3ia</p>
      </body></html>`,
      text: 'Test email réussi — le système d\'envoi fonctionne en production.',
    });

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId || result.id,
      provider: result.provider,
      error: result.error,
      to,
      message: result.success ? 'Email de test envoyé avec succès' : 'Échec envoi email de test',
    });
  } catch (error) {
    console.error('[/api/email/test] POST error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
