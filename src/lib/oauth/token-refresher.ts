// Token Refresher — rafraichit automatiquement les tokens OAuth expires

import { prisma } from '@/lib/prisma';
import { getOAuthProvider } from '@/lib/oauth/provider-registry';

export async function refreshExpiredTokens(): Promise<{ refreshed: number; failed: number }> {
  const expiringSoon = await prisma.workflowAuthorization.findMany({
    where: {
      isActive: true,
      refreshToken: { not: null },
      OR: [
        { expiresAt: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
        { expiresAt: null, lastUsedAt: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  let refreshed = 0;
  let failed = 0;

  for (const auth of expiringSoon) {
    if (!auth.refreshToken) continue;
    const provider = getOAuthProvider(auth.service);
    if (!provider) continue;

    try {
      const tokenBody = new URLSearchParams({
        client_id: process.env[provider.clientIdEnv] || '',
        client_secret: process.env[provider.clientSecretEnv] || '',
        refresh_token: auth.refreshToken,
        grant_type: 'refresh_token',
      });

      const res = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        await prisma.workflowAuthorization.update({
          where: { id: auth.id },
          data: { isActive: false },
        });
        failed++;
        continue;
      }

      await prisma.workflowAuthorization.update({
        where: { id: auth.id },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || auth.refreshToken,
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        },
      });
      refreshed++;
    } catch {
      failed++;
    }
  }

  return { refreshed, failed };
}

export async function refreshSingleToken(authorizationId: string): Promise<boolean> {
  const auth = await prisma.workflowAuthorization.findUnique({
    where: { id: authorizationId },
  });
  if (!auth || !auth.refreshToken) return false;

  const provider = getOAuthProvider(auth.service);
  if (!provider) return false;

  try {
    const tokenBody = new URLSearchParams({
      client_id: process.env[provider.clientIdEnv] || '',
      client_secret: process.env[provider.clientSecretEnv] || '',
      refresh_token: auth.refreshToken,
      grant_type: 'refresh_token',
    });

    const res = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      await prisma.workflowAuthorization.update({
        where: { id: auth.id },
        data: { isActive: false },
      });
      return false;
    }

    await prisma.workflowAuthorization.update({
      where: { id: auth.id },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || auth.refreshToken,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        lastUsedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function revokeToken(authorizationId: string): Promise<boolean> {
  const auth = await prisma.workflowAuthorization.findUnique({
    where: { id: authorizationId },
  });
  if (!auth) return false;

  const provider = getOAuthProvider(auth.service);
  if (provider?.revokeUrl) {
    try {
      const revokeUrl = provider.revokeUrl.replace('{client_id}', process.env[provider.clientIdEnv] || '');
      await fetch(revokeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: auth.accessToken }),
      });
    } catch {}
  }

  await prisma.workflowAuthorization.update({
    where: { id: authorizationId },
    data: { isActive: false, accessToken: '[REVOKED]', refreshToken: null },
  });
  return true;
}
