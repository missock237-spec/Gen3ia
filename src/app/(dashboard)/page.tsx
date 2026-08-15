'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type DashboardStats = {
  users: number;
  activeAgents: number;
  totalExecutions: number;
  totalCreditsUsed: number;
  activeSubscriptions: number;
  failedExecutions: number;
  avgExecutionTime: number;
  uptime: number;
};

export default function DashboardPage() {
  const t = useTranslations('common');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        setStats({
          users: data.users || 0,
          activeAgents: data.activeAgents || 0,
          totalExecutions: data.totalExecutions || 0,
          totalCreditsUsed: 0,
          activeSubscriptions: data.activeSubscriptions || 0,
          failedExecutions: 0,
          avgExecutionTime: 0,
          uptime: data.uptime || 0,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Utilisateurs actifs', value: stats?.users ?? '—', icon: '👥', color: 'from-blue-500 to-blue-600' },
    { label: 'Agents actifs', value: stats?.activeAgents ?? '—', icon: '🤖', color: 'from-purple-500 to-purple-600' },
    { label: 'Exécutions totales', value: stats?.totalExecutions ?? '—', icon: '⚡', color: 'from-green-500 to-green-600' },
    { label: 'Abonnements actifs', value: stats?.activeSubscriptions ?? '—', icon: '💳', color: 'from-amber-500 to-amber-600' },
  ];

  const formatUptime = (s: number) => {
    if (!s) return '—';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return `${d}j ${h}h`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tableau de bord</h1>
        <p className="text-gray-400 mt-1">Bienvenue sur Gen3ia Agent OS</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-28 bg-gray-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card, i) => (
              <div
                key={i}
                className={`bg-gradient-to-br ${card.color} rounded-xl p-5 text-white shadow-lg`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{card.icon}</span>
                  <span className="text-2xl font-bold">{card.value}</span>
                </div>
                <p className="mt-2 text-sm opacity-90">{card.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">État du système</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Uptime</span>
                  <span className="text-white font-medium">{formatUptime(stats?.uptime ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Temps d&apos;exécution moyen</span>
                  <span className="text-white font-medium">{stats?.avgExecutionTime ?? '—'} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Échecs</span>
                  <span className="text-red-400 font-medium">{stats?.failedExecutions ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Crédits consommés</span>
                  <span className="text-amber-400 font-medium">{stats?.totalCreditsUsed ?? 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Actions rapides</h2>
              <div className="grid grid-cols-2 gap-3">
                <a href="/dashboard/agents" className="bg-gray-700/50 hover:bg-gray-700 rounded-lg p-4 text-center transition">
                  <span className="text-2xl">🤖</span>
                  <p className="text-white text-sm mt-1">Mes agents</p>
                </a>
                <a href="/dashboard/billing" className="bg-gray-700/50 hover:bg-gray-700 rounded-lg p-4 text-center transition">
                  <span className="text-2xl">💳</span>
                  <p className="text-white text-sm mt-1">Recharger</p>
                </a>
                <a href="/dashboard/monitoring" className="bg-gray-700/50 hover:bg-gray-700 rounded-lg p-4 text-center transition">
                  <span className="text-2xl">📊</span>
                  <p className="text-white text-sm mt-1">Monitoring</p>
                </a>
                <a href="/dashboard/terminal" className="bg-gray-700/50 hover:bg-gray-700 rounded-lg p-4 text-center transition">
                  <span className="text-2xl">💻</span>
                  <p className="text-white text-sm mt-1">Terminal</p>
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
