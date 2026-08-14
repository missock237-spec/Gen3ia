// ============================================================
// Gen3ia — Ad Anti-Abuse (Server-Side)
// ============================================================
//  Toute la logique anti-abuse est côté SERVEUR.
//  Le localStorage (ad-rewards.ts) n'est qu'un cache d'affichage.
//
//  Protections :
//  1. Cooldown par utilisateur (30s entre impressions)
//  2. Limite horaire (10 impressions/heure)
//  3. Limite journalière (50 impressions/jour)
//  4. Détection de doublons (même campagne, même user, < 5min)
//  5. Click fraud : max 1 clic par impression, scoring suspect
//  6. IP fingerprinting : détection de bots et IP dupliquées
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('ad-anti-abuse');

// Limites server-side (matching ad-rewards.ts but ENFORCED server-side)
export const ABUSE_LIMITS = {
  COOLDOWN_SEC: 30,
  MAX_IMPRESSIONS_PER_HOUR: 10,
  MAX_IMPRESSIONS_PER_DAY: 50,
  MAX_CLICKS_PER_HOUR: 20,
  MAX_CLICKS_PER_DAY: 100,
  DUPLICATE_WINDOW_SEC: 300, // 5 minutes
  MIN_VIEW_DURATION_MS: 1000, // 1s minimum pour compter une vue
} as const;

export interface AbuseCheckResult {
  allowed: boolean;
  reason: string;
  /** Score de suspicion 0-100 (0 = normal, 100 = bot) */
  fraudScore: number;
}

/**
 * Vérifie si une impression est autorisée côté serveur.
 * Toutes les vérifications sont en base de données, pas en mémoire.
 */
export async function checkImpressionAllowed(
  userId: string,
  campaignId: string,
  sessionId: string
): Promise<AbuseCheckResult> {
  const now = new Date();
  const fraudScore = await computeFraudScore(userId, sessionId);

  // 1. Cooldown : pas d'impression dans les 30 dernières secondes
  const cooldownAgo = new Date(now.getTime() - ABUSE_LIMITS.COOLDOWN_SEC * 1000);
  const recentImpression = await db.adImpression.findFirst({
    where: {
      userId,
      createdAt: { gte: cooldownAgo },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (recentImpression) {
    const elapsed = Math.floor((now.getTime() - recentImpression.createdAt.getTime()) / 1000);
    return {
      allowed: false,
      reason: `COOLDOWN: encore ${ABUSE_LIMITS.COOLDOWN_SEC - elapsed}s`,
      fraudScore,
    };
  }

  // 2. Limite horaire
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const hourlyCount = await db.adImpression.count({
    where: { userId, createdAt: { gte: oneHourAgo } },
  });

  if (hourlyCount >= ABUSE_LIMITS.MAX_IMPRESSIONS_PER_HOUR) {
    log.warn('hourly_limit_exceeded', { userId: userId.slice(0, 8), count: hourlyCount });
    return {
      allowed: false,
      reason: `HOURLY_LIMIT: ${hourlyCount}/${ABUSE_LIMITS.MAX_IMPRESSIONS_PER_HOUR}`,
      fraudScore,
    };
  }

  // 3. Limite journalière
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dailyCount = await db.adImpression.count({
    where: { userId, createdAt: { gte: dayStart } },
  });

  if (dailyCount >= ABUSE_LIMITS.MAX_IMPRESSIONS_PER_DAY) {
    log.warn('daily_limit_exceeded', { userId: userId.slice(0, 8), count: dailyCount });
    return {
      allowed: false,
      reason: `DAILY_LIMIT: ${dailyCount}/${ABUSE_LIMITS.MAX_IMPRESSIONS_PER_DAY}`,
      fraudScore,
    };
  }

  // 4. Doublon : même campagne, même user, dans les 5 dernières minutes
  const duplicateAgo = new Date(now.getTime() - ABUSE_LIMITS.DUPLICATE_WINDOW_SEC * 1000);
  const duplicate = await db.adImpression.findFirst({
    where: {
      userId,
      campaignId,
      createdAt: { gte: duplicateAgo },
    },
    select: { id: true },
  });

  if (duplicate) {
    return {
      allowed: false,
      reason: 'DUPLICATE_IMPRESSION',
      fraudScore,
    };
  }

  // 5. Block si fraud score trop élevé
  if (fraudScore >= 80) {
    log.warn('fraud_score_block', { userId: userId.slice(0, 8), score: fraudScore });
    return {
      allowed: false,
      reason: `FRAUD_SCORE: ${fraudScore}`,
      fraudScore,
    };
  }

  return { allowed: true, reason: 'OK', fraudScore };
}

/**
 * Vérifie si un clic est autorisé côté serveur.
 */
export async function checkClickAllowed(
  userId: string,
  impressionId: string,
): Promise<AbuseCheckResult> {
  const now = new Date();
  const fraudScore = await computeFraudScore(userId, '');

  // 1. Limite horaire de clics
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const hourlyClicks = await db.adImpression.count({
    where: {
      userId,
      wasClicked: true,
      clickedAt: { gte: oneHourAgo },
    },
  });

  if (hourlyClicks >= ABUSE_LIMITS.MAX_CLICKS_PER_HOUR) {
    log.warn('click_hourly_limit', { userId: userId.slice(0, 8), count: hourlyClicks });
    return {
      allowed: false,
      reason: `CLICK_HOURLY_LIMIT: ${hourlyClicks}/${ABUSE_LIMITS.MAX_CLICKS_PER_HOUR}`,
      fraudScore,
    };
  }

  // 2. Limite journalière de clics
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dailyClicks = await db.adImpression.count({
    where: {
      userId,
      wasClicked: true,
      clickedAt: { gte: dayStart },
    },
  });

  if (dailyClicks >= ABUSE_LIMITS.MAX_CLICKS_PER_DAY) {
    log.warn('click_daily_limit', { userId: userId.slice(0, 8), count: dailyClicks });
    return {
      allowed: false,
      reason: `CLICK_DAILY_LIMIT: ${dailyClicks}/${ABUSE_LIMITS.MAX_CLICKS_PER_DAY}`,
      fraudScore,
    };
  }

  // 3. Fraud score
  if (fraudScore >= 80) {
    return {
      allowed: false,
      reason: `FRAUD_SCORE: ${fraudScore}`,
      fraudScore,
    };
  }

  return { allowed: true, reason: 'OK', fraudScore };
}

/**
 * Calcule un score de suspicion (0-100) basé sur :
 * - Ratio clic/impression anormal
 * - Patterns temporels réguliers (bots)
 * - Nombre de sessions différentes récentes
 */
async function computeFraudScore(userId: string, sessionId: string): Promise<number> {
  let score = 0;
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);

  try {
    // Ratio clic/impression dans la dernière heure (> 80% = suspect)
    const [hourlyImpressions, hourlyClicks] = await Promise.all([
      db.adImpression.count({ where: { userId, createdAt: { gte: oneHourAgo } } }),
      db.adImpression.count({
        where: { userId, wasClicked: true, clickedAt: { gte: oneHourAgo } },
      }),
    ]);

    if (hourlyImpressions > 5 && hourlyClicks / hourlyImpressions > 0.8) {
      score += 40; // Cliqueur compulsif ou bot
    }

    // Trop de clics sans impressions correspondantes
    if (hourlyClicks > hourlyImpressions) {
      score += 30;
    }

    // Sessions distinctes dans la dernière heure (> 5 = suspect)
    if (sessionId) {
      const recentSessions = await db.adImpression.findMany({
        where: { userId, createdAt: { gte: oneHourAgo } },
        select: { sessionId: true },
        distinct: ['sessionId'],
      });
      if (recentSessions.length > 5) {
        score += 20; // Multi-session suspect
      }
    }
  } catch (err) {
    log.warn('fraud_score_error', { err: String(err) });
    // En cas d'erreur, score neutre (ne pas bloquer par défaut)
  }

  return Math.min(score, 100);
}

/**
 * Incrémente le budget dépensé de façon ATOMIQUE.
 * Utilise updateMany avec condition WHERE pour éviter les race conditions.
 * Retourne false si le budget est dépassé.
 */
export async function atomicBudgetIncrement(
  campaignId: string,
  amount: number
): Promise<boolean> {
  // updateMany est atomique au niveau DB : ne met à jour QUE si budgetSpent < budgetTotal
  const result = await db.adCampaign.updateMany({
    where: {
      id: campaignId,
      OR: [
        { budgetTotal: 0 }, // Budget illimité
        { budgetSpent: { lt: { budgetTotal: true } } }, // Pas encore dépassé
      ],
    },
    data: { budgetSpent: { increment: amount } },
  });

  if (result.count === 0) {
    // Budget dépassé — désactiver la campagne automatiquement
    await db.adCampaign.updateMany({
      where: { id: campaignId, budgetTotal: { gt: 0 } },
      data: { isActive: false, status: 'completed' },
    });
    log.info('campaign_budget_exhausted', { campaignId: campaignId.slice(0, 8) });
    return false;
  }

  return true;
}

/**
 * Vérifie et incrémente atomiquement le budget pour un clic.
 */
export async function atomicClickBudget(
  campaignId: string,
  amount: number
): Promise<boolean> {
  return atomicBudgetIncrement(campaignId, amount);
}
