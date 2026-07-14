'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RewardedAdViewer } from './rewarded-ad-viewer';
import {
  Coins, Sparkles, Play, Eye, Trophy, Gift, TrendingUp,
  Info, CheckCircle2, Clock, Loader2
} from 'lucide-react';

interface AdStats {
  todayEarnings: number;
  todayViews: number;
  maxDailyCredits: number;
  adsWatched: { name: string; views: number; credits: number; limit: number }[];
}

export function EarnCreditsPage() {
  const [stats, setStats] = useState<AdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch<{
        stats: AdStats;
        maxDailyCredits: number;
      }>('/api/ads?placement=sidebar&stats=true');
      setStats(data.stats);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRewardClaimed = (credits: number) => {
    setTotalCreditsEarned((prev) => prev + credits);
    fetchStats();
  };

  const dailyProgress = stats
    ? Math.min(100, (stats.todayEarnings / stats.maxDailyCredits) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-amber-500" />
          Gagnez des crédits gratuitement
        </h1>
        <p className="text-muted-foreground mt-1">
          Regardez des publicités pour gagner des crédits et utiliser Genova gratuitement.
        </p>
      </div>

      {/* Daily Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <span className="font-semibold">Gains du jour</span>
            </div>
            <span className="text-2xl font-bold">
              {stats?.todayEarnings ?? 0}
              <span className="text-sm text-muted-foreground font-normal">
                /{stats?.maxDailyCredits ?? 0} crédits
              </span>
            </span>
          </div>
          <Progress value={dailyProgress} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-2">
            {stats?.todayViews ?? 0} publicités regardées aujourd&apos;hui
          </p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Coins className="h-6 w-6 mx-auto mb-2 text-amber-500" />
            <p className="text-2xl font-bold">{stats?.todayEarnings ?? 0}</p>
            <p className="text-xs text-muted-foreground">Crédits gagnés aujourd&apos;hui</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="h-6 w-6 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{stats?.todayViews ?? 0}</p>
            <p className="text-xs text-muted-foreground">Publicités vues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Sparkles className="h-6 w-6 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{stats?.maxDailyCredits ?? 0}</p>
            <p className="text-xs text-muted-foreground">Max crédits / jour</p>
          </CardContent>
        </Card>
      </div>

      {/* Ads by placement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sidebar Ad */}
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Play className="h-4 w-4 text-amber-500" />
            Publicités sidebar
          </h3>
          <RewardedAdViewer
            placement="sidebar"
            onRewardClaimed={handleRewardClaimed}
            variant="sidebar"
          />
        </div>

        {/* Rewarded Video */}
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Play className="h-4 w-4 text-amber-500" />
            Vidéos récompensées
          </h3>
          <RewardedAdViewer
            placement="modal"
            onRewardClaimed={handleRewardClaimed}
            variant="sidebar"
          />
        </div>

        {/* Dashboard Widget */}
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Play className="h-4 w-4 text-amber-500" />
            Widget découverte
          </h3>
          <RewardedAdViewer
            placement="dashboard_widget"
            onRewardClaimed={handleRewardClaimed}
            variant="sidebar"
          />
        </div>

        {/* Footer Ad */}
        <div>
          <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
            <Play className="h-4 w-4 text-amber-500" />
            Bannière footer
          </h3>
          <RewardedAdViewer
            placement="footer"
            onRewardClaimed={handleRewardClaimed}
            variant="sidebar"
          />
        </div>
      </div>

      {/* Daily Ads Watched */}
      {stats && stats.adsWatched.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Publicités regardées aujourd&apos;hui
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.adsWatched.map((ad, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                  <span className="font-medium">{ad.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      {ad.views}/{ad.limit} vues
                    </span>
                    <span className="font-medium text-emerald-600">
                      +{ad.credits} crédits
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/10">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Comment ça marche ?</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Chaque publicité regardée vous rapporte des crédits</li>
              <li>Les limites se réinitialisent chaque jour à minuit</li>
              <li>Passez à un plan payant pour des crédits illimités sans pub</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
