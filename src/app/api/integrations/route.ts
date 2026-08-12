// ============================================================
// POST/GET /api/integrations — Hub de connecteurs natifs
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';
import { integrationHub, IntegrationConnection } from '@/lib/integration-hub';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('api-integrations');

// Champs lus pour une connexion sociale (select en string[])
const SOCIAL_ACCOUNT_SELECT = ['id', 'platform', 'accountName', 'accessToken', 'refreshToken', 'expiresAt', 'createdAt', 'updatedAt'];

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const category = searchParams.get('category');
    const actions = searchParams.get('actions') === 'true';
    const stats = searchParams.get('stats') === 'true';

    // Récupérer les connexions actives de l'utilisateur depuis SocialAccount
    const connections = await db.socialAccount.findMany({
      where: [
        { field: 'userId', op: '==', value: auth.userId },
        { field: 'expiresAt', op: '>', value: new Date() },
      ],
      select: SOCIAL_ACCOUNT_SELECT,
    });

    const userConnections: IntegrationConnection[] = connections.map(c => ({
      id: c.id,
      provider: c.platform as any,
      userId: auth.userId,
      accessToken: '',
      scopes: [],
      isActive: true,
      accountName: c.accountName || undefined,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    // Stats
    if (stats) {
      return NextResponse.json({ success: true, stats: integrationHub.getStats(userConnections) });
    }

    // Actions d'un provider spécifique
    if (provider) {
      if (actions) {
        const providerActions = integrationHub.getActions(provider as any);
        return NextResponse.json({ success: true, provider, actions: providerActions });
      }
      return NextResponse.json({ error: 'Spécifiez ?actions=true' }, { status: 400 });
    }

    // Liste filtrée ou complète
    let integrations = integrationHub.getIntegrations(userConnections);

    if (category) {
      integrations = integrations.filter(i => i.category === category);
    }

    // Grouper par catégorie
    const grouped = integrationHub.getByCategory();
    for (const [cat, items] of Object.entries(grouped)) {
      grouped[cat] = items.map(item => ({
        ...item,
        isConnected: userConnections.some(c => c.provider === item.id),
      }));
    }

    return NextResponse.json({
      success: true,
      integrations,
      grouped,
      categories: Object.keys(grouped),
      connected: userConnections.map(c => c.provider),
    });
  } catch (err) {
    log.error('integrations_get_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const body = await request.json();
    const { provider, action, params, connectorId } = body;

    if (!provider) {
      return NextResponse.json({ error: 'provider requis' }, { status: 400 });
    }

    // Récupérer la connexion pour ce provider
    const socialAccount = await db.socialAccount.findFirst({
      where: [
        { field: 'userId', op: '==', value: auth.userId },
        { field: 'platform', op: '==', value: provider },
        { field: 'expiresAt', op: '>', value: new Date() },
      ],
    });

    if (!socialAccount && provider !== 'webhook') {
      return NextResponse.json({ error: `Connexion ${provider} non trouvée` }, { status: 404 });
    }

    const record = socialAccount as Record<string, unknown> | null;
    const connection: IntegrationConnection = {
      id: record?.id || 'webhook',
      provider: provider as any,
      userId: auth.userId,
      accessToken: record?.accessToken || '',
      refreshToken: record?.refreshToken || undefined,
      expiresAt: record?.expiresAt || undefined,
      scopes: [],
      accountName: record?.accountName || undefined,
      isActive: true,
      createdAt: record?.createdAt || new Date(),
      updatedAt: record?.updatedAt || new Date(),
    };

    // Exécuter l'action
    const result = await integrationHub.executeAction(connection, action || `${provider}_default`, params || {});

    log.info('integration_action_executed', { provider, action, userId: auth.userId.slice(0, 8) });

    return NextResponse.json({
      success: true,
      provider,
      action: action || 'default',
      result,
    });
  } catch (err) {
    log.error('integration_action_error', { error: String(err) });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}