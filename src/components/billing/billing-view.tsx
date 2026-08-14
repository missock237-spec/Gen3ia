'use client';
import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Check, Zap } from 'lucide-react';
export function BillingView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const token = localStorage.getItem('genova_token');
    fetch('/api/billing', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const plan = data?.subscription?.plan || 'free';
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Facturation</h1><p className="text-muted-foreground">Geerez votre abonnement</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-4"><CreditCard className="h-5 w-5 text-primary" /><h2 className="font-semibold">Abonnement</h2></div>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium capitalize">{plan}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Statut</span><span className="font-medium text-green-500">Actif</span></div>
            <button className="w-full mt-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
              {plan === 'free' ? 'Passer a Pro' : 'Gerer'}
            </button>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-4"><Zap className="h-5 w-5 text-yellow-500" /><h2 className="font-semibold">Credits</h2></div>
          {data?.credits?.length > 0 ? data.credits.slice(0, 5).map((c: any) => (
            <div key={c.id} className="flex justify-between text-sm py-1"><span className="text-muted-foreground">{c.description}</span><span className={c.amount > 0 ? 'text-green-500' : 'text-red-500'}>{c.amount > 0 ? '+' : ''}{c.amount}$</span></div>
          )) : <p className="text-sm text-muted-foreground">Aucune transaction</p>}
        </div>
      </div>
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="font-semibold mb-4">Factures</h2>
        {data?.invoices?.length > 0 ? data.invoices.map((inv: any) => (
          <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-border/50"><Check className="h-4 w-4 text-green-500" /><span className="text-sm">{inv.amount} {inv.currency}</span><span className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString()}</span></div>
        )) : <p className="text-sm text-muted-foreground">Aucune facture</p>}
      </div>
    </div>
  );
}
