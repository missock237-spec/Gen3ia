'use client';

import { useState, useEffect } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard, Coins, Receipt, TrendingUp, Loader2, AlertCircle,
  Plus, ShoppingCart, Sparkles, ArrowUpRight,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface BillingData {
  subscription: { plan: string; status: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean } | null;
  credits: { balance: number; used: number; total: number; expiresAt: string | null } | null;
  monthlyUsage: { executions: number; totalCost: number; totalTokens: number };
  invoices: Array<{ id: string; amount: number; currency: string; status: string; createdAt: string; pdfUrl?: string }>;
  creditTransactions: Array<{ id: string; type: string; amount: number; description: string; createdAt: string }>;
}

const PLANS = [
  { id: 'free', name: 'Gratuit', price: 0, credits: 10, agents: 1 },
  { id: 'starter', name: 'Starter', price: 5000, credits: 1000, agents: 10, popular: true },
  { id: 'pro', name: 'Pro', price: 15000, credits: 5000, agents: 50 },
  { id: 'enterprise', name: 'Enterprise', price: 50000, credits: 25000, agents: -1 },
];

const CREDIT_PACKS = [
  { id: 'small', credits: 500, price: 2500, label: 'Petit pack' },
  { id: 'medium', credits: 2000, price: 8000, label: 'Pack populaire' },
  { id: 'large', credits: 5000, price: 18000, label: 'Grand pack' },
  { id: 'xlarge', credits: 15000, price: 45000, label: 'Pack Pro' },
];

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing')
      .then(res => res.json())
      .then(res => {
        if (res.success) setData(res.data);
        else setError(res.error || 'Erreur de chargement');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handlePurchase = async (type: 'plan' | 'credits', id: string) => {
    setPurchasing(`${type}:${id}`);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { setError("Erreur lors de l'achat"); } finally { setPurchasing(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <Alert variant="destructive" className="max-w-lg mx-auto mt-8">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Erreur</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  const currentPlan = data?.subscription?.plan || 'free';
  const creditPercent = data?.credits?.total
    ? Math.round(((data.credits.balance || 0) / data.credits.total) * 100) : 0;

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Facturation</h1>
        <p className="text-muted-foreground mt-2">
          Gérez vos crédits, abonnements et factures.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-500" /> Crédits disponibles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.credits?.balance ?? 0}</div>
            <div className="w-full h-2 bg-muted rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-yellow-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(creditPercent, 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{data?.credits?.used ?? 0} / {data?.credits?.total ?? 0} utilisé·s</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500" /> Abonnement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold capitalize">{currentPlan}</div>
            <Badge variant={data?.subscription?.status === 'active' ? 'default' : 'secondary'} className="mt-2">
              {data?.subscription?.status === 'active' ? 'Actif' : 'Inactif'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" /> Utilisation (30 jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.monthlyUsage?.executions ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">exécutions</p>
            <p className="text-xs text-muted-foreground mt-1">~{((data?.monthlyUsage?.totalCost ?? 0) * 1000).toFixed(0)} crédits dépensés</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Plans d&apos;abonnement</CardTitle>
          <CardDescription>Choisissez le plan qui vous convient</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`relative rounded-xl border p-4 transition-all ${currentPlan === plan.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'} ${plan.popular ? 'md:scale-105' : ''}`}>
                {plan.popular && <Badge className="absolute -top-2.5 right-2 text-xs">Populaire</Badge>}
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="text-2xl font-bold mt-2">
                  {plan.price === 0 ? 'Gratuit' : `${plan.price.toLocaleString()} FCFA`}
                  {plan.price > 0 && <span className="text-sm font-normal text-muted-foreground">/mois</span>}
                </p>
                <ul className="text-sm text-muted-foreground mt-3 space-y-1">
                  <li>✦ {plan.credits.toLocaleString()} crédits</li>
                  <li>✦ {plan.agents === -1 ? 'Illimité' : `${plan.agents}`} agents</li>
                </ul>
                <Button variant={currentPlan === plan.id ? 'outline' : 'default'} size="sm" className="w-full mt-4" disabled={currentPlan === plan.id || purchasing === `plan:${plan.id}`} onClick={() => handlePurchase('plan', plan.id)}>
                  {purchasing === `plan:${plan.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : currentPlan === plan.id ? 'Actuel' : 'Choisir'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-green-500" /> Acheter des crédits</CardTitle>
          <CardDescription>Complétez votre solde à tout moment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.id} className="rounded-xl border border-border p-4 hover:border-green-500/50 transition-all">
                <h3 className="font-semibold">{pack.credits.toLocaleString()} crédits</h3>
                <p className="text-sm text-muted-foreground">{pack.label}</p>
                <p className="text-xl font-bold mt-2">{pack.price.toLocaleString()} FCFA</p>
                <Button size="sm" className="w-full mt-4 gap-2" disabled={purchasing === `credits:${pack.id}`} onClick={() => handlePurchase('credits', pack.id)}>
                  {purchasing === `credits:${pack.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShoppingCart className="h-4 w-4" /> Acheter</>}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Factures récentes</CardTitle>
            <CardDescription>Vos 12 dernières factures</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.invoices?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune facture</p>
            ) : (
              <div className="space-y-3">
                {data.invoices.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{new Date(inv.createdAt).toLocaleDateString('fr-FR')}</p>
                      <p className="text-xs text-muted-foreground">{inv.amount} {inv.currency}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'}>{inv.status === 'paid' ? 'Payée' : inv.status}</Badge>
                      {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="p-1 hover:text-primary"><ArrowUpRight className="h-4 w-4" /></a>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Transactions de crédits</CardTitle>
            <CardDescription>Vos 20 dernières transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.creditTransactions?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune transaction</p>
            ) : (
              <div className="space-y-3">
                {data.creditTransactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <Badge variant={tx.type === 'credit' ? 'default' : 'destructive'}>{tx.type === 'credit' ? '+' : '-'}{tx.amount}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
