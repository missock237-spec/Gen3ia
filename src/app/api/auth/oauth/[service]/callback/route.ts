import { NextRequest, NextResponse } from 'next/server';
import { getOAuthProvider } from '@/lib/oauth/provider-registry';
import { prisma } from '@/lib/prisma';
import { encryptField } from '@/lib/security/token-encryption';

interface TokenResponse {
  access_token: string; refresh_token?: string; expires_in?: number;
  scope?: string; error?: string; error_description?: string;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ service: string }> }) {
  try {
    const { service } = await params;
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL('/settings/authorizations?oauth=error', request.url));
    }
    if (!code || !state) {
      return NextResponse.redirect(new URL('/settings/authorizations?oauth=invalid', request.url));
    }

    const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
    if (!oauthState || oauthState.service !== service || oauthState.expiresAt < new Date()) {
      return NextResponse.redirect(new URL('/settings/authorizations?oauth=expired', request.url));
    }

    await prisma.oAuthState.delete({ where: { id: oauthState.id } });

    const provider = getOAuthProvider(service);
    if (!provider) {
      return NextResponse.redirect(new URL('/settings/authorizations?oauth=invalid_provider', request.url));
    }

    const redirectUri = url.origin + '/api/auth/oauth/' + service + '/callback';
    const tokenBody = new URLSearchParams({
      client_id: process.env[provider.clientIdEnv] || '',
      client_secret: process.env[provider.clientSecretEnv] || '',
      code, redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    if (oauthState.codeVerifier) tokenBody.set('code_verifier', oauthState.codeVerifier);

    const tokenRes = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: tokenBody.toString(),
    });
    const tokenData: TokenResponse = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.redirect(new URL('/settings/authorizations?oauth=token_error', request.url));
    }

    // Chiffrer les tokens avant stockage
    const encryptedAccess = encryptField(tokenData.access_token);
    const encryptedRefresh = encryptField(tokenData.refresh_token || null);

    const accountInfo = await fetchAccountInfo(service, tokenData.access_token);
    const accountId = accountInfo?.id || 'oauth_' + Date.now();
    const accountName = accountInfo?.name || accountInfo?.email || provider.label + ' account';

    const existing = await prisma.workflowAuthorization.findFirst({
      where: { userId: oauthState.userId, service, accountId },
    });

    if (existing) {
      await prisma.workflowAuthorization.update({
        where: { id: existing.id },
        data: {
          accessToken: encryptedAccess!,
          refreshToken: encryptedRefresh,
          accountName, isActive: true,
        },
      });
    } else {
      await prisma.workflowAuthorization.create({
        data: {
          userId: oauthState.userId, service,
          accessToken: encryptedAccess!,
          refreshToken: encryptedRefresh,
          accountId, accountName,
        },
      });
    }

    return NextResponse.redirect(new URL('/settings/authorizations?oauth=success', request.url));
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(new URL('/settings/authorizations?oauth=error', request.url));
  }
}

async function fetchAccountInfo(service: string, token: string): Promise<{id?:string;name?:string;email?:string} | null> {
  try {
    const endpoints: Record<string, string> = {
      github: 'https://api.github.com/user',
      google: 'https://www.googleapis.com/oauth2/v2/userinfo',
      gmail: 'https://www.googleapis.com/oauth2/v2/userinfo',
      microsoft: 'https://graph.microsoft.com/v1.0/me',
      slack: 'https://slack.com/api/auth.test',
      discord: 'https://discord.com/api/users/@me',
      twitter: 'https://api.twitter.com/2/users/me',
      linkedin: 'https://api.linkedin.com/v2/userinfo',
      notion: 'https://api.notion.com/v1/users/me',
      dropbox: 'https://api.dropboxapi.com/2/users/get_current_account',
      spotify: 'https://api.spotify.com/v1/me',
    };
    const endpoint = endpoints[service];
    if (!endpoint) return null;
    const res = await fetch(endpoint, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
