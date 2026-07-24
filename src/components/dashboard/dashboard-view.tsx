'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { Bot, Activity, Users, Zap, TrendingUp, Clock, AlertCircle } from 'lucide-react';

interface DashboardStats {
  agentCount: number;
  activeSessions: number;
  totalTasks: number;
  successRate: number;
  recentActivity: { action: string; createdAt: string }[];
}

export function DashboardView() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {
        setStats({
          agentCount: 0,
          activeSessions: 0,
          totalTasks: 0,
          successRate: 0,
          recentActivity: [],
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Agents', value: stats?.agentCount ?? 0, icon: Bot, color: 'text-blue-500' },
    { label: 'Sessions actives', value: stats?.activeSessions ?? 0, icon: Activity, color: 'text-green-500' },
    { label: 'Tâches totales', value: stats?.totalTasks ?? 0, icon: Zap, color: 'text-yellow-500' },
    { label: 'Taux de succès', value: `${stats?.successRate ?? 0}%`, icon: TrendingUp, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Bienvenue, {user?.name || 'Utilisateur'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Activité récente
          </h2>
          {stats?.recentActivity && stats.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {stats.recentActivity.slice(0, 5).map((act, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="flex-1">{act.action}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(act.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune activité récente</p>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Système
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium capitalize">{user?.plan || 'free'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rôle</span>
              <span className="font-medium capitalize">{user?.role || 'user'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Statut</span>
              <span className="text-green-500 font-medium">● En ligne</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
