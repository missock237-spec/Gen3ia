// ============================================================
// API Route: /api/saas-accounts
// Gestion des comptes SaaS liés (CRUD + OAuth + santé)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getSaaSAccountConnector } from '@/lib/saas-automation/account-connector';

// GET /api/saas-accounts — Lister les comptes liés
export const GET = withAuth(async (req, _ctx, auth) => {
  try {
    const connector = getSaaSAccountConnector();
    const url = new URL(req.url);

    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const accounts = await connector.listAccounts(auth.userId, activeOnly);

    // Si ?health=true, vérifier la santé des comptes
    if (url.searchParams.get('health') === 'true') {
      const health = await connector.checkAccountHealth(auth.userId);
      return NextResponse.json({ accounts, health });
    }

    return NextResponse.json({ accounts });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des comptes SaaS', details: String(error) },
      { status: 500 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 30, windowMs: 60000 } });

// POST /api/saas-accounts — Lier un nouveau compte SaaS
export const POST = withAuth(async (req, _ctx, auth) => {
  try {
    const body = await req.json();
    const connector = getSaaSAccountConnector();

    // Si OAuth flow initiation
    if (body.initiateOAuth) {
      const result = await connector.initiateOAuthLink({
        userId: auth.userId,
        provider: body.provider,
        label: body.label,
        redirectUri: body.redirectUri,
        scopes: body.scopes,
      });

      return NextResponse.json({
        authorizationUrl: result.authorizationUrl,
        state: result.state,
        message: 'Redirigez l\'utilisateur vers l\'URL d\'autorisation',
      });
    }

    // Si OAuth callback
    if (body.completeOAuth && body.code) {
      const account = await connector.completeOAuthLink(
        auth.userId,
        body.provider,
        body.code,
        body.redirectUri,
        body.label
      );

      return NextResponse.json({ account, message: 'Compte SaaS lié avec succès via OAuth' }, { status: 201 });
    }

    // Liaison directe avec credentials
    const account = await connector.linkAccount({
      userId: auth.userId,
      provider: body.provider,
      label: body.label,
      authType: body.authType,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      tokenExpiresAt: body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : undefined,
      scopes: body.scopes,
      accountId: body.accountId,
      accountEmail: body.accountEmail,
      accountName: body.accountName,
      avatarUrl: body.avatarUrl,
      metadata: body.metadata,
      autoReconnect: body.autoReconnect,
    });

    return NextResponse.json({ account, message: 'Compte SaaS lié avec succès' }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la liaison du compte SaaS', details: String(error) },
      { status: 400 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 10, windowMs: 60000 }, quota: true });

// DELETE /api/saas-accounts — Délier un compte
export const DELETE = withAuth(async (req, _ctx, auth) => {
  try {
    const url = new URL(req.url);
    const accountId = url.searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId requis' }, { status: 400 });
    }

    const connector = getSaaSAccountConnector();
    await connector.unlinkAccount(auth.userId, accountId);

    return NextResponse.json({ message: 'Compte SaaS délié avec succès' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du compte SaaS', details: String(error) },
      { status: 400 }
    );
  }
}, { requireAuth: true, roles: ['user', 'admin'], rateLimit: { limit: 10, windowMs: 60000 } });
