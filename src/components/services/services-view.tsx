'use client';
import { useState, useEffect, useCallback } from 'react';
import { Server, Play, Square, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface ServiceItem {
  id: string;
  name: string;
  status: string;
  pid: number | undefined;
  port: number;
  uptimeMs: number;
  restartCount: number;
  lastError: string | null;
  category?: string;
  description?: string;
}

interface HealthItem {
  serviceId: string;
  name: string;
  healthy: boolean;
  status: string;
  responseTimeMs: number;
  error?: string;
}

export function ServicesView() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, HealthItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ success: boolean; data: { services: ServiceItem[] } }>('/api/services');
      const list = Array.isArray(res?.data?.services) ? res.data.services : [];
      setServices(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: { services: HealthItem[] } }>('/api/services/health');
      const list = Array.isArray(res?.data?.services) ? res.data.services : [];
      const map: Record<string, HealthItem> = {};
      for (const h of list) {
        map[h.serviceId] = h;
      }
      setHealthMap(map);
    } catch {
      // health is supplementary, don't block UI
    }
  }, []);

  useEffect(() => {
    fetchServices();
    fetchHealth();
  }, [fetchServices, fetchHealth]);

  const runAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(id);
    try {
      await apiFetch(`/api/services/${id}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await fetchServices();
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setActionLoading(null);
    }
  };

  const statusLabel = (s: ServiceItem) => {
    const h = healthMap[s.id];
    if (s.status === 'running' && h?.healthy) return { label: 'Actif', color: 'text-green-500', dot: 'bg-green-500' };
    if (s.status === 'running' && h && !h.healthy) return { label: 'Degradé', color: 'text-yellow-500', dot: 'bg-yellow-500' };
    if (s.status === 'running') return { label: 'Actif', color: 'text-green-500', dot: 'bg-green-500' };
    if (s.status === 'starting' || s.status === 'stopping') return { label: s.status === 'starting' ? 'Démarrage…' : 'Arrêt…', color: 'text-yellow-500', dot: 'bg-yellow-500 animate-pulse' };
    if (s.status === 'crashed' || s.status === 'failed') return { label: 'Erreur', color: 'text-red-500', dot: 'bg-red-500' };
    return { label: 'Arrêté', color: 'text-muted-foreground', dot: 'bg-muted' };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Services</h1><p className="text-muted-foreground">Etat des services</p></div>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  if (error && services.length === 0) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Services</h1><p className="text-muted-foreground">Etat des services</p></div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <h3 className="text-lg font-medium mb-1">Erreur de chargement</h3>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <button onClick={fetchServices} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">Reessayer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Services</h1><p className="text-muted-foreground">Etat des services</p></div>
        <button onClick={() => { fetchServices(); fetchHealth(); }} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm hover:bg-accent"><RefreshCw className="h-4 w-4" /> Rafraichir</button>
      </div>

      {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>}

      {services.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border">
          <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Aucun service</h3>
          <p className="text-sm text-muted-foreground">Aucun service enregistre</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map(s => {
            const st = statusLabel(s);
            const isActing = actionLoading === s.id;
            return (
              <div key={s.id} className="bg-card rounded-xl border p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold text-sm">{s.name}</h3>
                    {s.port && <p className="text-xs text-muted-foreground">Port {s.port}</p>}
                    {s.lastError && <p className="text-xs text-red-400 mt-0.5">{s.lastError}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1 text-xs ${st.color}`}><span className={`w-2 h-2 rounded-full ${st.dot}`} />{st.label}</span>
                  <button disabled={isActing} onClick={() => runAction(s.id, s.status === 'running' ? 'stop' : 'start')} className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-50">
                    {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : s.status === 'running' ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button disabled={isActing} onClick={() => runAction(s.id, 'restart')} className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-50">
                    {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
