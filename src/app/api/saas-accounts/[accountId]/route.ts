// ============================================================
// API Route: /api/saas-accounts/[accountId]
// Opérations sur un compte SaaS spécifique (détails, santé, refresh)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type RouteContext } from '@/lib/with-auth';
import { getSaaSAccountConnector } from '@/lib/saas-automation/account-connector';
import { getSaaSSessionManager } from '@/lib/saas-automation/session-manager';

// GET /api/saas-accounts/[accountId] — Détails d'un compte + sessions
export const GET = withAuth(async (req, ctx, auth) => {
  try {
    const params = await ctx.params;
// @ts-ignore
    const accountId = params.accountId;
    const connector = getSaaSAccountConnector();
    const url = new URL(req.url);

// @ts-ignore
    const account = await connector.getAccount(auth.userId, accountId);

    // Si ?sessions=true, inclure les sessions actives
    if (url.searchParams.get('sessions') === 'true') {
      const sessionManager = getSaaSSessionManager();
      const sessions = sessionManager.listActiveSessions(auth.userId)
        .filter(s => s.accountId === accountId);
      return NextResponse.json({ account, sessions });
    }

    return NextResponse.json({ account });
  } catch (error) {
    return NextResponse.json(
      { error: 'Compte SaaS non trouvé', details: String(error) },
      { status: 404 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 30, windowMs: 60000 } });

// DELETE /api/saas-accounts/[accountId] — Délier un compte
export const DELETE = withAuth(async (req, ctx, auth) => {
  try {
    const params = await ctx.params;
// @ts-ignore
    const accountId = params.accountId;
    const connector = getSaaSAccountConnector();

// @ts-ignore
    await connector.unlinkAccount(auth.userId, accountId);

    return NextResponse.json({ message: 'Compte SaaS délié avec succès' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la suppression', details: String(error) },
      { status: 400 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 10, windowMs: 60000 } });
