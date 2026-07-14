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
  Loader2, CreditCard, PiggyBank, ExternalLink, Plus,
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
  stripeAccountId?: string;
  stripeOnboarded: boolean;
  lastPayoutAt?: string;
}

interface SaleTransaction {
  id: string;
  listingId: string;
  listingName: string;
  buyerName: string;
  amount: number;
  platformCommission: number;
  sellerRevenue: number;
  status: string;
  createdAt: string;
}

interface CommissionInfo {
  platformRate: number;
  sellerRate: number;
  explanation: string;
}

export function SellerDashboard() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [sales, setSales] = useState<SaleTransaction[]>([]);
  const [commission, setCommission] = useState<CommissionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const fetchSellerData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        profile: SellerProfile;
        sales: SaleTransaction[];
        commission: CommissionInfo;
      }>('/api/marketplace/seller?sales=true');

      setProfile(data.profile);
      setSales(data.sales);
      setCommission(data.commission);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSellerData();
  }, [fetchSellerData]);

  const handleWithdraw = async (method: 'stripe' | 'paypal' | 'credits') => {
    setWithdrawing(method);
    try {
      const result = await apiFetch<{
        success: boolean;
        message: string;
        withdrawalId?: string;
      }>('/api/marketplace/seller', {
        method: 'POST',
        body: JSON.stringify({ method }),
      });

      if (result.success) {
        toast({
          title: 'Retrait demandé',
          description: result.message,
        });
        fetchSellerData();
      } else {
        toast({
          title: 'Erreur',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setWithdrawing(null);
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

  // Check if user has already made sales
  const isActiveSeller = profile.totalSales > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PiggyBank className="h-6 w-6 text-primary" />
            Tableau de bord vendeur
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez vos ventes, gains et retraits.
          </p>
        </div>
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
            <CardDescription>Ventes totales</CardDescription>
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
              <p className="font-medium">Commission plateforme : {commission?.platformRate || 30}%</p>
              <p className="text-sm text-muted-foreground">
                Vous recevez <strong>{commission?.sellerRate || 70}%</strong> de chaque vente.
                Genova prélève {commission?.platformRate || 30}% pour le fonctionnement de la plateforme.
              </p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-emerald-600 font-medium">{commission?.sellerRate || 70}%</span>
                  <Progress value={70} className="w-20 h-2" />
                  <span className="text-muted-foreground">Vendeur</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-primary font-medium">{commission?.platformRate || 30}%</span>
                  <Progress value={30} className="w-20 h-2 bg-primary/20" />
                  <span className="text-muted-foreground">Genova</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="withdraw" className="space-y-4">
        <TabsList>
          <TabsTrigger value="withdraw" className="gap-2">
            <Wallet className="h-4 w-4" /> Retirer mes gains
          </TabsTrigger>
          {isActiveSeller && (
            <TabsTrigger value="sales" className="gap-2">
              <ShoppingBag className="h-4 w-4" /> Historique des ventes
            </TabsTrigger>
          )}
        </TabsList>

        {/* Withdraw Tab */}
        <TabsContent value="withdraw" className="space-y-4">
          {/* Balance */}
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">Solde disponible pour retrait</p>
              <p className="text-4xl font-bold mt-2">${profile.balance.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Soit {profile.balanceCredits.toLocaleString()} crédits
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Minimum de retrait : $5.00
              </p>
            </CardContent>
          </Card>

          {/* Withdrawal Methods */}
          {profile.balance >= 5 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Stripe Connect */}
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleWithdraw('stripe')}>
                <CardContent className="p-6 text-center space-y-3">
                  <div className="p-3 rounded-full bg-blue-500/10 text-blue-600 w-fit mx-auto">
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">Virement Stripe</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {profile.stripeOnboarded ? '✅ Compte connecté' : '❌ Non connecté'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-1"
                    disabled={withdrawing === 'stripe' || !profile.stripeOnboarded}
                  >
                    {withdrawing === 'stripe' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><ArrowUpRight className="h-4 w-4" /> Retirer</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* PayPal */}
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleWithdraw('paypal')}>
                <CardContent className="p-6 text-center space-y-3">
                  <div className="p-3 rounded-full bg-blue-500/10 text-blue-600 w-fit mx-auto">
                    <DollarSign className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">PayPal</p>
                    <p className="text-xs text-muted-foreground mt-1">Traitement sous 48h</p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-1"
                    disabled={withdrawing === 'paypal'}
                  >
                    {withdrawing === 'paypal' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><ArrowUpRight className="h-4 w-4" /> Retirer</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Crédits Genova */}
              <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleWithdraw('credits')}>
                <CardContent className="p-6 text-center space-y-3">
                  <div className="p-3 rounded-full bg-amber-500/10 text-amber-600 w-fit mx-auto">
                    <PiggyBank className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">Crédits Genova</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      +{profile.balanceCredits.toLocaleString()} crédits
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full gap-1"
                    disabled={withdrawing === 'credits'}
                  >
                    {withdrawing === 'credits' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Plus className="h-4 w-4" /> Convertir</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {profile.balance < 5 && (
            <Card>
              <CardContent className="p-6 text-center">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Vous devez avoir au moins 5$ de solde pour effectuer un retrait.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Sales History Tab */}
        {isActiveSeller && (
          <TabsContent value="sales">
            {sales.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Aucune vente pour le moment</p>
                </CardContent>
              </Card>
            ) : (
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
                          <p className="text-xs text-muted-foreground">
                            Commission: ${sale.platformCommission.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Stats Listing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" />
            Mes annonces
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{profile.totalListings}</p>
              <p className="text-xs text-muted-foreground">Total annonces</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{profile.activeListings}</p>
              <p className="text-xs text-muted-foreground">Actives</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{profile.totalSales}</p>
              <p className="text-xs text-muted-foreground">Ventes</p>
            </div>
            <div>
              <p className="text-2xl font-bold">${profile.totalCommission.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Commission Genova</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
