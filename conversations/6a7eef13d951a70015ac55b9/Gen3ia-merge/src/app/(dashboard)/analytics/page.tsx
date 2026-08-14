'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  DollarSign,
  Zap,
  Bot,
  Cpu,
  RefreshCw,
  PieChart as PieChartIcon,
  AlertTriangle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Data types matching the API responses
interface UsageSummary {
  totalCreditsUsed: number;
  totalUsdCost: number;
  currentBalance: number;
  trendPercentage: number;
  avgCreditsPerDay: number;
}

interface ExecutionsStats {
  total: number;
  successful: number;
  failed: number;
  successRate: number;
  avgDurationMs: number;
  avgTokensPerExec: number;
}

interface DailyUsagePoint {
  date: string;
  formattedDate: string;
  credits: number;
  usd: number;
  count: number;
}

interface AgentCostItem {
  id: string;
  name: string;
  type: string;
  status: string;
  executions: number;
  credits: number;
  costUsd: number;
}

interface ProviderBreakdownItem {
  provider: string;
  displayName: string;
  credits: number;
  costUsd: number;
  count: number;
  color: string;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10b981',
  groq: '#f59e0b',
  anthropic: '#8b5cf6',
  mistral: '#f97316',
  google: '#3b82f6',
  cohere: '#ec4899',
  unknown: '#6b7280',
};

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // States for transformed analytics data
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [executions, setExecutions] = useState<ExecutionsStats | null>(null);
  const [dailyData, setDailyData] = useState<DailyUsagePoint[]>([]);
  const [topAgents, setTopAgents] = useState<AgentCostItem[]>([]);
  const [providers, setProviders] = useState<ProviderBreakdownItem[]>([]);
  const [activeAgentsCount, setActiveAgentsCount] = useState<number>(0);
  const [totalAgentsCount, setTotalAgentsCount] = useState<number>(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Parallel requests to analytics API endpoints
      const [usageRes, agentUsageRes, providerUsageRes, agentsRes] = await Promise.all([
        fetch(`/api/analytics/usage?period=${period}&groupBy=day`),
        fetch(`/api/analytics/usage?period=${period}&groupBy=agent`),
        fetch(`/api/analytics/usage?period=${period}&groupBy=provider`),
        fetch(`/api/analytics/agents`),
      ]);

      if (!usageRes.ok) {
        throw new Error('Erreur lors du chargement des données de consommation.');
      }

      const usageData = await usageRes.json();
      const agentUsageData = agentUsageRes.ok ? await agentUsageRes.json() : null;
      const providerUsageData = providerUsageRes.ok ? await providerUsageRes.json() : null;
      const agentsData = agentsRes.ok ? await agentsRes.json() : null;

      // 1. Process summary & execution stats
      if (usageData.summary) {
        setSummary(usageData.summary);
      }
      if (usageData.executions) {
        setExecutions(usageData.executions);
      }

      // 2. Process daily usage points for chart
      if (usageData.grouped) {
        const rawGrouped = usageData.grouped as Record<string, { credits: number; usd: number; count: number }>;
        const points: DailyUsagePoint[] = Object.entries(rawGrouped)
          .map(([dateStr, val]) => {
            const d = new Date(dateStr);
            const formattedDate = isNaN(d.getTime())
              ? dateStr
              : d.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
            return {
              date: dateStr,
              formattedDate,
              credits: Math.round(val.credits || 0),
              usd: Number((val.usd || 0).toFixed(4)),
              count: val.count || 0,
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));

        setDailyData(points);
      } else {
        setDailyData([]);
      }

      // 3. Process Active Agents & Top Agents
      if (agentsData?.summary) {
        setActiveAgentsCount(agentsData.summary.activeAgents || 0);
        setTotalAgentsCount(agentsData.summary.totalAgents || 0);
      }

      const agentList: AgentCostItem[] = [];

      if (agentUsageData?.grouped) {
        const rawAgentGrouped = agentUsageData.grouped as Record<
          string,
          { credits: number; usd: number; executions: number }
        >;
        Object.entries(rawAgentGrouped).forEach(([name, val], index) => {
          agentList.push({
            id: `agent-${index}`,
            name,
            type: 'agent',
            status: 'active',
            executions: val.executions || 0,
            credits: Math.round(val.credits || 0),
            costUsd: Number((val.usd || 0).toFixed(4)),
          });
        });
      } else if (agentsData?.agents && Array.isArray(agentsData.agents)) {
        agentsData.agents.forEach((ag: Record<string, unknown>) => {
          agentList.push({
            id: (ag.id as string) || `ag-${Math.random()}`,
            name: (ag.name as string) || 'Agent sans nom',
            type: (ag.type as string) || 'chat',
            status: (ag.status as string) || 'active',
            executions: (ag.totalActions as number) || 0,
            credits: Math.round(((ag.totalTokens as number) || 0) / 10),
            costUsd: Number(((ag.totalCost as number) || 0).toFixed(4)),
          });
        });
      }

      // Sort by costUsd or credits descending
      agentList.sort((a, b) => b.costUsd - a.costUsd || b.credits - a.credits);
      setTopAgents(agentList.slice(0, 10));

      // 4. Process Provider Breakdown
      const providerList: ProviderBreakdownItem[] = [];
      if (providerUsageData?.grouped) {
        const rawProviderGrouped = providerUsageData.grouped as Record<
          string,
          { credits: number; usd: number; count: number }
        >;
        let colorIdx = 0;
        Object.entries(rawProviderGrouped).forEach(([prov, val]) => {
          const lowerProv = prov.toLowerCase();
          const color = PROVIDER_COLORS[lowerProv] || DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length];
          colorIdx++;

          const displayName =
            prov === 'unknown' ? 'Inconnu / Standard' : prov.charAt(0).toUpperCase() + prov.slice(1);

          providerList.push({
            provider: lowerProv,
            displayName,
            credits: Math.round(val.credits || 0),
            costUsd: Number((val.usd || 0).toFixed(4)),
            count: val.count || 0,
            color,
          });
        });
      }

      providerList.sort((a, b) => b.credits - a.credits || b.costUsd - a.costUsd);
      setProviders(providerList);
    } catch (err: unknown) {
      console.error('[AnalyticsPage] Error fetching data:', err);
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue lors de la récupération des données.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  // Total credits and usd for percentages calculation
  const totalTopAgentsCost = topAgents.reduce((sum, a) => sum + a.costUsd, 0) || 1;
  const totalProviderCredits = providers.reduce((sum, p) => sum + p.credits, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Header with Title and Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-blue-400" />
            Analytiques & Consommation
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Visualisez votre utilisation des crédits, coûts des modèles IA et performances des agents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1">
            {(
              [
                { id: '7d', label: '7 jours' },
                { id: '30d', label: '30 jours' },
                { id: '90d', label: '90 jours' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  period === p.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
            title="Rafraîchir"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between text-red-400 text-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium rounded-lg transition text-xs"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-gray-800/50 rounded-xl border border-gray-700/50 animate-pulse" />
            ))}
          </div>
          <div className="h-80 bg-gray-800/50 rounded-xl border border-gray-700/50 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-72 bg-gray-800/50 rounded-xl border border-gray-700/50 animate-pulse" />
            <div className="h-72 bg-gray-800/50 rounded-xl border border-gray-700/50 animate-pulse" />
          </div>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Credits Used */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                  Crédits consommés
                </span>
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                  <Zap className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <p className="text-2xl font-bold text-white">
                  {(summary?.totalCreditsUsed ?? 0).toLocaleString()}
                </p>
                {summary?.trendPercentage !== undefined && summary.trendPercentage !== 0 && (
                  <span
                    className={`text-xs font-semibold flex items-center gap-0.5 ${
                      summary.trendPercentage > 0 ? 'text-amber-400' : 'text-green-400'
                    }`}
                  >
                    {summary.trendPercentage > 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {Math.abs(summary.trendPercentage)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Solde actuel: <span className="text-gray-300 font-medium">{(summary?.currentBalance ?? 0).toLocaleString()}</span>
              </p>
            </div>

            {/* Total Cost */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                  Coût estimé
                </span>
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">
                ${(summary?.totalUsdCost ?? 0).toFixed(2)} USD
              </p>
              <p className="text-xs text-gray-500 mt-2">Coût réel des API partenaires</p>
            </div>

            {/* Avg Daily Usage */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                  Moyenne quotidienne
                </span>
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">
                {(summary?.avgCreditsPerDay ?? 0).toLocaleString()} <span className="text-sm font-normal text-gray-400">crédits/j</span>
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Période de {period === '7d' ? '7' : period === '90d' ? '90' : '30'} jours
              </p>
            </div>

            {/* Active Agents */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">
                  Agents actifs
                </span>
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                  <Bot className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">
                {activeAgentsCount}{' '}
                {totalAgentsCount > 0 && (
                  <span className="text-sm font-normal text-gray-400">/ {totalAgentsCount}</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-2">Agents sollicités récents</p>
            </div>
          </div>

          {/* Usage Chart (Recharts Area / Bar) */}
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                  Évolution de la consommation de crédits
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Consommation journalière en crédits sur la période sélectionnée
                </p>
              </div>
            </div>

            {isMounted && dailyData.length > 0 ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="creditsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis
                      dataKey="formattedDate"
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: '#4b5563' }}
                    />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1f2937',
                        borderColor: '#374151',
                        borderRadius: '0.5rem',
                        color: '#fff',
                        fontSize: '0.875rem',
                      }}
                      formatter={(value: unknown) => [`${value} crédits`, 'Consommation']}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="credits"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#creditsGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-gray-700 rounded-lg text-gray-500">
                <BarChart3 className="h-10 w-10 mb-2 stroke-1" />
                <p className="text-sm font-medium">Aucune donnée d'utilisation enregistrée pour cette période</p>
                <p className="text-xs text-gray-600 mt-1">
                  Les exécutions d'agents généreront un historique ici
                </p>
              </div>
            )}
          </div>

          {/* Grid for Top Agents and Provider Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Agents by Cost */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Bot className="h-5 w-5 text-purple-400" />
                    Top agents par coût
                  </h2>
                  <span className="text-xs text-gray-400">Classement par dépense</span>
                </div>

                {topAgents.length > 0 ? (
                  <div className="space-y-4">
                    {topAgents.slice(0, 5).map((agent, index) => {
                      const sharePct =
                        totalTopAgentsCost > 0 ? Math.round((agent.costUsd / totalTopAgentsCost) * 100) : 0;
                      return (
                        <div key={agent.id || index} className="space-y-1.5">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-xs text-gray-500 font-mono w-4">{index + 1}.</span>
                              <span className="text-white font-medium truncate">{agent.name}</span>
                              <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded uppercase">
                                {agent.type}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-amber-400 font-semibold">{agent.credits} cr.</span>
                              <span className="text-xs text-gray-400 ml-2">(${agent.costUsd.toFixed(3)})</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden flex-1">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.max(sharePct, 4)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400 w-10 text-right">{agent.executions} ex.</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-500 text-sm">
                    Aucun agent sollicité pendant cette période.
                  </div>
                )}
              </div>
            </div>

            {/* Provider Breakdown (Pie Chart / Bars) */}
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <PieChartIcon className="h-5 w-5 text-emerald-400" />
                    Répartition par Provider IA
                  </h2>
                  <span className="text-xs text-gray-400">Fournisseurs de modèles</span>
                </div>

                {providers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    {/* Pie Chart */}
                    <div className="h-48 w-full">
                      {isMounted && (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={providers}
                              dataKey="credits"
                              nameKey="displayName"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={70}
                              paddingAngle={4}
                            >
                              {providers.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#1f2937',
                                borderColor: '#374151',
                                borderRadius: '0.5rem',
                                color: '#fff',
                                fontSize: '0.875rem',
                              }}
                              formatter={(value: unknown) => [`${value} crédits`, 'Consommation']}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Legend Details */}
                    <div className="space-y-3">
                      {providers.map((p) => {
                        const pct = Math.round((p.credits / totalProviderCredits) * 100);
                        return (
                          <div key={p.provider} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                              <span className="text-gray-200 font-medium">{p.displayName}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-white font-semibold text-xs">{p.credits.toLocaleString()} cr.</p>
                              <p className="text-[10px] text-gray-400">{pct}% du total</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-500 text-sm">
                    Aucune statistique fournisseur disponible.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Performance & Execution Summary Card */}
          {executions && (
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Cpu className="h-5 w-5 text-amber-400" />
                Statistiques de performance des exécutions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-800">
                  <span className="text-xs text-gray-400">Total Exécutions</span>
                  <p className="text-xl font-bold text-white mt-1">{executions.total.toLocaleString()}</p>
                </div>

                <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-800">
                  <span className="text-xs text-gray-400">Taux de succès</span>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xl font-bold text-green-400">{executions.successRate}%</p>
                    <span className="text-xs text-gray-500">
                      {executions.successful} / {executions.total}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-green-500 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(executions.successRate, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-800">
                  <span className="text-xs text-gray-400">Durée moyenne</span>
                  <p className="text-xl font-bold text-white mt-1">
                    {executions.avgDurationMs > 0
                      ? (executions.avgDurationMs / 1000).toFixed(2) + ' s'
                      : '0 s'}
                  </p>
                </div>

                <div className="bg-gray-900/60 rounded-lg p-4 border border-gray-800">
                  <span className="text-xs text-gray-400">Tokens / exécution</span>
                  <p className="text-xl font-bold text-white mt-1">
                    {executions.avgTokensPerExec.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
