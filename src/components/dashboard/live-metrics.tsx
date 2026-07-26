'use client';

import { useEffect, useState, useCallback } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('live-metrics');

interface Metric {
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  icon?: string;
}

interface LiveEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface LiveMetricsProps {
  userId: string;
  refreshInterval?: number;
}

export function LiveMetrics({ userId, refreshInterval = 5000 }: LiveMetricsProps) {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: 'Providers actifs', value: '—', icon: '🤖' },
    { label: 'Requêtes/min', value: '—', icon: '⚡' },
    { label: 'Coût aujourd\'hui', value: '—', icon: '💰' },
    { label: 'Crédits restants', value: '—', icon: '💳' },
    { label: 'Appels vocaux', value: '—', icon: '📞' },
    { label: 'Latence moyenne', value: '—', icon: '⏱️' },
  ]);

  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  const connectSSE = useCallback(() => {
    const eventSource = new EventSource(`/api/events?userId=${userId}`);

    eventSource.onopen = () => {
      setConnected(true);
      log.info('SSE connecté au dashboard temps réel');
    };

    eventSource.addEventListener('llm_completion', (e) => {
      const data = JSON.parse(e.data);
      setEventCount(prev => prev + 1);
      setEvents(prev => [{ type: 'llm_completion', data, timestamp: data.timestamp }, ...prev].slice(0, 50));
      
      setMetrics(prev => prev.map(m => {
        if (m.label === 'Requêtes/min') return { ...m, value: eventCount + 1, change: 12, trend: 'up' };
        if (m.label === 'Coût aujourd\'hui') {
          const cost = data.data?.costUsd || 0;
          return { ...m, value: `${(parseFloat(String(m.value).replace('$', '')) + cost).toFixed(4)}$` };
        }
        return m;
      }));
    });

    eventSource.addEventListener('voice_call', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [{ type: 'voice_call', data, timestamp: data.timestamp }, ...prev].slice(0, 50));
      
      setMetrics(prev => prev.map(m => {
        if (m.label === 'Appels vocaux') {
          const count = parseInt(String(m.value)) + 1;
          return { ...m, value: count, change: 8, trend: 'up' };
        }
        return m;
      }));
    });

    eventSource.addEventListener('credit_deduction', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [{ type: 'credit_deduction', data, timestamp: data.timestamp }, ...prev].slice(0, 50));
      
      setMetrics(prev => prev.map(m => {
        if (m.label === 'Crédits restants' && data.data?.balance) {
          return { ...m, value: `${data.data.balance}`, change: -5, trend: 'down' };
        }
        return m;
      }));
    });

    eventSource.addEventListener('system_alert', (e) => {
      const data = JSON.parse(e.data);
      setEvents(prev => [{ type: 'system_alert', data, timestamp: data.timestamp }, ...prev].slice(0, 50));
    });

    eventSource.onerror = () => {
      setConnected(false);
      log.warn('SSE déconnecté, reconnexion dans 5s');
      setTimeout(connectSSE, 5000);
    };

    return eventSource;
  }, [userId, eventCount]);

  useEffect(() => {
    const eventSource = connectSSE();
    return () => eventSource.close();
  }, [connectSSE]);

  return (
    <div className="space-y-6" data-testid="live-metrics-dashboard">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          📊 Dashboard Temps Réel
        </h2>
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-500">
            {connected ? 'Connecté' : 'Déconnecté'}
          </span>
        </div>
      </div>

      {/* Grille de métriques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {metrics.map((metric, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
            data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{metric.icon}</span>
              {metric.change !== undefined && (
                <span className={`text-xs font-medium ${
                  metric.trend === 'up' ? 'text-green-500' :
                  metric.trend === 'down' ? 'text-red-500' :
                  'text-gray-400'
                }`}>
                  {metric.change > 0 ? '+' : ''}{metric.change}%
                </span>
              )}
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {metric.value}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {metric.label}
            </div>
          </div>
        ))}
      </div>

      {/* Flux d'événements */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            🔄 Événements en direct
          </h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-96 overflow-y-auto">
          {events.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-4xl mb-2">📡</p>
              <p>En attente d\'événements...</p>
              <p className="text-sm mt-1">Les données apparaîtront en temps réel</p>
            </div>
          ) : (
            events.map((event, idx) => (
              <div key={idx} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-2 text-sm">
                  <span className={
                    `px-2 py-0.5 rounded text-xs font-medium ${
                      event.type === 'llm_completion' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      event.type === 'voice_call' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                      event.type === 'credit_deduction' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      event.type === 'system_alert' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                    }`
                  }>
                    {event.type}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-gray-500 truncate flex-1">
                    {JSON.stringify(event.data).slice(0, 100)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default LiveMetrics;
