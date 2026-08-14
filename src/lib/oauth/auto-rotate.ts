// Auto Token Rotation — remplace periodiquement les tokens OAuth
// Limite l'impact d'un token vole (fenetre d'exposition reduite)

import { prisma } from '@/lib/prisma';
import { getOAuthProvider } from '@/lib/oauth/provider-registry';
import { encryptField, decryptField } from '@/lib/security/token-encryption';
import { recordAudit } from '@/lib/security/audit-trail';

const ROTATION_INTERVAL_DAYS = 7;
const REFRESH_THRESHOLD_DAYS = 3;

export async function rotateExpiredTokens(): Promise<{ rotated: number; failed: number; revoked: number }> {
  let rotated = 0;
  let failed = 0;
  let revoked = 0;

  const threshold = new Date(Date.now() - ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  const refreshThreshold = new Date(Date.now() - REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  // Tokens qui n'ont pas ete rotates depuis 7 jours ou jamais depuis 30 jours
  const tokensToRotate = await prisma.workflowAuthorization.findMany({
    where: {
      isActive: true,
      refreshToken: { not: null },
      OR: [
        { updatedAt: { lte: threshold } },
        { lastUsedAt: null, createdAt: { lte: refreshThreshold } },
      ],
    },
  });

  for (const auth of tokensToRotate) {
    try {
      const provider = getOAuthProvider(auth.service);
      if (!provider) {
        // Service sans provider connu, on le desactive
        await prisma.workflowAuthorization.update({
          where: { id: auth.id },
          data: { isActive: false },
        });
        revoked++;
        continue;
      }

      const refreshToken = decryptField(auth.refreshToken);
      if (!refreshToken) {
        await prisma.workflowAuthorization.update({
          where: { id: auth.id },
          data: { isActive: false },
        });
        revoked++;
        continue;
      }

      const tokenBody = new URLSearchParams({
        client_id: process.env[provider.clientIdEnv] || '',
        client_secret: process.env[provider.clientSecretEnv] || '',
        refresh_token: refreshToken,
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

        await recordAudit({
          action: 'TOKEN_REVOKED',
          actorId: 'system',
          actorType: 'system',
          targetId: auth.id,
          targetType: 'workflow_authorization',
          description: 'Token expire pour ' + auth.service + ', refresh impossible, revocation automatique',
          metadata: { service: auth.service, error: data.error },
          severity: 'warning',
        });
        revoked++;
        continue;
      }

      // Chiffrer les nouveaux tokens
      const newAccessToken = encryptField(data.access_token);
      const newRefreshToken = encryptField(data.refresh_token || null);

      await prisma.workflowAuthorization.update({
        where: { id: auth.id },
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        },
      });

      await recordAudit({
        action: 'TOKEN_REFRESHED',
        actorId: 'system',
        actorType: 'system',
        targetId: auth.id,
        targetType: 'workflow_authorization',
        description: 'Token rotte automatiquement pour ' + auth.service,
        metadata: { service: auth.service, accountId: auth.accountId },
        severity: 'info',
      });
      rotated++;
    } catch (error) {
      console.error('[AutoRotate] Erreur pour', auth.id, error);
      failed++;
    }
  }

  return { rotated, failed, revoked };
}

export async function getTokenHealth(): Promise<{
  total: number;
  active: number;
  expired: number;
  needsRotation: number;
  revoked: number;
}> {
  const threshold = new Date(Date.now() - ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

  const [total, active, expired, needsRotationForRotate] = await Promise.all([
    prisma.workflowAuthorization.count(),
    prisma.workflowAuthorization.count({ where: { isActive: true } }),
    prisma.workflowAuthorization.count({
      where: { isActive: true, expiresAt: { lte: new Date() } },
    }),
    prisma.workflowAuthorization.count({
      where: { isActive: true, updatedAt: { lte: threshold } },
    }),
  ]);

  return {
    total,
    active,
    expired,
    needsRotation: needsRotationForRotate,
    revoked: total - active,
  };
}
