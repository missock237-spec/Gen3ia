'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign, TrendingUp, Package, Star, ShoppingBag, Wallet,
  ArrowUpRight, CheckCircle2, XCircle, AlertCircle,
  Loader2, CreditCard, ExternalLink, Shield, Zap, Clock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SellerProfile {
  userId: string;
  totalSales: number;
  totalRevenue: number;
  totalCommission: number;
  balance: number;
  balanceCredits: number;
  totalListings: number;
  activeListings: number;
  averageRating: number;
  stripeAccountId: string | null;
  stripeOnboarded: boolean;
  stripeLink: string | null;
  instantPayoutEnabled: boolean;
  lastPayoutAt: string | null;
}

interface SaleTransaction {
  id: string;
  listingName: string;
  buyerName: string;
  amount: number;
  platformCommission: number;
  sellerRevenue: number;
  status: string;
  createdAt: string;
}

export function SellerDashboard() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [connectingStripe, setConnectingStripe] = useState(false);

  const fetchSellerData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        profile: SellerProfile;
        sales: SaleTransaction[];
        commission: { platformRate: number; sellerRate: number; explanation: string };
      }>('/api/marketplace/seller?sales=true');
      setProfile(data.profile);
      setSales(data.sales);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSellerData(); }, [fetchSellerData]);

  const handleConnectStripe = async () => {
    setConnectingStripe(true);
    try {
      const data = await apiFetch<{ url: string }>('/api/marketplace/seller/connect', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (data.url) window.location.href = data.url;
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: 'Impossible de connecter Stripe', variant: 'destructive' });
    } finally {
      setConnectingStripe(false);
    }
  };

  const handleWithdraw = async (mode: 'instant' | 'standard') => {
    setWithdrawing(true);
    try {
      const result = await apiFetch<{
        success: boolean;
        message: string;
        amount?: number;
        payoutId?: string;
      }>('/api/marketplace/seller/withdraw', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });

      toast({
        title: result.success ? '✅ Succès !' : '❌ Erreur',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
        duration: 8000,
      });

      if (result.success) fetchSellerData();
    } catch (err: unknown) {
      toast({
        title: 'Erreur',
        description: err instanceof Error ? err.message : 'Erreur de retrait',
        variant: 'destructive',
      });
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Aucune donnée vendeur</h3>
          <p className="text-muted-foreground text-sm">Publiez des annonces pour commencer à vendre.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-primary" />
          Tableau de bord vendeur
        </h1>
        <p className="text-muted-foreground mt-1">
          Gérez vos ventes et retirez vos gains. Les retraits sont instantanés via Stripe !
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenu total</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              <span className="text-2xl font-bold">${profile.totalRevenue.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Solde disponible</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span className="text-3xl font-bold">${profile.balance.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ventes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{profile.totalSales}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Note</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{profile.averageRating.toFixed(1)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retrait instantané */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-yellow-500" />
            Retrait instantané
          </CardTitle>
          <CardDescription>
            Retirez vos gains en temps réel sur votre carte bancaire via Stripe Connect.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!profile.stripeAccountId ? (
            <div className="text-center py-4">
              <p className="mb-4 text-muted-foreground">Connectez votre compte Stripe pour pouvoir retirer vos gains.</p>
              <Button size="lg" onClick={handleConnectStripe} disabled={connectingStripe} className="gap-2">
                {connectingStripe ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CreditCard className="h-5 w-5" /> Connecter Stripe</>}
              </Button>
            </div>
          ) : !profile.stripeOnboarded ? (
            <div className="text-center py-4">
              <div className="flex items-center justify-center gap-2 text-amber-600 mb-2">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Onboarding non terminé</span>
              </div>
              <Button onClick={handleConnectStripe} disabled={connectingStripe} className="gap-2">
                {connectingStripe ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Finaliser l&apos;inscription
              </Button>
            </div>
          ) : profile.balance < 1 ? (
            <div className="text-center py-4 text-muted-foreground">
              <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Solde insuffisant. Minimum 1,00$ pour un retrait.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Montant disponible</p>
                <p className="text-4xl font-bold text-primary">${profile.balance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">Frais Stripe: 1% (min 0.50$)</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Bouton Retrait Instantané */}
                <Button
                  size="lg"
                  className="h-auto py-6 gap-3 flex-col"
                  onClick={() => handleWithdraw('instant')}
                  disabled={withdrawing || !profile.instantPayoutEnabled}
                >
                  {withdrawing ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Zap className="h-6 w-6 text-yellow-400" />
                  )}
                  <div className="text-center">
                    <span className="text-base font-semibold block">Retrait instantané</span>
                    <span className="text-xs opacity-80">Arrivée sous 30 secondes sur votre carte</span>
                  </div>
                </Button>

                {/* Bouton Retrait Standard */}
                <Button
                  size="lg"
                  variant="outline"
                  className="h-auto py-6 gap-3 flex-col"
                  onClick={() => handleWithdraw('standard')}
                  disabled={withdrawing}
                >
                  <Clock className="h-6 w-6 text-muted-foreground" />
                  <div className="text-center">
                    <span className="text-base font-semibold block">Virement standard</span>
                    <span className="text-xs text-muted-foreground">Sous 2-7 jours (gratuit)</span>
                  </div>
                </Button>
              </div>

              {!profile.instantPayoutEnabled && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-sm">
                  <InfoIcon className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-700">Instantané non disponible</p>
                    <p className="text-amber-600/80 text-xs mt-1">
                      Ajoutez une carte de débit éligible dans votre dashboard Stripe pour activer
                      les retraits instantanés. Utilisez le virement standard en attendant.
                    </p>
                    {profile.stripeLink && (
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs mt-1" onClick={() => window.open(profile.stripeLink!, '_blank')}>
                        Configurer ma carte dans Stripe →
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Commission Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <TrendingUp className="h-5 w-5 text-primary shrink-0 mt-1" />
            <div className="flex-1">
              <p className="font-medium">Partage des revenus : 70% vendeur / 30% Genova</p>
              <p className="text-sm text-muted-foreground">
                Tous les paiements sont traités via Stripe. Les 70% sont transférés <strong>instantanément</strong>
                sur votre compte Stripe Connect lors de chaque vente.
              </p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-emerald-600">70% vendeur</span>
                  <Progress value={70} className="w-24 h-2" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-primary">30% Genova</span>
                  <Progress value={30} className="w-24 h-2 bg-primary/20" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales History */}
      {sales.length > 0 && (
        <>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Historique des ventes ({sales.length})
          </h3>
          <div className="space-y-2">
            {sales.map((sale) => (
              <Card key={sale.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium truncate">{sale.listingName}</span>
                        <Badge variant="outline" className="text-[10px]">{sale.status}</Badge>
                      </div>
                      <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                        <span>Acheteur: {sale.buyerName}</span>
                        <span>{new Date(sale.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-600">+${sale.sellerRevenue.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Commission: ${sale.platformCommission.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Composant icône Info (parce que lucide-react ne l'exporte pas toujours)
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
