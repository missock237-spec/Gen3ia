'use client';

import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Users, DollarSign, Loader2 } from 'lucide-react';

interface AnalyticsData {
  totalUsers: number;
  totalAgents: number;
  totalTasks: number;
  totalTokens: number;
  totalCost: number;
  successRate: number;
}

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const metrics = [
    { label: 'Utilisateurs', value: data?.totalUsers ?? 0, icon: Users, color: 'text-blue-500' },
    { label: 'Agents', value: data?.totalAgents ?? 0, icon: TrendingUp, color: 'text-green-500' },
    { label: 'Tâches', value: data?.totalTasks ?? 0, icon: BarChart3, color: 'text-purple-500' },
    { label: 'Coût total', value: `$${data?.totalCost?.toFixed(2) ?? '0.00'}`, icon: DollarSign, color: 'text-yellow-500' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytiques</h1>
        <p className="text-muted-foreground">Statistiques et métriques d'utilisation</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <m.icon className={`h-5 w-5 ${m.color}`} />
            </div>
            <p className="text-2xl font-bold">{String(m.value)}</p>
            <p className="text-sm text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Tokens utilisés</h2>
          <p className="text-3xl font-bold text-primary">
            {(data?.totalTokens ?? 0).toLocaleString()}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Total depuis le début</p>
          <div className="mt-4 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(data?.successRate ?? 0, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Taux de succès: {data?.successRate?.toFixed(1) ?? '0'}%
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Coût par opération</h2>
          <p className="text-3xl font-bold text-yellow-500">
            ${data?.totalCost?.toFixed(4) ?? '0.00'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Coût total IA</p>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Moyenne par tâche</span>
              <span className="font-medium">
                {data?.totalTasks && data.totalTasks > 0
                  ? `$${((data.totalCost ?? 0) / data.totalTasks).toFixed(6)}`
                  : '$0.00'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
