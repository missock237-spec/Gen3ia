'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import {
  Bot, Activity, _Users, Zap, TrendingUp, Clock, AlertCircle,
  Wallet, CheckCircle, _XCircle, Loader2
} from 'lucide-react';

interface DashboardStats {
  agentCount: number;
  activeSessions: number;
  totalTasks: number;
  successRate: number;
  creditsUsed: number;
  creditsRemaining: number;
  recentActivity: { action: string; createdAt: string }[];
}

export function DashboardView() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        setStats({
          agentCount: 0,
          activeSessions: 0,
          totalTasks: 0,
          successRate: 0,
          creditsUsed: 0,
          creditsRemaining: 0,
          recentActivity: [],
        });
      }
    } catch {
      setStats({
        agentCount: 0,
        activeSessions: 0,
        totalTasks: 0,
        successRate: 0,
        creditsUsed: 0,
        creditsRemaining: 0,
        recentActivity: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Wrap in async IIFE so setState inside fetchStats is deferred (not synchronous).
    let cancelled = false;
    (async () => {
      if (!cancelled) try { await fetchStats(); } catch {}
    })();
    // Rafraîchissement automatique toutes les 30s
    const interval = setInterval(() => { void fetchStats(true); }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const cards = [
    { label: 'Agents', value: stats?.agentCount ?? 0, icon: Bot, color: 'text-blue-500' },
    { label: 'Sessions actives', value: stats?.activeSessions ?? 0, icon: Activity, color: 'text-green-500' },
    { label: 'Tâches totales', value: stats?.totalTasks ?? 0, icon: Zap, color: 'text-yellow-500' },
    { label: 'Taux de succès', value: `${stats?.successRate ?? 0}%`, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Crédits utilisés', value: stats?.creditsUsed ?? 0, icon: Wallet, color: 'text-orange-500' },
    { label: 'Crédits restants', value: stats?.creditsRemaining ?? 0, icon: CheckCircle, color: 'text-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Bienvenue, {user?.name || 'Utilisateur'}
          </p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-sm transition-colors disabled:opacity-50"
        >
          <Loader2 className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Cartes statistiques */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-md hover:border-primary/20 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-sm text-muted-foreground">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activité récente */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Activité récente
          </h2>
          {stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.slice(0, 8).map((act, i) => (
                <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <span className="flex-1">{act.action}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(act.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Aucune activité récente</p>
            </div>
          )}
        </div>

        {/* Informations système */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Système
          </h2>
          <div className="space-y-4">
            {[
              { label: 'Version', value: '1.0.0' },
              { label: 'Plan', value: user?.plan || 'free', capitalize: true },
              { label: 'Rôle', value: (user as { role?: string })?.role || 'user', capitalize: true },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`text-sm font-medium ${item.capitalize ? 'capitalize' : ''}`}>
                  {item.value}
                </span>
              </div>
            ))}
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Statut</span>
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-green-500 font-medium">En ligne</span>
                </span>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
