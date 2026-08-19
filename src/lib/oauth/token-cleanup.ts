// Token Cleanup Script — run via cron or workflow_dispatch

import { prisma } from '@/lib/prisma';

async function cleanupExpiredTokens() {
  console.log('[TokenCleanup] Demarrage du nettoyage...');

  // Desactiver les authorizations dont le refresh token est expiré
  // (pas de refresh depuis 30 jours ou token expire depuis plus de 7 jours)
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const expiredThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const expired = await prisma.workflowAuthorization.updateMany({
    where: {
      isActive: true,
      OR: [
        { expiresAt: { lte: expiredThreshold } },
        { lastUsedAt: null, createdAt: { lte: threshold } },
      ],
    },
    data: { isActive: false },
  });

  // Nettoyer les vieux OAuthState
  const oldStates = await prisma.oAuthState.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });

  console.log(`[TokenCleanup] Termine: ${expired.count} authorizations expirees desactivees, ${oldStates.count} etats OAuth netoyes`);
}

cleanupExpiredTokens()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
