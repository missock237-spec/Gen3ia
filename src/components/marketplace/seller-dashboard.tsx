'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign, TrendingUp, Package, Star, ShoppingBag, Wallet,
  ArrowUpRight, Clock, CheckCircle2, XCircle, AlertCircle,
  Loader2, CreditCard, ExternalLink, Shield,
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

  const handleWithdrawStripe = async () => {
    setWithdrawing(true);
    try {
      const result = await apiFetch<{ success: boolean; message: string }>('/api/marketplace/seller/withdraw', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast({
        title: result.success ? '✅ Retrait effectué' : '❌ Erreur',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      fetchSellerData();
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur', variant: 'destructive' });
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
          Gérez vos ventes et retirez vos gains via Stripe.
        </p>
      </div>

      {/* Stats Cards */}
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
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Solde disponible</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">${profile.balance.toFixed(2)}</span>
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
            <CardDescription>Note moyenne</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <span className="text-2xl font-bold">{profile.averageRating.toFixed(1)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Commission Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Partage des revenus : 70% vendeur / 30% plateforme</p>
              <p className="text-sm text-muted-foreground">
                Tous les paiements sont traités via <strong>Stripe</strong>. Les vendeurs reçoivent leurs gains
                directement sur leur compte Stripe Connect (virement bancaire).
              </p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-600 font-medium">70%</span>
                  <Progress value={70} className="w-20 h-2" />
                  <span className="text-muted-foreground">Vendeur</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-primary font-medium">30%</span>
                  <Progress value={30} className="w-20 h-2 bg-primary/20" />
                  <span className="text-muted-foreground">Genova</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stripe Connect Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Paiements Stripe
          </CardTitle>
          <CardDescription>
            Connectez votre compte Stripe pour recevoir vos paiements. Stripe reverse directement
            sur votre compte bancaire sous 2-7 jours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!profile.stripeAccountId ? (
            <Button
              size="lg"
              className="gap-2"
              onClick={handleConnectStripe}
              disabled={connectingStripe}
            >
              {connectingStripe ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <><CreditCard className="h-5 w-5" /> Connecter mon compte Stripe</>
              )}
            </Button>
          ) : !profile.stripeOnboarded ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Onboarding Stripe non terminé</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Vous avez créé un compte Stripe mais vous devez finaliser l&apos;inscription
                pour recevoir vos paiements.
              </p>
              <Button onClick={handleConnectStripe} disabled={connectingStripe} className="gap-2">
                {connectingStripe ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Finaliser l&apos;inscription Stripe
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Compte Stripe connecté ✅</span>
              </div>
              <div className="flex items-center gap-4">
                {profile.stripeLink && (
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(profile.stripeLink!, '_blank')}>
                    <ExternalLink className="h-4 w-4" />
                    Dashboard Stripe
                  </Button>
                )}
                {profile.balance >= 5 && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={handleWithdrawStripe}
                    disabled={withdrawing}
                  >
                    {withdrawing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><ArrowUpRight className="h-4 w-4" /> Retirer ${profile.balance.toFixed(2)}</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales History */}
      {sales.length > 0 && (
        <>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Historique des ventes
          </h3>
          <div className="space-y-3">
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
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
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
