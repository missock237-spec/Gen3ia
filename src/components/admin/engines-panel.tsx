"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPatch, apiPost } from "@/lib/client/hooks";
import { Loader2, Gauge, Database, Zap, ShieldOff, Trash2, RotateCcw, Activity } from "lucide-react";

/**
 * v3.1 — Panneau d'administration des moteurs :
 *  - performances temps réel (EngineRun 7 jours) par moteur ;
 *  - état des circuit breakers, cache de plans, stockage vectoriel ;
 *  - pondérations de la formule d'évaluation éditables (SystemConfig).
 */

interface EngineHealth {
  name: string
  description: string
  phase: string | null
  stats: {
    runs: number
    okRate: number
    avgDurationMs: number
    p95DurationMs: number
    lastErrorCode: string | null
    lastRunAt: string | null
    tokensIn: number
    tokensOut: number
    credits: number
  } | null
}

interface EnginesData {
  ok: boolean
  engines: EngineHealth[]
  breakers: { key: string; state: string; failures: number; lastError: string | null; retryInMs: number }[]
  planCache: { entries: number; totalHits: number; enabled: boolean; semanticThreshold: number; ttlDays: number }
  vectorStore: { provider: string; model: string; dim: number; totalVectors: number }
  instance: { planCache: { hits: number; misses: number }; breakerTrips: number; vectorSearches: number }
  system: {
    evaluatorWeights: Record<string, number>
    planCache: boolean
    defaultPlanApproval: string
    maxTotalRetries: number
  }
}

const WEIGHT_LABELS: Record<string, string> = {
  successRate: "Taux de succès",
  accuracy: "Précision",
  cost: "Coût",
  latency: "Latence",
  risk: "Risque",
  completeness: "Complétude",
}

export function EnginesPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<EnginesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [maxRetries, setMaxRetries] = useState(8);
  const [approvalDefault, setApprovalDefault] = useState("auto");

  async function load() {
    try {
      const res = await apiGet<EnginesData>("/api/admin/engines");
      if (res.ok) {
        setData(res);
        setWeights(res.system.evaluatorWeights);
        setMaxRetries(res.system.maxTotalRetries);
        setApprovalDefault(res.system.defaultPlanApproval);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000); // rafraîchissement temps réel
    return () => clearInterval(timer);
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await apiPatch("/api/admin/engines", {
        evaluatorWeights: weights,
        maxTotalRetries: maxRetries,
        defaultPlanApproval: approvalDefault,
      });
      if (!res.ok) throw new Error(res.error);
      toast({
        title: "Configuration enregistrée",
        description: `Somme des pondérations normalisée : ${Object.values(weights).reduce((a, b) => a + b, 0).toFixed(2)} → 1.00.`,
      });
      await load();
    } catch (err) {
      toast({ title: "Enregistrement impossible", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function action(kind: "purge-plan-cache" | "reset-breakers") {
    try {
      const res = await apiPost("/api/admin/engines", { action: kind });
      if (!res.ok) throw new Error(res.error);
      toast({
        title: kind === "purge-plan-cache" ? "Cache de plans purgé" : "Circuit breakers réinitialisés",
      });
      await load();
    } catch (err) {
      toast({ title: "Action impossible", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  }

  if (loading && !data) {
    return <Skeleton className="h-96 w-full bg-zinc-800/60" />;
  }

  const weightSum = Object.values(weights).reduce((a, b) => a + (b || 0), 0);

  return (
    <div className="space-y-4">
      {/* Performance des moteurs */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-400" /> Moteurs — performances (7 derniers jours)
            <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 font-normal">
              <Activity className="h-3 w-3 animate-pulse" /> temps réel
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800 text-left">
                  <th className="py-2 pr-3">Moteur</th>
                  <th className="py-2 pr-3">Exécutions</th>
                  <th className="py-2 pr-3">Succès</th>
                  <th className="py-2 pr-3">Latence moy.</th>
                  <th className="py-2 pr-3">Latence p95</th>
                  <th className="py-2 pr-3">Tokens</th>
                  <th className="py-2">Dernière erreur</th>
                </tr>
              </thead>
              <tbody>
                {(data?.engines ?? []).map((e) => {
                  const s = e.stats;
                  const okPct = s ? Math.round(s.okRate * 100) : null;
                  return (
                    <tr key={e.name} className="border-b border-zinc-800/50 hover:bg-zinc-900/60">
                      <td className="py-2.5 pr-3">
                        <div className="font-mono text-teal-300">{e.name}</div>
                        <div className="text-zinc-600 text-[10px] max-w-[220px] truncate">{e.description}</div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono">{s?.runs ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        {okPct === null ? (
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <Badge
                            variant="outline"
                            className={
                              okPct >= 90
                                ? "border-emerald-600/50 text-emerald-300"
                                : okPct >= 70
                                  ? "border-amber-600/50 text-amber-300"
                                  : "border-red-600/50 text-red-300"
                            }
                          >
                            {okPct}%
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono">{s ? `${(s.avgDurationMs / 1000).toFixed(1)} s` : "—"}</td>
                      <td className="py-2.5 pr-3 font-mono">{s ? `${(s.p95DurationMs / 1000).toFixed(1)} s` : "—"}</td>
                      <td className="py-2.5 pr-3 font-mono text-zinc-400">
                        {s ? `${((s.tokensIn + s.tokensOut) / 1000).toFixed(1)}k` : "—"}
                      </td>
                      <td className="py-2.5 font-mono text-red-400/80 text-[10px] max-w-[160px] truncate">
                        {s?.lastErrorCode ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Pondérations de l'évaluateur */}
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" /> Pondérations d'évaluation (défaut global)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-zinc-500">
              Appliquées quand l'utilisateur n'a pas défini ses propres poids (priorité : utilisateur &gt; système &gt; défaut).
              La sauvegarde normalise automatiquement la somme à 1.
            </p>
            {Object.keys(WEIGHT_LABELS).map((key) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-28 shrink-0">{WEIGHT_LABELS[key]}</span>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={weights[key] ?? 0}
                  onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                  className="flex-1 accent-teal-400"
                />
                <span className="font-mono text-xs text-teal-300 w-10 text-right">
                  {(weights[key] ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <div className="text-xs">
                <span className="text-zinc-500">Somme : </span>
                <span className={`font-mono ${Math.abs(weightSum - 1) < 0.02 ? "text-emerald-400" : "text-amber-400"}`}>
                  {weightSum.toFixed(2)}
                </span>
                <span className="text-zinc-600"> (auto-normalisée)</span>
              </div>
              <Button size="sm" className="bg-teal-500 hover:bg-teal-400 text-zinc-950" disabled={saving} onClick={saveSettings}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enregistrer"}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Budget global de retries / tâche</label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Mode Explain par défaut</label>
                <select
                  value={approvalDefault}
                  onChange={(e) => setApprovalDefault(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm"
                >
                  <option value="auto">auto (exécution directe)</option>
                  <option value="manual">manual (approbation des plans)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Breakers + cache + vecteurs */}
        <div className="space-y-4">
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldOff className="h-4 w-4 text-amber-400" /> Circuit breakers
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 border-zinc-700 text-xs text-zinc-400"
                  onClick={() => action("reset-breakers")}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="ml-1">Réinitialiser</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 font-mono text-xs">
              {(data?.breakers ?? []).length === 0 && (
                <p className="text-zinc-600 py-2 text-center">Aucun breaker actif — aucune dépendance en échec répété.</p>
              )}
              {(data?.breakers ?? []).map((b) => (
                <div key={b.key} className="flex items-center gap-3 rounded border border-zinc-800/60 bg-zinc-950 px-3 py-2">
                  <Badge
                    variant="outline"
                    className={
                      b.state === "OPEN"
                        ? "border-red-600/50 text-red-300"
                        : b.state === "HALF_OPEN"
                          ? "border-amber-600/50 text-amber-300"
                          : "border-emerald-600/50 text-emerald-300"
                    }
                  >
                    {b.state}
                  </Badge>
                  <span className="text-zinc-300 truncate">{b.key}</span>
                  <span className="ml-auto text-zinc-600 shrink-0">
                    {b.failures} échec(s){b.retryInMs > 0 ? ` · reprise dans ${Math.ceil(b.retryInMs / 1000)} s` : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-teal-400" /> Cache de plans & vecteurs
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 border-zinc-700 text-xs text-zinc-400"
                  onClick={() => action("purge-plan-cache")}
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="ml-1">Purger</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500">Cache de plans</span>
                <span className="font-mono text-zinc-300">
                  {data?.planCache.entries ?? 0} entrées · {data?.planCache.totalHits ?? 0} hits ·{" "}
                  {data?.planCache.enabled ? "activé" : "désactivé"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Seuil sémantique / TTL</span>
                <span className="font-mono text-zinc-300">
                  cos ≥ {data?.planCache.semanticThreshold ?? 0.92} · {data?.planCache.ttlDays ?? 7} jours
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Stockage vectoriel</span>
                <span className="font-mono text-zinc-300">
                  {data?.vectorStore.totalVectors ?? 0} vecteurs · {data?.vectorStore.model ?? "local"} ({data?.vectorStore.dim ?? 0} d)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Instance courante</span>
                <span className="font-mono text-zinc-300">
                  {data?.instance.vectorSearches ?? 0} recherches · {data?.instance.breakerTrips ?? 0} ouvertures de breaker
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
