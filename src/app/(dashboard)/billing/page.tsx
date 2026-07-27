'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Coins,
  Receipt,
  TrendingUp,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface BillingData {
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  credits: {
    balance: number;
    used: number;
    expiresAt: string | null;
  } | null;
  monthlyUsage: {
    executions: number;
    totalCost: number;
    totalTokens: number;
  };
  invoices: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    pdfUrl?: string;
  }>;
  creditTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    description: string;
    createdAt: string;
  }>;
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-lg mx-auto mt-8">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erreur</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const planLabels: Record<string, string> = {
    free: 'Gratuit',
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Facturation</h1>
        <p className="text-muted-foreground mt-2">
          Gez vos credits, abonnements et factures.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-500" />
              Credits disponibles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.credits?.balance ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.credits?.used ?? 0} credits utilises
            </p>
            {data?.credits?.expiresAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Expire le {new Date(data.credits.expiresAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500" />
              Abonnement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold capitalize">
              {planLabels[data?.subscription?.plan || 'free']}
            </div>
            <Badge
              variant={data?.subscription?.status === 'active' ? 'default' : 'secondary'}
              className="mt-2"
            >
              {data?.subscription?.status || 'actif'}
            </Badge>
            {data?.subscription?.cancelAtPeriodEnd && (
              <p className="text-xs text-destructive mt-2">
                Annule en fin de periode
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Utilisation (30 jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.monthlyUsage?.executions ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              executions
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ~{((data?.monthlyUsage?.totalCost ?? 0) * 1000).toFixed(0)} credits depenses
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Factures recentes
            </CardTitle>
            <CardDescription>
              Vos 12 dernieres factures
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.invoices?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucune facture pour le moment
              </p>
            ) : (
              <div className="space-y-3">
                {data.invoices.map(inv => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.amount} {inv.currency}
                      </p>
                    </div>
                    <Badge
                      variant={inv.status === 'paid' ? 'default' : 'secondary'}
                    >
                      {inv.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" />
              Transactions de credits
            </CardTitle>
            <CardDescription>
              Vos 20 dernieres transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.creditTransactions?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucune transaction pour le moment
              </p>
            ) : (
              <div className="space-y-3">
                {data.creditTransactions.map(tx => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {tx.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={tx.type === 'credit' ? 'default' : 'destructive'}
                    >
                      {tx.type === 'credit' ? '+' : '-'}{tx.amount}
                    </Badge>
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
