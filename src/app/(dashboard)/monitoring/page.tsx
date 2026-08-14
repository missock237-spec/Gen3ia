'use client';

import { useEffect, useState } from 'react';

type ServiceStatus = 'up' | 'down' | 'loading';
type SystemInfo = {
  status: string; uptime: number; database: string;
  redis?: string; qdrant?: string; version: string;
};
type CacheStats = { hits: number; misses: number; size: number; hitRate: string; redisEnabled: boolean };
type LLMStats = { available: boolean; activeProviders: number; demoMode: boolean };

export default function MonitoringPage() {
  const [health, setHealth] = useState<SystemInfo | null>(null);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [llm, setLLM] = useState<LLMStats>({ available: false, activeProviders: 0, demoMode: true });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then(r => r.json()).catch(() => null),
      fetch('/api/llm/cache').then(r => r.json()).catch(() => null),
    ]).then(([h, c]) => {
      if (h) setHealth(h);
      if (c?.stats) setCache(c.stats);
      const hasLLM = !!process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      setLLM({ available: hasLLM, activeProviders: hasLLM ? 1 : 0, demoMode: !hasLLM });
    }).finally(() => setLoading(false));
  }, []);

  const services: { name: string; status: ServiceStatus; desc: string }[] = [
    { name: 'API', status: health?.status === 'ok' ? 'up' : 'down', desc: health?.status || '—' },
    { name: 'PostgreSQL', status: health?.database === 'connected' ? 'up' : 'down', desc: health?.database || '—' },
    { name: 'Redis', status: health?.redis === 'connected' ? 'up' : 'down', desc: health?.redis || '—' },
    { name: 'Qdrant', status: health?.qdrant === 'connected' ? 'up' : 'loading', desc: health?.qdrant || '—' },
    { name: 'LLM Gateway', status: llm.available ? 'up' : 'down', desc: llm.demoMode ? 'Mode démo' : 'Connecté' },
    { name: 'Cache LLM', status: cache ? 'up' : 'down', desc: cache ? `${cache.size} entrées` : '—' },
  ];

  const formatUptime = (s: number) => {
    if (!s) return '—';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return `${d}j ${h}h`;
  };

  if (loading) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Monitoring</h1>
      {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-800/50 rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">📊 Monitoring</h1>
        <span className="text-sm text-gray-400">v{health?.version || '0.9.0'}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map(s => (
          <div key={s.name} className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium">{s.name}</span>
              <span className={`w-3 h-3 rounded-full ${
                s.status === 'up' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                s.status === 'loading' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
            </div>
            <p className="text-sm text-gray-400 mt-1">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Cache LLM</h2>
          {cache ? (
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-400">Hit rate</span><span className="text-green-400 font-medium">{cache.hitRate}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Hits</span><span className="text-white">{cache.hits.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Misses</span><span className="text-white">{cache.misses.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Entrées en cache</span><span className="text-white">{cache.size}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Redis</span>
                <span className={cache.redisEnabled ? 'text-green-400' : 'text-gray-400'}>{cache.redisEnabled ? 'Activé' : 'Mémoire'}</span>
              </div>
            </div>
          ) : <p className="text-gray-500">Cache non disponible</p>}
        </div>

        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Système</h2>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-gray-400">Uptime</span><span className="text-white font-medium">{formatUptime(health?.uptime ?? 0)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Base de données</span><span className={health?.database === 'connected' ? 'text-green-400' : 'text-red-400'}>{health?.database || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Redis</span><span className={health?.redis === 'connected' ? 'text-green-400' : 'text-yellow-400'}>{health?.redis || '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Qdrant</span><span className="text-gray-400">{health?.qdrant || 'Non configuré'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
