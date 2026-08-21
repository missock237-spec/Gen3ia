'use client';
import { useState, useEffect, useCallback } from 'react';
import { Globe, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface SessionItem {
  id: string;
  url: string;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export function BrowserView() {
  const [url, setUrl] = useState('');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [launching, setLaunching] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ sessions?: SessionItem[]; total?: number }>('/api/browser/sessions');
      const list = res?.sessions || [];
      setSessions(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const launch = async () => {
    if (!url.trim()) return;
    setLaunching(true);
    try {
      await apiFetch('/api/browser/sessions', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      setUrl('');
      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de lancement');
    } finally {
      setLaunching(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Browser</h1><p className="text-muted-foreground">Automatisation navigateur</p></div>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Browser</h1><p className="text-muted-foreground">Automatisation navigateur</p></div>

      {error && <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>}

      <div className="flex gap-2">
        <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm" onKeyDown={e => e.key === 'Enter' && launch()} />
        <button onClick={launch} disabled={!url.trim() || launching} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
          {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Lancer
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border">
          <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3>Aucune session</h3>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {sessions.map(s => (
            <div key={s.id} className="bg-card rounded-xl border p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <Globe className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.url}</p>
                  <p className="text-xs text-muted-foreground">{s.status || 'Inconnu'} {s.createdAt ? `· ${new Date(s.createdAt).toLocaleString('fr-FR')}` : ''}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>{s.status || 'inactif'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
