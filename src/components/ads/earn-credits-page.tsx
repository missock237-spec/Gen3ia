'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RewardedAdViewer } from './rewarded-ad-viewer';
import { AffiliateAdViewer } from './affiliate-ad-viewer';
import {
  Coins, Sparkles, Play, Eye, Trophy, Gift, TrendingUp,
  Info, CheckCircle2, Clock, Loader2, Video, Link2, Zap,
  Star, Lock, BadgePercent, Crown
} from 'lucide-react';

interface AdStats {
  todayEarnings: number;
  todayViews: number;
  maxDailyCredits: number;
  tierEarnings: Record<number, { earned: number; cap: number }>;
  adsWatched: { name: string; views: number; credits: number; limit: number; tier: number }[];
}

const TIER_INFO = {
  1: {
    icon: Video,
    title: 'Niveau 1 — Vidéos & Annonces',
    desc: 'Regardez des vidéos et annonces simples pour gagner des crédits',
    color: 'blue',
    bgGradient: 'from-blue-500/10 via-background to-blue-500/5',
    badgeColor: 'bg-blue-500/10 text-blue-600',
    progressColor: 'bg-blue-500',
  },
  2: {
    icon: Link2,
    title: 'Niveau 2 — Offres d\'affiliation',
    desc: 'Découvrez nos partenaires et gagnez des crédits à chaque visite',
    color: 'emerald',
    bgGradient: 'from-emerald-500/10 via-background to-emerald-500/5',
    badgeColor: 'bg-emerald-500/10 text-emerald-600',
    progressColor: 'bg-emerald-500',
  },
  3: {
    icon: Crown,
    title: 'Niveau 3 — Premium (Bientôt)',
    desc: 'Récompenses exclusives pour les utilisateurs premium',
    color: 'purple',
    bgGradient: 'from-purple-500/10 via-background to-purple-500/5',
    badgeColor: 'bg-purple-500/10 text-purple-600',
    progressColor: 'bg-purple-500',
  },
};

export function EarnCreditsPage() {
  const [stats, setStats] = useState<AdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
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

  const totalProgress = stats
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
          3 niveaux de récompense pour gagner des crédits et utiliser Genova sans abonnement.
        </p>
      </div>

      {/* Global Daily Progress */}
      <Card className="border-primary/10">
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
          <Progress value={totalProgress} className="h-2.5" />
          <p className="text-xs text-muted-foreground mt-2">
            {stats?.todayViews ?? 0} publicités regardées aujourd&apos;hui
          </p>
        </CardContent>
      </Card>

      {/* Tier Progress Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((tier) => {
            const info = TIER_INFO[tier as keyof typeof TIER_INFO];
            const Icon = info.icon;
            const tierStat = stats.tierEarnings[tier];
            const earned = tierStat?.earned ?? 0;
            const cap = tierStat?.cap ?? 0;
            const progress = cap > 0 ? Math.min(100, (earned / cap) * 100) : 0;

            return (
              <Card key={tier} className={`border-${info.color}-500/10`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 text-${info.color}-500`} />
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${info.badgeColor}`}>
                      Niveau {tier}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {tier === 1 ? 'Vidéos & annonces' : tier === 2 ? 'Affiliation' : 'Premium'}
                  </p>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{earned}</span>
                    <span className="text-muted-foreground">/ {cap} crédits</span>
                  </div>
                  <Progress
                    value={progress}
                    className={`h-1.5 ${info.progressColor}`}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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

      {/* Tabs for each tier */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="all" className="gap-1.5">
            <Zap className="h-4 w-4" />
            Tous
          </TabsTrigger>
          <TabsTrigger value="tier1" className="gap-1.5">
            <Video className="h-4 w-4 text-blue-500" />
            Niveau 1
          </TabsTrigger>
          <TabsTrigger value="tier2" className="gap-1.5">
            <BadgePercent className="h-4 w-4 text-emerald-500" />
            Niveau 2
          </TabsTrigger>
        </TabsList>

        {/* Tab: All */}
        <TabsContent value="all" className="space-y-6">
          {/* Niveau 1 Section */}
          <Card className="border-blue-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Video className="h-5 w-5 text-blue-500" />
                Niveau 1 — Vidéos & Annonces
              </CardTitle>
              <CardDescription>
                Regardez des vidéos et annonces de nos partenaires pour gagner des crédits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RewardedAdViewer
                  placement="sidebar"
                  onRewardClaimed={handleRewardClaimed}
                  variant="sidebar"
                />
                <RewardedAdViewer
                  placement="modal"
                  onRewardClaimed={handleRewardClaimed}
                  variant="sidebar"
                />
                <RewardedAdViewer
                  placement="dashboard_widget"
                  onRewardClaimed={handleRewardClaimed}
                  variant="sidebar"
                />
                <RewardedAdViewer
                  placement="footer"
                  onRewardClaimed={handleRewardClaimed}
                  variant="sidebar"
                />
              </div>
            </CardContent>
          </Card>

          {/* Niveau 2 Section */}
          <Card className="border-emerald-500/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BadgePercent className="h-5 w-5 text-emerald-500" />
                Niveau 2 — Offres d&apos;affiliation
              </CardTitle>
              <CardDescription>
                Découvrez nos partenaires recommandés et gagnez des crédits à chaque visite
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AffiliateAdViewer />
            </CardContent>
          </Card>

          {/* Niveau 3 Section */}
          <Card className="border-purple-500/10 bg-purple-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-5 w-5 text-purple-500" />
                Niveau 3 — Premium (Bientôt disponible)
              </CardTitle>
              <CardDescription>
                Des récompenses exclusives arrivent bientôt pour nos utilisateurs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center p-8 text-center">
                <div>
                  <Lock className="h-10 w-10 mx-auto text-purple-300 mb-3" />
                  <p className="font-medium text-purple-600">Niveau 3 en développement</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Des récompenses premium arrivent bientôt. Restez à l&apos;écoute !
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Tier 1 */}
        <TabsContent value="tier1" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                <Play className="h-4 w-4 text-blue-500" />
                Publicités sidebar
              </h3>
              <RewardedAdViewer
                placement="sidebar"
                onRewardClaimed={handleRewardClaimed}
                variant="sidebar"
              />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                <Play className="h-4 w-4 text-blue-500" />
                Vidéos récompensées
              </h3>
              <RewardedAdViewer
                placement="modal"
                onRewardClaimed={handleRewardClaimed}
                variant="sidebar"
              />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                <Play className="h-4 w-4 text-blue-500" />
                Découverte
              </h3>
              <RewardedAdViewer
                placement="dashboard_widget"
                onRewardClaimed={handleRewardClaimed}
                variant="sidebar"
              />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                <Play className="h-4 w-4 text-blue-500" />
                Bannière footer
              </h3>
              <RewardedAdViewer
                placement="footer"
                onRewardClaimed={handleRewardClaimed}
                variant="sidebar"
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab: Tier 2 */}
        <TabsContent value="tier2">
          <AffiliateAdViewer />
        </TabsContent>
      </Tabs>

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
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ad.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      ad.tier === 1 ? 'bg-blue-500/10 text-blue-600' :
                      ad.tier === 2 ? 'bg-emerald-500/10 text-emerald-600' :
                      'bg-purple-500/10 text-purple-600'
                    }`}>
                      N{ad.tier}
                    </span>
                  </div>
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
      <Card className="bg-gradient-to-r from-primary/5 via-background to-amber-500/5 border-primary/10">
        <CardContent className="p-4 flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">Comment gagner des crédits gratuitement ?</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Niveau 1</strong> : Regardez des vidéos et annonces simples — jusqu&apos;à 200 crédits/jour</li>
              <li><strong>Niveau 2</strong> : Visitez nos offres partenaires (affiliation) — jusqu&apos;à 150 crédits/jour</li>
              <li><strong>Niveau 3</strong> : Bientôt disponible — récompenses premium</li>
              <li>Les limites se réinitialisent chaque jour à minuit</li>
              <li>Passez à un plan payant pour des crédits illimités sans pub</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
