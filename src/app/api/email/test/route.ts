import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { verifyConnection, getEmailConfig, sendEmail } from '@/lib/email/sender';





export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const config = getEmailConfig();
    if (!config) {
      return NextResponse.json({
        configured: false,
        error: 'SMTP non configure. Ajoutez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env',
        required: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
        optional: ['SMTP_PORT (587)', 'SMTP_SECURE (false)', 'SMTP_FROM_NAME', 'SMTP_FROM_EMAIL'],
      });
    }

    const connection = await verifyConnection();
    const smtpConfig = config as { host: string; port: number; secure: boolean; user: string; fromName: string; fromEmail: string };
    const maskedConfig = {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.user.replace(/(.{3}).+(.{2})/, '$1...$2'),
      fromName: smtpConfig.fromName,
      fromEmail: smtpConfig.fromEmail,
    };

    return NextResponse.json({
      configured: true,
      connection,
      config: maskedConfig,
      info: 'Pour envoyer un email de test: POST /api/email/test avec { to: "email@example.com" }',
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = await request.json();
// @ts-ignore — type narrowing pending, see refactor ticket
    const to = body.to || session.email;

    if (!to) {
      return NextResponse.json({ error: 'Destinataire requis (to)' }, { status: 400 });
    }

    const result = await sendEmail({
      to,
      subject: 'Test de configuration SMTP - Genova AI',
      html: '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:32px"><h1 style="color:#6c5ce7">Test SMTP reussi !</h1><p>Votre serveur SMTP est correctement configure pour Genova AI.</p><p style="color:#666">Date: ' + new Date().toLocaleString() + '</p></body></html>',
    });

    return NextResponse.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      to,
      message: result.success ? 'Email de test envoye avec succes' : 'Echec envoi email de test',
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
