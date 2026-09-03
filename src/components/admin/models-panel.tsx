"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { formatCredits } from "@/lib/client/hooks";
import { Cpu, Activity, RefreshCw, PowerOff, Power, AlertTriangle, Radio } from "lucide-react";

/**
 * Panneau « Santé des modèles » (v3.6 — observabilité admin) :
 *  - taux de succès, latence (avg + p95), tokens, crédits et coût par
 *    fournisseur LLM (GLM/ZAI, OpenRouter, Groq…) sur 24 h ;
 *  - BASCULE MANUELLE : désactiver/réactiver un fournisseur (chaîne de
 *    repli du routeur) — effective immédiatement ;
 *  - alerting : règles à seuils dynamiques avec recommandations d'action ;
 *  - état de l'export OTLP.
 */

interface ProviderHealth {
  provider: string;
  runs: number;
  okRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  tokensIn: number;
  tokensOut: number;
  credits: number;
  lastError: string | null;
  lastRunAt: string | null;
  disabled: boolean;
}

interface AlertEvaluation {
  ruleId: string;
  title: string;
  triggered: boolean;
  observed: number;
  threshold: number;
  thresholdSource: "static" | "dynamic-baseline";
  windowMinutes: number;
  recommendation: string;
}

interface OtelStatus {
  enabled: boolean;
  endpoint: string | null;
  serviceName: string;
  queued: number;
  exported: number;
  failures: number;
  instrumentDb: boolean;
}

export function ModelsPanel() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [providers, setProviders] = useState<ProviderHealth[] | null>(null);
  const [alerts, setAlerts] = useState<AlertEvaluation[] | null>(null);
  const [otel, setOtel] = useState<OtelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/models");
      const data = await res.json();
      if (data.ok) {
        setProviders(data.providers);
        setAlerts(data.alerting);
        setOtel(data.otel);
      }
    } catch {
      toast({ title: t("admin.models.loadFailed"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (provider: string, disabled: boolean) => {
      setToggling(provider);
      try {
        const res = await fetch("/api/admin/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, disabled }),
        });
        const data = await res.json();
        if (data.ok) {
          toast({
            title: disabled
              ? t("admin.models.disabled.title", { provider })
              : t("admin.models.enabled.title", { provider }),
            description: disabled ? t("admin.models.disabled.desc") : t("admin.models.enabled.desc"),
          });
          await load();
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        toast({
          title: t("admin.models.toggleFailed"),
          description: err instanceof Error ? err.message : "",
          variant: "destructive",
        });
      } finally {
        setToggling(null);
      }
    },
    [load, t, toast]
  );

  const triggered = (alerts ?? []).filter((a) => a.triggered);

  return (
    <div className="space-y-6">
      {/* Alerting intelligent */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${triggered.length > 0 ? "text-amber-400" : "text-zinc-600"}`} />
            {t("admin.models.alerting")}
            {triggered.length > 0 && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                {triggered.length}
              </Badge>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="h-7 text-xs border-zinc-800">
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && !alerts ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full bg-zinc-900/40" />)
          ) : (alerts ?? []).length === 0 ? (
            <p className="text-xs text-zinc-500 py-2">{t("admin.models.alertingNoData")}</p>
          ) : (
            (alerts ?? []).map((alert) => (
              <div
                key={alert.ruleId}
                className={`rounded-lg border p-3 space-y-1.5 ${
                  alert.triggered
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-zinc-800 bg-zinc-950/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-medium text-zinc-200">{alert.title}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        alert.triggered ? "border-amber-500/40 text-amber-300" : "border-zinc-700 text-zinc-500"
                      }`}
                    >
                      {alert.triggered ? t("admin.models.triggered") : t("admin.models.nominal")}
                    </Badge>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {t("admin.models.threshold")} {Math.round(alert.threshold * 1000) / 1000}
                      {alert.thresholdSource === "dynamic-baseline" ? " ⚡" : ""}
                    </span>
                  </div>
                </div>
                {alert.triggered && (
                  <p className="text-[11px] leading-relaxed text-amber-200/80">{alert.recommendation}</p>
                )}
              </div>
            ))
          )}
          <p className="text-[10px] text-zinc-600 pt-1">{t("admin.models.alertingHint")}</p>
        </CardContent>
      </Card>

      {/* Santé par fournisseur */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            {t("admin.models.providers")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !providers ? (
            [0, 1].map((i) => <Skeleton key={i} className="h-28 w-full bg-zinc-900/40" />)
          ) : (providers ?? []).length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-800 rounded-lg">
              {t("admin.models.noRuns")}
            </p>
          ) : (
            (providers ?? []).map((p) => (
              <div
                key={p.provider}
                className={`rounded-lg border p-4 space-y-3 ${
                  p.disabled ? "border-zinc-800 bg-zinc-950/20 opacity-75" : "border-zinc-800 bg-zinc-950/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-emerald-300 uppercase">{p.provider}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono ${
                        p.okRate >= 0.95
                          ? "border-emerald-500/40 text-emerald-300"
                          : p.okRate >= 0.8
                            ? "border-amber-500/40 text-amber-300"
                            : "border-rose-500/40 text-rose-300"
                      }`}
                    >
                      {Math.round(p.okRate * 1000) / 10}%
                    </Badge>
                    {p.disabled && (
                      <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-400">
                        {t("admin.models.disabledBadge")}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void toggle(p.provider, !p.disabled)}
                    disabled={toggling === p.provider}
                    className={`h-7 text-xs ${
                      p.disabled
                        ? "border-emerald-600/40 text-emerald-300 hover:bg-emerald-500/10"
                        : "border-rose-600/40 text-rose-300 hover:bg-rose-500/10"
                    }`}
                  >
                    {toggling === p.provider ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : p.disabled ? (
                      <Power className="h-3 w-3 mr-1" />
                    ) : (
                      <PowerOff className="h-3 w-3 mr-1" />
                    )}
                    {p.disabled ? t("admin.models.enable") : t("admin.models.disable")}
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
                  <div>
                    <div className="text-sm font-mono text-zinc-100">{p.runs}</div>
                    <div className="text-[10px] text-zinc-500">{t("admin.models.runs")}</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-zinc-100">{(p.avgLatencyMs / 1000).toFixed(1)}s</div>
                    <div className="text-[10px] text-zinc-500">{t("admin.models.avg")}</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-zinc-100">{(p.p95LatencyMs / 1000).toFixed(1)}s</div>
                    <div className="text-[10px] text-zinc-500">p95</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-zinc-100">{Math.round(p.tokensOut / 1000)}k</div>
                    <div className="text-[10px] text-zinc-500">tokens ↓</div>
                  </div>
                  <div>
                    <div className="text-sm font-mono text-amber-300">{formatCredits(p.credits)} cr</div>
                    <div className="text-[10px] text-zinc-500">{t("common.credits")}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-zinc-400 truncate" title={p.lastError ?? ""}>
                      {p.lastError ?? "—"}
                    </div>
                    <div className="text-[10px] text-zinc-500">{t("admin.models.lastError")}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Export OTLP */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-200 flex items-center gap-2">
            <Radio className={`h-4 w-4 ${otel?.enabled ? "text-emerald-400" : "text-zinc-600"}`} />
            {t("admin.models.otel")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {otel?.enabled ? (
            <div className="space-y-1.5 text-xs">
              <p className="text-zinc-400">
                {t("admin.models.otelEndpoint")} <span className="font-mono text-emerald-300">{otel.endpoint}</span>
              </p>
              <p className="text-zinc-500 font-mono">
                {t("admin.models.otelStats", { exported: otel.exported, queued: otel.queued, failures: otel.failures })}
                {otel.instrumentDb ? ` · ${t("admin.models.otelDb")}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">{t("admin.models.otelOff")}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
        <Activity className="h-3 w-3" />
        {t("admin.models.footer")}
      </div>
    </div>
  );
}
