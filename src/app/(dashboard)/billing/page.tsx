'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { CreditCard, Coins, ShoppingCart, CheckCircle2, Zap, Star, Crown, Rocket, TrendingUp, Loader2, History, Gift, Sparkles } from 'lucide-react';

interface CreditPack {
  id: string;
  credits: number;
  price: number;
  label: string;
  priceLabel: string;
}

interface Transaction {
  id: string;
  amount: number;
  balance: number;
  type: string;
  description: string;
  createdAt: string;
}

const PACK_ICONS = [Zap, Star, Crown, Rocket, TrendingUp, Sparkles];
const PACK_COLORS = [
  'from-blue-400 to-blue-600',
  'from-green-400 to-green-600',
  'from-purple-400 to-purple-600',
  'from-amber-400 to-amber-600',
  'from-red-400 to-red-600',
  'from-indigo-400 to-indigo-600',
];

export default function BillingPage() {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [balance, setBalance] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('buy');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [packsRes, creditsRes] = await Promise.all([
        fetch('/api/billing/purchase-credits'),
        fetch('/api/billing/credits'),
      ]);
      if (packsRes.ok) {
        const packsData = await packsRes.json();
        setPacks(packsData.packs || []);
      }
      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        setBalance(creditsData.balance || 0);
        setTotalSpent(creditsData.totalSpent || 0);
        setHistory(creditsData.history || []);
      }
    } catch {} finally { setLoading(false); }
  };

  const handlePurchase = async (pack: CreditPack) => {
    setPurchasing(pack.id);
    try {
      const res = await fetch('/api/billing/purchase-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      window.location.href = data.url;
    } catch { toast.error('Erreur paiement'); }
    finally { setPurchasing(null); }
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  if (loading) return (
    <div className='container mx-auto py-8 px-4 max-w-5xl space-y-6'>
      <Skeleton className='h-8 w-48' />
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
        {[...Array(6)].map((_, i) => <Skeleton key={i} className='h-44 rounded-xl' />)}
      </div>
    </div>
  );

  return (
    <div className='container mx-auto py-6 sm:py-8 px-3 sm:px-4 max-w-5xl space-y-6'>
      {/* Header + Solde */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold tracking-tight'>Boutique de Credits</h1>
          <p className='text-sm text-muted-foreground'>Achetez des credits pour utiliser les agents IA</p>
        </div>
        <Card className='border-green-500/30 bg-green-500/5'>
          <CardContent className='p-3 sm:p-4 flex items-center gap-3'>
            <Coins className='h-6 w-6 sm:h-8 sm:w-8 text-yellow-500' />
            <div>
              <p className='text-[10px] sm:text-xs text-muted-foreground'>Solde actuel</p>
              <p className='text-xl sm:text-2xl font-bold'>{balance.toLocaleString()} <span className='text-sm font-normal text-muted-foreground'>credits</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4'>
        <Card><CardContent className='p-2 sm:p-3 text-center'><p className='text-lg sm:text-2xl font-bold'>{history.length}</p><p className='text-[10px] sm:text-xs text-muted-foreground'>Transactions</p></CardContent></Card>
        <Card><CardContent className='p-2 sm:p-3 text-center'><p className='text-lg sm:text-2xl font-bold text-green-500'>+{balance}</p><p className='text-[10px] sm:text-xs text-muted-foreground'>Credits dispo</p></CardContent></Card>
        <Card><CardContent className='p-2 sm:p-3 text-center'><p className='text-lg sm:text-2xl font-bold text-blue-500'>{totalSpent.toFixed(2)}€</p><p className='text-[10px] sm:text-xs text-muted-foreground'>Depense total</p></CardContent></Card>
        <Card><CardContent className='p-2 sm:p-3 text-center'><p className='text-lg sm:text-2xl font-bold text-purple-500'>{Math.floor(balance / 1000)}</p><p className='text-[10px] sm:text-xs text-muted-foreground'>Milles credits</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value='buy' className='text-xs sm:text-sm'><ShoppingCart className='h-3 w-3 sm:h-4 sm:w-4 mr-1'/>Acheter</TabsTrigger>
          <TabsTrigger value='history' className='text-xs sm:text-sm'><History className='h-3 w-3 sm:h-4 sm:w-4 mr-1'/>Historique</TabsTrigger>
        </TabsList>

        <TabsContent value='buy' className='mt-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'>
            {packs.map((pack, index) => {
              const Icon = PACK_ICONS[index % PACK_ICONS.length];
              const colorClass = PACK_COLORS[index < 4 ? index : index % 4];
              const isPopular = pack.id === 'credits_5000' || pack.id === 'credits_25000';
              const isBestValue = pack.id === 'credits_100000';
              const pricePerCredit = (pack.price / pack.credits * 100).toFixed(1);

              return (
                <Card key={pack.id} className={`relative transition-all duration-200 hover:shadow-lg hover:scale-[1.02] ${isPopular ? 'border-primary ring-1 ring-primary/20' : ''}`}>
                  {isPopular && <Badge className='absolute -top-2 -right-2 text-[9px] sm:text-xs px-1.5 py-0.5'><Zap className='h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5'/>Populaire</Badge>}
                  {isBestValue && <Badge variant='secondary' className='absolute -top-2 -left-2 text-[9px] sm:text-xs px-1.5 py-0.5'><Star className='h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5'/>Meilleur rapport</Badge>}

                  <CardHeader className='pb-2 sm:pb-3 px-3 sm:px-4 pt-3 sm:pt-4'>
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center mb-1 sm:mb-2`}>
                      <Icon className='h-4 w-4 sm:h-5 sm:w-5 text-white' />
                    </div>
                    <CardTitle className='text-base sm:text-lg'>{pack.credits.toLocaleString()}</CardTitle>
                    <CardDescription className='text-[10px] sm:text-xs'>{pack.label}</CardDescription>
                  </CardHeader>

                  <CardContent className='px-3 sm:px-4 pb-2 sm:pb-3'>
                    <div className='text-2xl sm:text-3xl font-bold'>{pack.priceLabel}</div>
                    <p className='text-[9px] sm:text-xs text-muted-foreground'>Soit {pricePerCredit} cent(s)/credit</p>
                  </CardContent>

                  <CardFooter className='px-3 sm:px-4 pb-3 sm:pb-4 pt-0'>
                    <Button
                      className='w-full text-xs sm:text-sm h-8 sm:h-10'
                      size='sm'
                      onClick={() => handlePurchase(pack)}
                      disabled={purchasing === pack.id}
                    >
                      {purchasing === pack.id ? (
                        <Loader2 className='h-3 w-3 sm:h-4 sm:w-4 mr-1 animate-spin' />
                      ) : (
                        <CreditCard className='h-3 w-3 sm:h-4 sm:w-4 mr-1' />
                      )}
                      Acheter
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value='history' className='mt-4'>
          <Card>
            <CardContent className='p-0'>
              {history.length === 0 ? (
                <div className='text-center py-8 sm:py-12 text-muted-foreground'>
                  <CreditCard className='h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 opacity-30' />
                  <p className='text-xs sm:text-sm'>Aucune transaction pour le moment</p>
                  <p className='text-[10px] sm:text-xs'>Achetez vos premiers credits !</p>
                </div>
              ) : (
                <div className='divide-y'>
                  {history.map((tx) => (
                    <div key={tx.id} className='flex items-center justify-between p-2 sm:p-3 text-[11px] sm:text-sm'>
                      <div className='flex items-center gap-2 sm:gap-3 min-w-0'>
                        {tx.type === 'purchase' ? (
                          <ShoppingCart className='h-3 w-3 sm:h-4 sm:w-4 text-green-500 shrink-0' />
                        ) : (
                          <Coins className='h-3 w-3 sm:h-4 sm:w-4 text-blue-500 shrink-0' />
                        )}
                        <div className='min-w-0'>
                          <p className='font-medium truncate'>{tx.description}</p>
                          <p className='text-[9px] sm:text-xs text-muted-foreground'>{formatDate(tx.createdAt)}</p>
                        </div>
                      </div>
                      <div className='text-right shrink-0 ml-2'>
                        <p className={`font-bold ${tx.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </p>
                        <p className='text-[9px] sm:text-xs text-muted-foreground'>Solde: {tx.balance}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
