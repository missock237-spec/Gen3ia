// API de tracking des événements publicitaires
// SECURITE: POST = user authentifié (logique), GET stats = admin uniquement
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";





export const dynamic = "force-dynamic";
interface AdEvent {
  adId: string;
  type: 'view' | 'click' | 'dismiss';
  timestamp: string;
  plan: string;
}

// Stockage en mémoire (fallback dev). Utiliser DB en production.
const rewardStore: Map<string, { credits: number; lastReward: number; dailyCount: number; lastResetDate: string }> = new Map();

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// POST — Tracking des events (utilisateur authentifié)
export const POST = withAuth(async (request: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const body = await request.json();
    const events: AdEvent[] = body.events || [body];
    const isSync = body.sync === true;

    const results = [];

    for (const event of events) {
      const { adId, type, timestamp, plan } = event;

      if (!adId || !type || !plan) {
        results.push({ adId, status: 'ignored', reason: 'Données incomplètes' });
        continue;
      }

      // Logger avec l'identité authentifiée (le token, pas le body)
      console.log(`[AdEvent] ${type.toUpperCase()} | Ad:${adId} | User:${auth.userId} | Plan:${plan} | ${timestamp}`);

      if (plan !== 'free' && (type === 'view' || type === 'click')) {
        // Clé unique par utilisateur authentifié (pas global "plan_X")
        const userKey = `user_${auth.userId}`;
        const now = Date.now();
        const today = getTodayKey();

        let userRewards = rewardStore.get(userKey) || {
          credits: 0,
          lastReward: 0,
          dailyCount: 0,
          lastResetDate: today,
        };

        if (userRewards.lastResetDate !== today) {
          userRewards.dailyCount = 0;
          userRewards.lastResetDate = today;
        }

        // Anti-abuse : cooldown 30s
        const elapsed = (now - userRewards.lastReward) / 1000;
        if (elapsed < 30 && !isSync) {
          results.push({ adId, status: 'cooldown', reason: `Encore ${Math.ceil(30 - elapsed)}s` });
          continue;
        }

        // Anti-abuse : max 50/jour
        if (userRewards.dailyCount >= 50) {
          results.push({ adId, status: 'limit_reached', reason: 'Limite journalière atteinte (50/jour)' });
          continue;
        }

        const credits = type === 'click' ? 2 : 1;

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
        // Plan free : créditer seulement si configuré par l'admin
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
}, {
  requireAuth: true,
  rateLimit: { limit: 100, windowMs: 60000 },
});

// GET — Stats du dashboard (ADMIN UNIQUEMENT — ne pas exposer les récompenses en public)
export const GET = withAuth(async () => {
  const stats = Array.from(rewardStore.entries()).map(([key, value]) => ({
    user: key,
    ...value,
  }));

  return NextResponse.json({
    stats,
    totalRewards: rewardStore.size,
  });
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 30, windowMs: 60000 },
});
