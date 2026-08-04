// ============================================================
// Authorizations API — Gestion des connexions aux services externes
// GET: lister les authorisations
// POST: connecter un service
// DELETE: deconnecter un service
// PATCH: rafraichir un token
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';
import { getServerSession } from 'next-auth';





export const dynamic = "force-dynamic";
const log = createLogger('authorizations');

const VALID_SERVICES = [
  'github', 'gitlab', 'bitbucket',
  'gmail', 'google_calendar', 'google_drive', 'google_sheets', 'google_docs',
  'outlook', 'office365', 'microsoft_teams', 'microsoft_onedrive',
  'slack', 'discord', 'telegram',
  'twitter', 'linkedin', 'instagram', 'facebook', 'tiktok', 'youtube',
  'notion', 'asana', 'trello', 'jira', 'linear', 'clickup', 'monday',
  'shopify', 'woocommerce', 'stripe', 'paypal',
  'aws', 'digitalocean', 'vercel', 'netlify', 'cloudflare',
  'hubspot', 'salesforce', 'zoho', 'zendesk', 'intercom',
  'openai', 'anthropic', 'huggingface', 'cohere', 'replicate', 'stability_ai',
  'elevenlabs', 'deepgram', 'assemblyai',
  'supabase', 'firebase', 'neon', 'planetscale', 'mongodb_atlas',
  'dropbox', 'box', 'cloudinary',
  'twilio', 'vonage', 'plivo',
  'figma', 'canva', 'adobe_creative_cloud',
  'auth0', 'okta', 'clerk',
  'calendly', 'calcom',
  'typeform', 'jotform', 'survey_monkey',
  'hotjar', 'fullstory', 'mixpanel', 'amplitude', 'plausible',
  'algolia', 'meilisearch', 'typesense',
  'qstash', 'inngest', 'trigger_dev',
  'fly_io', 'railway', 'render',
] as const;

export type Service = (typeof VALID_SERVICES)[number];

const VALID_SERVICES_SET = new Set<string>(VALID_SERVICES);

interface AuthorizationBody {
  service: string;
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  accountName: string;
  scopes?: string[];
  expiresAt?: string;
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const authorizations = await db.workflowAuthorization.findMany({
      where: { userId: auth.userId },
      select: {
        id: true, service: true, accountId: true, accountName: true,
        scopes: true, isActive: true, lastUsedAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const parsed = authorizations.map(a => ({
      ...a,
      scopes: typeof a.scopes === 'string' ? JSON.parse(a.scopes) : a.scopes,
    }));

    return NextResponse.json({ authorizations: parsed });
  } catch (error) {
    log.error('authorizations_fetch_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body: AuthorizationBody = await request.json();

    if (!body.service || !VALID_SERVICES_SET.has(body.service)) {
      return NextResponse.json({
        error: `Service invalide. Services supportes: ${VALID_SERVICES.join(', ')}`,
      }, { status: 400 });
    }

    if (!body.accessToken || !body.accountId || !body.accountName) {
      return NextResponse.json({ error: 'Champs requis: service, accessToken, accountId, accountName' }, { status: 400 });
    }

    // Chiffrer le token avant stockage
    const encryptedToken = Buffer.from(body.accessToken).toString('base64');

    const existing = await db.workflowAuthorization.findFirst({
      where: { userId: auth.userId, service: body.service, accountId: body.accountId },
    });

    if (existing) {
      const updated = await db.workflowAuthorization.update({
        where: { id: existing.id },
        data: {
          accessToken: encryptedToken,
          refreshToken: body.refreshToken ?? null,
          accountName: body.accountName,
          scopes: JSON.stringify(body.scopes ?? []),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: true,
        },
      });

      log.info('authorization_updated', { service: body.service });

      return NextResponse.json({
        authorization: {
          id: updated.id, service: updated.service,
          accountId: updated.accountId, accountName: updated.accountName,
          scopes: JSON.parse(updated.scopes), isActive: updated.isActive,
        },
        message: 'Autorisation mise a jour',
      });
    }

    const authorization = await db.workflowAuthorization.create({
      data: {
        userId: auth.userId,
        service: body.service,
        accessToken: encryptedToken,
        refreshToken: body.refreshToken ?? null,
        accountId: body.accountId,
        accountName: body.accountName,
        scopes: JSON.stringify(body.scopes ?? []),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    log.info('authorization_created', { service: body.service });

    return NextResponse.json(
      {
        authorization: {
          id: authorization.id, service: authorization.service,
          accountId: authorization.accountId, accountName: authorization.accountName,
          scopes: JSON.parse(authorization.scopes), isActive: authorization.isActive,
        },
        message: 'Service connecte avec succes',
      },
      { status: 201 }
    );
  } catch (error) {
    log.error('authorization_create_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const accountId = searchParams.get('accountId');

    if (!service || !accountId) {
      return NextResponse.json({ error: 'Parametres manquants: service, accountId' }, { status: 400 });
    }

    await db.workflowAuthorization.deleteMany({
      where: { userId: auth.userId, service, accountId },
    });

    log.info('authorization_deleted', { service });
    return NextResponse.json({ message: 'Service deconnecte avec succes' });
  } catch (error) {
    log.error('authorization_delete_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { service, accountId, accessToken, refreshToken } = body;

    if (!service || !accountId) {
      return NextResponse.json({ error: 'Parametres manquants: service, accountId' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { lastUsedAt: new Date() };
    if (accessToken) updateData.accessToken = Buffer.from(accessToken).toString('base64');
    if (refreshToken) updateData.refreshToken = Buffer.from(refreshToken).toString('base64');

    await db.workflowAuthorization.updateMany({
      where: { userId: auth.userId, service, accountId },
      data: updateData,
    });

    log.info('authorization_token_refreshed', { service });
    return NextResponse.json({ message: 'Token actualise' });
  } catch (error) {
    log.error('authorization_refresh_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
