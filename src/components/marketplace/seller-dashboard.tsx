'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, Users, DollarSign, Package, ExternalLink,
  ChevronRight, AlertCircle, CheckCircle2, Clock
} from 'lucide-react';

interface SellerStats {
  totalRevenue: number;
  sellerEarnings: number;
  platformFees: number;
  totalSales: number;
}

interface SellerProfile {
  status: string;
  onboardingComplete: boolean;
  businessName: string | null;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
}

export function SellerDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/marketplace/seller/stats');
      const json = await res.json();

      if (json.error) {
        setError(json.error);
      } else {
        setData(json);
      }
    } catch (err) {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  const handleOnboard = async () => {
    try {
      const res = await fetch('/api/marketplace/seller/onboard');
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      alert('Failed to start onboarding');
    }
  };

  if (loading) return <div className="p-8 text-center">Chargement du tableau de bord...</div>;

  if (error === 'Seller profile not found') {
    return (
      <div className="p-12 text-center max-w-2xl mx-auto">
        <div className="bg-blue-500/10 p-6 rounded-2xl border border-blue-500/20 mb-8">
          <TrendingUp className="w-12 h-12 text-blue-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Devenir Vendeur</h2>
          <p className="text-slate-400 mb-6">
            Commencez à vendre vos agents IA et vos workflows sur la Marketplace Genova.
            Gagnez 80% sur chaque vente avec des paiements automatiques via Stripe.
          </p>
          <button
            onClick={handleOnboard}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-all"
          >
            Configurer mon compte vendeur
          </button>
        </div>
      </div>
    );
  }

  const { stats, profile, transactions } = data as { stats: SellerStats, profile: any, transactions: any[] };

  return (
    <div className="space-y-8 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord Vendeur</h1>
          <p className="text-slate-400">Gérez vos ventes et vos revenus Marketplace</p>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
            profile.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {profile.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {profile.status === 'active' ? 'Compte Actif' : 'Onboarding en cours'}
          </div>

          <button
            onClick={handleOnboard}
            className="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            Stripe Dashboard <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Revenu Total"
          value={`${stats.totalRevenue.toFixed(2)}€`}
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
          description="Volume brut des ventes"
        />
        <StatCard
          title="Vos Gains"
          value={`${stats.sellerEarnings.toFixed(2)}€`}
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          description="Après commission Genova (20%)"
        />
        <StatCard
          title="Ventes"
          value={stats.totalSales.toString()}
          icon={<Users className="w-5 h-5 text-purple-400" />}
          description="Nombre total d'acheteurs"
        />
        <StatCard
          title="Produits"
          value={profile._count?.listings || '0'}
          icon={<Package className="w-5 h-5 text-amber-400" />}
          description="Agents publiés"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-6">Performance des revenus</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={profile.analytics}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(val) => new Date(val).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `${val}€`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-6">Dernières ventes</h3>
          <div className="space-y-4">
            {transactions?.length > 0 ? transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex flex-col">
                  <span className="font-medium text-sm truncate max-w-[150px]">{t.listing.name}</span>
                  <span className="text-xs text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="text-right">
                  <div className="text-emerald-400 font-bold">+{t.sellerAmount.toFixed(2)}€</div>
                  <div className="text-[10px] text-slate-500">Statut: {t.status}</div>
                </div>
              </div>
            )) : (
              <div className="text-center py-12 text-slate-500 text-sm italic">
                Aucune vente pour le moment
              </div>
            )}

            {transactions?.length > 0 && (
              <button className="w-full text-center text-xs text-blue-400 hover:text-blue-300 py-2 flex items-center justify-center gap-1">
                Voir tout l'historique <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, description }: any) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl hover:border-slate-700 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-slate-800 rounded-lg">{icon}</div>
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs font-medium text-slate-300 mb-1">{title}</div>
      <p className="text-[10px] text-slate-500">{description}</p>
    </div>
  );
}
