"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

/**
 * Traces d'observabilité — chaque exécution (tâche, swarm, batch) est
 * tracée avec spans, latences, coûts tokens et statuts.
 */

interface TraceView {
  id: string;
  name: string;
  status: string;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costCredits: number | null;
  metadata: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: "Terminée", cls: "border-emerald-700/50 text-emerald-300" },
  RUNNING: { label: "Active", cls: "border-blue-700/50 text-blue-300" },
  FAILED: { label: "Échec", cls: "border-red-800/60 text-red-300" },
};

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/traces");
      const json = (await res.json()) as { ok: boolean; traces?: TraceView[] };
      if (json.ok && json.traces) setTraces(json.traces);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Traces d&apos;observabilité</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Journal des exécutions : durées, tokens, coûts et métadonnées de chaque opération
            tracée du moteur (tâches, swarms, batchs, connecteurs).
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" /> Rafraîchir
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : traces.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          Aucune trace pour le moment — lancez une tâche pour voir les exécutions apparaître ici.
        </div>
      ) : (
        <div className="space-y-3">
          {traces.map((t) => {
            const meta = STATUS_META[t.status] ?? { label: t.status, cls: "border-zinc-700 text-zinc-400" };
            return (
              <div key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40">
                <button
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Activity className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="truncate text-sm font-medium text-zinc-200">{t.name}</span>
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                    {t.durationMs !== null && (
                      <span className="text-[11px] text-zinc-500">{(t.durationMs / 1000).toFixed(1)}s</span>
                    )}
                    {t.costCredits !== null && (
                      <span className="text-[11px] text-zinc-500">{t.costCredits.toFixed(2)} crédits</span>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-600">
                    {new Date(t.createdAt).toLocaleString("fr-FR")}
                  </span>
                  {expanded === t.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>
                {expanded === t.id && (
                  <div className="border-t border-zinc-800 p-4">
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">Tokens entrée</div>
                        <div className="mt-0.5 font-mono text-zinc-200">{t.tokensIn ?? "—"}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">Tokens sortie</div>
                        <div className="mt-0.5 font-mono text-zinc-200">{t.tokensOut ?? "—"}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">Durée</div>
                        <div className="mt-0.5 font-mono text-zinc-200">
                          {t.durationMs !== null ? `${(t.durationMs / 1000).toFixed(2)}s` : "—"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">Coût</div>
                        <div className="mt-0.5 font-mono text-zinc-200">
                          {t.costCredits !== null ? `${t.costCredits.toFixed(2)} cr` : "—"}
                        </div>
                      </div>
                    </div>
                    {t.metadata && (
                      <div className="mt-3">
                        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Métadonnées</h4>
                        <pre className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-[11px] text-zinc-300">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(t.metadata), null, 2)
                            } catch {
                              return t.metadata
                            }
                          })()}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}
