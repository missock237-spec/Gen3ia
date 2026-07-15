'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ExternalLink, Coins, TrendingUp, ShoppingCart,
  Sparkles, Gift, ChevronRight, Percent, Clock, Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AffiliateAd {
  id: string;
  name: string;
  description: string;
  url: string;
  imageUrl?: string;
  commission: number;
  rewardCredits: number;
  program: string;
}

interface AffiliateStats {
  totalClicks: number;
  totalConversions: number;
  totalEarnings: number;
  totalCreditsEarned: number;
}

export function AffiliateAdViewer() {
  const { toast } = useToast();
  const [ads, setAds] = useState<AffiliateAd[]>([]);
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const fetchAffiliateAds = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        ads: AffiliateAd[];
        stats: AffiliateStats;
      }>('/api/ads/affiliate');
      setAds(data.ads);
      setStats(data.stats);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAffiliateAds();
  }, [fetchAffiliateAds]);

  const handleClick = async (ad: AffiliateAd) => {
    setClaimingId(ad.id);
    try {
      // Enregistrer le clic d'affiliation
      await apiFetch('/api/ads/affiliate', {
        method: 'POST',
        body: JSON.stringify({ adUnitId: ad.id }),
      });

      // Ouvrir le lien d'affiliation dans un nouvel onglet
      window.open(ad.url, '_blank', 'noopener,noreferrer');

      toast({
        title: `+${ad.rewardCredits} crédits !`,
        description: `Merci d'avoir visité ${ad.program}`,
      });

      fetchAffiliateAds();
    } catch {
      // Même en cas d'erreur, ouvrir le lien
      window.open(ad.url, '_blank', 'noopener,noreferrer');
    } finally {
      setClaimingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (ads.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* En-tête Niveau 2 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Offres partenaires recommandées
          </h2>
          <p className="text-sm text-muted-foreground">
            Découvrez nos partenaires et gagnez des crédits à chaque visite
          </p>
        </div>
        {stats && (
          <Badge variant="outline" className="gap-1.5">
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            +{stats.totalCreditsEarned} crédits gagnés
          </Badge>
        )}
      </div>

      {/* Grille des offres d'affiliation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ads.map((ad) => (
          <Card
            key={ad.id}
            className="group relative overflow-hidden border-emerald-500/10 hover:border-emerald-500/30 transition-all cursor-pointer hover:shadow-md"
            onClick={() => handleClick(ad)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate group-hover:text-emerald-600 transition-colors">
                    {ad.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {ad.description}
                  </p>
                </div>
                <Badge className="shrink-0 ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                  +{ad.rewardCredits}
                </Badge>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                {ad.commission > 0 && (
                  <span className="flex items-center gap-1">
                    <Percent className="h-3 w-3 text-emerald-500" />
                    Jusqu&apos;à {Math.round(ad.commission * 100)}% de commission
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Gift className="h-3 w-3 text-amber-500" />
                  +{ad.rewardCredits} crédits
                </span>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 group-hover:bg-emerald-500/5 group-hover:border-emerald-500/30 transition-all"
                disabled={claimingId === ad.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick(ad);
                }}
              >
                {claimingId === ad.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    Voir l&apos;offre
                    <ExternalLink className="h-3 w-3" />
                  </>
                )}
              </Button>
            </CardContent>

            {/* Badge Niveau 2 */}
            <div className="absolute top-0 right-0">
              <Badge
                variant="secondary"
                className="rounded-bl-md rounded-tr-md bg-emerald-500/10 text-emerald-600 border-0 text-[10px]"
              >
                Affiliation
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      {/* Info Commission */}
      <div className="rounded-lg bg-gradient-to-r from-emerald-500/5 to-amber-500/5 border p-3">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <p>
            <strong className="text-foreground">Comment ça marche ?</strong>{' '}
            Cliquez sur une offre partenaire, explorez le service et gagnez des crédits instantanément.
            En plus, si vous souscrivez via nos liens, vous nous soutenez et nous pouvons offrir plus de fonctionnalités gratuites !
          </p>
        </div>
      </div>
    </div>
  );
}
