"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

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

const STATUS_META: Record<string, { labelKey: TranslationKey; cls: string }> = {
  COMPLETED: { labelKey: "traces.status.COMPLETED", cls: "border-emerald-700/50 text-emerald-300" },
  RUNNING: { labelKey: "traces.status.RUNNING", cls: "border-blue-700/50 text-blue-300" },
  FAILED: { labelKey: "traces.status.FAILED", cls: "border-red-800/60 text-red-300" },
};

export default function TracesPage() {
  const { t, lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
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
          <h1 className="text-2xl font-bold tracking-tight">{t("traces.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            {t("traces.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" /> {t("common.refresh")}
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
          {t("traces.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {traces.map((trace) => {
            const statusMeta = STATUS_META[trace.status];
            const meta = statusMeta
              ? { label: t(statusMeta.labelKey), cls: statusMeta.cls }
              : { label: trace.status, cls: "border-zinc-700 text-zinc-400" };
            return (
              <div key={trace.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40">
                <button
                  onClick={() => setExpanded(expanded === trace.id ? null : trace.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Activity className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="truncate text-sm font-medium text-zinc-200">{trace.name}</span>
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                    {trace.durationMs !== null && (
                      <span className="text-[11px] text-zinc-500">{(trace.durationMs / 1000).toFixed(1)}s</span>
                    )}
                    {trace.costCredits !== null && (
                      <span className="text-[11px] text-zinc-500">{trace.costCredits.toFixed(2)} {t("traces.credits")}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] text-zinc-600">
                    {new Date(trace.createdAt).toLocaleString(locale)}
                  </span>
                  {expanded === trace.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>
                {expanded === trace.id && (
                  <div className="border-t border-zinc-800 p-4">
                    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">{t("traces.tokensIn")}</div>
                        <div className="mt-0.5 font-mono text-zinc-200">{trace.tokensIn ?? "—"}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">{t("traces.tokensOut")}</div>
                        <div className="mt-0.5 font-mono text-zinc-200">{trace.tokensOut ?? "—"}</div>
                      </div>
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">{t("traces.duration")}</div>
                        <div className="mt-0.5 font-mono text-zinc-200">
                          {trace.durationMs !== null ? `${(trace.durationMs / 1000).toFixed(2)}s` : "—"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
                        <div className="text-zinc-500">{t("traces.cost")}</div>
                        <div className="mt-0.5 font-mono text-zinc-200">
                          {trace.costCredits !== null ? `${trace.costCredits.toFixed(2)} cr` : "—"}
                        </div>
                      </div>
                    </div>
                    {trace.metadata && (
                      <div className="mt-3">
                        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">{t("traces.metadata")}</h4>
                        <pre className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-[11px] text-zinc-300">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(trace.metadata), null, 2)
                            } catch {
                              return trace.metadata
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
