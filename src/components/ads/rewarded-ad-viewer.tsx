'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Coins, Eye, Play, CheckCircle2, Clock, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AdData {
  id: string;
  name: string;
  format: string;
  width: number;
  height: number;
  rewardCredits: number;
  imageUrl?: string;
  targetUrl?: string;
  alt?: string;
  placement: string;
}

interface AdEligibility {
  success: boolean;
  creditsAwarded: number;
  totalToday: number;
  dailyLimit: number;
  cooldownRemaining: number;
  message: string;
}

interface AdStats {
  todayEarnings: number;
  todayViews: number;
  maxDailyCredits: number;
  adsWatched: { name: string; views: number; credits: number; limit: number }[];
}

interface AdViewerProps {
  placement: string;
  onRewardClaimed?: (credits: number) => void;
  showStats?: boolean;
  variant?: 'banner' | 'sidebar' | 'inline' | 'widget';
}

export function RewardedAdViewer({
  placement,
  onRewardClaimed,
  showStats = false,
  variant = 'sidebar',
}: AdViewerProps) {
  const { toast } = useToast();
  const [ad, setAd] = useState<AdData | null>(null);
  const [eligibility, setEligibility] = useState<AdEligibility | null>(null);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [adViewed, setAdViewed] = useState(false);
  const [cooldownTimer, setCooldownTimer] = useState(0);

  const fetchAd = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ placement });
      if (showStats) params.set('stats', 'true');

      const data = await apiFetch<{
        ad: AdData | null;
        eligibility: AdEligibility | null;
        stats?: AdStats;
        placements?: string[];
      }>(`/api/ads?${params.toString()}`);

      setAd(data.ad);
      setEligibility(data.eligibility);
      if (data.stats) setStats(data.stats);

      if (data.eligibility && !data.eligibility.success && data.eligibility.cooldownRemaining > 0) {
        setCooldownTimer(data.eligibility.cooldownRemaining);
      }
    } catch {
      setAd(null);
    } finally {
      setLoading(false);
    }
  }, [placement, showStats]);

  useEffect(() => {
    fetchAd();
  }, [fetchAd]);

  useEffect(() => {
    if (cooldownTimer <= 0) return;
    const interval = setInterval(() => {
      setCooldownTimer((prev) => {
        if (prev <= 1) {
          fetchAd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownTimer, fetchAd]);

  const handleViewAd = () => {
    setAdViewed(true);
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleClaimReward();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleClaimReward = async () => {
    if (!ad) return;
    setClaiming(true);

    try {
      const result = await apiFetch<{
        success: boolean;
        creditsAwarded: number;
        totalToday: number;
        message: string;
      }>('/api/ads', {
        method: 'POST',
        body: JSON.stringify({ adUnitId: ad.id }),
      });

      if (result.success) {
        setClaimed(true);
        toast({
          title: `+${result.creditsAwarded} crédits gagnés !`,
          description: result.message,
        });
        onRewardClaimed?.(result.creditsAwarded);

        setTimeout(() => {
          setClaimed(false);
          setAdViewed(false);
          fetchAd();
        }, 2000);
      }
    } catch (err) {
      toast({
        title: 'Erreur',
        description: 'Impossible de réclamer la récompense',
        variant: 'destructive',
      });
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!ad) return null;

  const isEligible = eligibility?.success ?? false;
  const canClaim = adViewed && !claimed && !claiming;

  if (variant === 'banner') {
    return (
      <Card className="overflow-hidden border-primary/10 bg-gradient-to-r from-primary/5 via-background to-primary/5">
        <CardContent className="p-0">
          <div className="flex items-center gap-4 p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium truncate">{ad.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Regardez pour gagner <span className="font-bold text-amber-500">+{ad.rewardCredits} crédits</span>
              </p>
            </div>
            <Button
              size="sm"
              variant={isEligible ? 'default' : 'outline'}
              disabled={!isEligible || claiming}
              onClick={handleViewAd}
              className="shrink-0 gap-1"
            >
              {claiming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : claimed ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : countdown > 0 ? (
                <>{countdown}s</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> Voir</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden ${claimed ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 shrink-0">
              <Coins className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{ad.name}</p>
              <p className="text-xs text-muted-foreground">
                +{ad.rewardCredits} crédits &bull; {eligibility?.totalToday ?? 0}/{eligibility?.dailyLimit ?? ad.rewardCredits} aujourd&apos;hui
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
            +{ad.rewardCredits}
          </span>
        </div>

        <div
          className={`relative rounded-lg overflow-hidden bg-muted/30 border ${adViewed ? 'ring-2 ring-primary/20' : ''}`}
          style={{ aspectRatio: `${ad.width}/${ad.height}` }}
        >
          {ad.imageUrl ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 p-4">
              <div className="text-center">
                <Sparkles className="h-8 w-8 mx-auto text-primary/40 mb-2" />
                <p className="text-sm font-medium">{ad.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{ad.alt}</p>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
              <Eye className="h-8 w-8 text-primary/30" />
            </div>
          )}

          {adViewed && !claimed && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="text-center text-white">
                {countdown > 0 ? (
                  <>
                    <div className="text-3xl font-bold mb-1">{countdown}</div>
                    <p className="text-sm text-white/70">Regardez la publicité...</p>
                  </>
                ) : claiming ? (
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                ) : null}
              </div>
            </div>
          )}

          {claimed && (
            <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
              <div className="text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-1" />
                <p className="text-sm font-medium text-emerald-600">
                  +{eligibility?.creditsAwarded || ad.rewardCredits} crédits
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!adViewed ? (
            <Button
              className="flex-1 gap-1.5"
              size="sm"
              disabled={!isEligible || claiming}
              onClick={handleViewAd}
            >
              {!isEligible && cooldownTimer > 0 ? (
                <><Clock className="h-3.5 w-3.5" /> {cooldownTimer}s</>
              ) : (
                <><Play className="h-3.5 w-3.5" /> Regarder pour gagner</>
              )}
            </Button>
          ) : claimed ? (
            <Button className="flex-1" size="sm" variant="outline" disabled>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
              Récompense obtenue
            </Button>
          ) : (
            <Button className="flex-1" size="sm" disabled>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              {countdown > 0 ? `Regardez... (${countdown}s)` : 'Traitement...'}
            </Button>
          )}
        </div>

        {eligibility && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Quotidien</span>
              <span>{eligibility.totalToday}/{eligibility.dailyLimit}</span>
            </div>
            <Progress
              value={(eligibility.totalToday / eligibility.dailyLimit) * 100}
              className="h-1"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
