import { NextRequest, NextResponse } from "next/server";

/**
 * API de tracking des événements publicitaires
 * - Reçoit les events depuis le client
 * - Persiste les récompenses crédit côté serveur
 * - Anti-abuse : validation des timestamps
 */

interface AdEvent {
  adId: string;
  type: 'view' | 'click' | 'dismiss';
  timestamp: string;
  plan: string;
}

// Stockage simple en mémoire (remplacer par DB en production)
const rewardStore: Map<string, { credits: number; lastReward: number; dailyCount: number; lastResetDate: string }> = new Map();

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const events: AdEvent[] = body.events || [body];
    const isSync = body.sync === true;

    const results = [];

    for (const event of events) {
      const { adId, type, timestamp, plan } = event;

      // Validation
      if (!adId || !type || !plan) {
        results.push({ adId, status: 'ignored', reason: 'Données incomplètes' });
        continue;
      }

      // Logger l'événement
      console.log(`[AdEvent] ${type.toUpperCase()} | Ad:${adId} | Plan:${plan} | ${timestamp}`);

      // Attribuer les crédits uniquement pour les plans payants
      if (plan !== 'free' && (type === 'view' || type === 'click')) {
        const userKey = `plan_${plan}`;
        const now = Date.now();
        const today = getTodayKey();

        let userRewards = rewardStore.get(userKey) || {
          credits: 0,
          lastReward: 0,
          dailyCount: 0,
          lastResetDate: today,
        };

        // Réinitialiser le compteur quotidien si nouveau jour
        if (userRewards.lastResetDate !== today) {
          userRewards.dailyCount = 0;
          userRewards.lastResetDate = today;
        }

        // 1. Anti-abuse : cooldown 30s
        const elapsed = (now - userRewards.lastReward) / 1000;
        if (elapsed < 30 && !isSync) {
          results.push({ adId, status: 'cooldown', reason: `Encore ${Math.ceil(30 - elapsed)}s` });
          continue;
        }

        // 2. Anti-abuse : max 50/jour
        if (userRewards.dailyCount >= 50) {
          results.push({ adId, status: 'limit_reached', reason: 'Limite journalière atteinte (50/jour)' });
          continue;
        }

        // Calculer les crédits
        const credits = type === 'click' ? 2 : 1;

        // Attribuer les crédits
        userRewards.credits += credits;
        userRewards.lastReward = now;
        userRewards.dailyCount += 1;

        rewardStore.set(userKey, userRewards);

        results.push({
          adId,
          status: 'rewarded',
          credits,
          totalCredits: userRewards.credits,
          dailyCount: userRewards.dailyCount,
          message: `+${credits} crédit${credits > 1 ? 's' : ''}`,
        });
      } else {
        results.push({ adId, status: 'logged', plan });
      }
    }

    return NextResponse.json({
      success: true,
      results,
      stats: {
        totalRewarded: Array.from(rewardStore.values()).reduce((sum, u) => sum + u.credits, 0),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Erreur serveur' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Retourner les stats globales pour le dashboard admin
  const stats = Array.from(rewardStore.entries()).map(([key, value]) => ({
    plan: key,
    ...value,
  }));

  return NextResponse.json({
    stats,
    totalRewards: rewardStore.size,
  });
}
