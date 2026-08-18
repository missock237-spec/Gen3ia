// ============================================================
// Gen3ia Evolution Engine — Dashboard (overview)
// ============================================================
// Admin-only page that lists recent evolutions and lets the
// admin trigger a new cycle, approve L3 plans, or rollback.
// ============================================================

'use client';

import { useCallback, useEffect, useState } from 'react';

type EvolutionStatus =
  | 'pending' | 'running' | 'awaiting_review' | 'pr_open' | 'pr_merged'
  | 'deployed' | 'rolled_back' | 'failed' | 'cancelled' | 'skipped';

interface EvolutionRecord {
  id: string;
  triggeredBy: string;
  targetBranch: string;
  sourceBranch: string;
  scope: string;
  motivation: string;
  status: EvolutionStatus;
  phase: string;
  safetyLevel: 1 | 2 | 3;
  prUrl?: string;
  prNumber?: number;
  headSha?: string;
  previewUrl?: string;
  costUsd: number;
  totalTokens: number;
  totalDurationMs: number;
  startedAt: string;
  endedAt?: string;
  lastError?: string;
  retryCount: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const STATUS_COLORS: Record<EvolutionStatus, string> = {
  pending: 'bg-gray-700 text-gray-200',
  running: 'bg-blue-900 text-blue-200',
  awaiting_review: 'bg-yellow-900 text-yellow-200',
  pr_open: 'bg-purple-900 text-purple-200',
  pr_merged: 'bg-indigo-900 text-indigo-200',
  deployed: 'bg-green-900 text-green-200',
  rolled_back: 'bg-red-900 text-red-200',
  failed: 'bg-red-900 text-red-200',
  cancelled: 'bg-gray-800 text-gray-400',
  skipped: 'bg-gray-800 text-gray-400',
};

export default function EvolutionDashboardPage() {
  const [items, setItems] = useState<EvolutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [scope, setScope] = useState('');
  const [motivation, setMotivation] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/evolution?limit=50', { credentials: 'same-origin' });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          setError('Accès refusé — rôle admin requis');
        } else {
          setError(`Erreur ${r.status}`);
        }
        setItems([]);
        return;
      }
      const j: ApiResponse<{ items: EvolutionRecord[]; count: number }> = await r.json();
      if (j.success && j.data) {
        setItems(j.data.items);
      } else {
        setError(j.error ?? 'Réponse invalide');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const triggerEvolution = useCallback(async () => {
    if (!scope.trim() || !motivation.trim()) {
      setError('Scope et motivation requis');
      return;
    }
    setTriggering(true);
    setError(null);
    try {
      const r = await fetch('/api/evolution', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: scope.trim(), motivation: motivation.trim() }),
      });
      const j: ApiResponse<{ evolution: EvolutionRecord }> = await r.json();
      if (j.success && j.data) {
        setScope('');
        setMotivation('');
        await load();
      } else {
        setError(j.error ?? 'Échec du déclenchement');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setTriggering(false);
    }
  }, [scope, motivation, load]);

  const approve = useCallback(async (id: string) => {
    const r = await fetch(`/api/evolution/${id}/approve`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setError(j?.error ?? `Erreur ${r.status}`);
      return;
    }
    await load();
  }, [load]);

  const rollback = useCallback(async (id: string) => {
    if (!confirm(`Confirmer le rollback de ${id} ?`)) return;
    const r = await fetch(`/api/evolution/${id}/rollback`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Manual rollback from dashboard' }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setError(j?.error ?? `Erreur ${r.status}`);
      return;
    }
    await load();
  }, [load]);

  const cancel = useCallback(async (id: string) => {
    if (!confirm(`Annuler l'évolution ${id} ?`)) return;
    const r = await fetch(`/api/evolution/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setError(j?.error ?? `Erreur ${r.status}`);
      return;
    }
    await load();
  }, [load]);

  const fmtDuration = (ms: number) => {
    if (!ms) return '—';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  const fmtCost = (usd: number) => `$${usd.toFixed(4)}`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🧬 Evolution Engine</h1>
          <p className="text-sm text-gray-400 mt-1">
            Auto-analyse, auto-correction et évolution contrôlée du projet Gen3ia.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-md"
        >
          Rafraîchir
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Trigger new evolution */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold text-white">Déclencher une nouvelle évolution</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Scope (ex: agents, billing, api)"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="px-3 py-2 bg-gray-800 text-white rounded-md border border-gray-700"
            maxLength={80}
          />
          <input
            type="text"
            placeholder="Motivation (ex: corriger crashes agent invocation)"
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            className="px-3 py-2 bg-gray-800 text-white rounded-md border border-gray-700"
            maxLength={500}
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => void triggerEvolution()}
            disabled={triggering || !scope.trim() || !motivation.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md text-sm font-medium"
          >
            {triggering ? 'Déclenchement…' : 'Démarrer l\'évolution'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Évolutions récentes</h2>
          <span className="text-xs text-gray-400">{items.length} affichées</span>
        </div>
        {loading ? (
          <div className="p-4 text-gray-400 text-sm">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-gray-400 text-sm">Aucune évolution enregistrée.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {items.map((evo) => (
              <div key={evo.id} className="p-4 hover:bg-gray-800/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[evo.status]}`}>
                        {evo.status}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300">
                        L{evo.safetyLevel}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300">
                        {evo.phase}
                      </span>
                      <span className="text-xs text-gray-400">{evo.scope}</span>
                    </div>
                    <div className="mt-1 text-sm text-white truncate">{evo.motivation}</div>
                    <div className="mt-1 text-xs text-gray-400 flex gap-4 flex-wrap">
                      <span>🎯 {evo.targetBranch}</span>
                      <span>🌿 {evo.sourceBranch}</span>
                      <span>💰 {fmtCost(evo.costUsd)}</span>
                      <span>🔢 {evo.totalTokens.toLocaleString()} tok</span>
                      <span>⏱ {fmtDuration(evo.totalDurationMs)}</span>
                      <span>🔁 retry {evo.retryCount}</span>
                    </div>
                    {evo.lastError && (
                      <div className="mt-1 text-xs text-red-400 truncate">⚠ {evo.lastError}</div>
                    )}
                    {evo.prUrl && (
                      <a
                        href={evo.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-blue-400 hover:underline"
                      >
                        PR #{evo.prNumber} →
                      </a>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {evo.status === 'awaiting_review' && (
                      <button
                        onClick={() => void approve(evo.id)}
                        className="px-3 py-1 text-xs bg-yellow-700 hover:bg-yellow-600 text-white rounded-md"
                      >
                        Approuver (L3)
                      </button>
                    )}
                    {(evo.status === 'pr_merged' || evo.status === 'deployed') && (
                      <button
                        onClick={() => void rollback(evo.id)}
                        className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded-md"
                      >
                        Rollback
                      </button>
                    )}
                    {(evo.status === 'running' || evo.status === 'awaiting_review') && (
                      <button
                        onClick={() => void cancel(evo.id)}
                        className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-md"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
