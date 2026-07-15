'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAppStore } from '@/lib/store';
import {
  Coins, Sparkles, Video, BadgePercent, Crown,
  ChevronRight, Gift, TrendingUp
} from 'lucide-react';

interface QuickStats {
  todayEarnings: number;
  maxDailyCredits: number;
  tierEarnings: Record<number, { earned: number; cap: number }>;
}

/**
 * Bannière intelligente qui s'affiche sur le dashboard
 * Montre les crédits gagnables et la progression
 */
export function EarnCreditsBanner() {
  const { setCurrentView } = useAppStore();
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const data = await apiFetch<{ stats: QuickStats }>('/api/ads?placement=sidebar&stats=true');
      setStats(data.stats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;

  const hasEarnings = stats && stats.todayEarnings > 0;
  const totalProgress = stats
    ? Math.min(100, (stats.todayEarnings / stats.maxDailyCredits) * 100)
    : 0;

  return (
    <Card className="overflow-hidden border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-background to-amber-500/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/10 shrink-0">
              <Coins className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5 text-amber-500" />
                Gagnez des crédits gratuitement
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasEarnings
                  ? `${stats?.todayEarnings} crédits gagnés aujourd'hui`
                  : `Jusqu'à ${stats?.maxDailyCredits ?? 450} crédits disponibles aujourd'hui`
                }
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-3">
            {/* Mini barres de progression par niveau */}
            {[1, 2].map((tier) => {
              const tierStat = stats?.tierEarnings?.[tier];
              if (!tierStat) return null;
              const progress = tierStat.cap > 0
                ? Math.min(100, (tierStat.earned / tierStat.cap) * 100)
                : 0;

              return (
                <div key={tier} className="flex items-center gap-1.5">
                  {tier === 1 ? (
                    <Video className="h-3 w-3 text-blue-500" />
                  ) : (
                    <BadgePercent className="h-3 w-3 text-emerald-500" />
                  )}
                  <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tier === 1 ? 'bg-blue-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {tierStat.earned}/{tierStat.cap}
                  </span>
                </div>
              );
            })}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5 border-amber-500/20 hover:bg-amber-500/5"
            onClick={() => setCurrentView('earn')}
          >
            Gagner
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Progress bar */}
        {stats && stats.maxDailyCredits > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Progression quotidienne</span>
              <span>{stats.todayEarnings}/{stats.maxDailyCredits} crédits</span>
            </div>
            <Progress value={totalProgress} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
