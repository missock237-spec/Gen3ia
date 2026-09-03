"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPost } from "@/lib/client/hooks";
import { Boxes, Server, HardDrive, TrendingUp, Coins, Sparkles, RefreshCw, Power, PowerOff, FlaskConical } from "lucide-react";

/**
 * Panneau « Model Registry & Compute » (v4.0 — Phase 26) :
 *  - MODEL REGISTRY : modèles, providers, disponibilité, score, success rate ;
 *  - COMPUTE : endpoints dédiés, jobs, état, consommation ;
 *  - STORAGE : buckets HF, objets, volume ;
 *  - PERFORMANCE : modèles les plus efficaces, sélections récentes ;
 *  - COST : coût par modèle.
 * Actions : seed registre, sync HF Hub, activer/désactiver/promouvoir modèles.
 */

interface RegistryModel {
  provider: string
  modelId: string
  name: string
  modality: string
  supportedTasks: string[]
  contextLength: number
  endpointType: string
  availability: string
  status: string
  priority: number
  cost: { creditsPerKIn: number; creditsPerKOut: number }
  learned: { qualityScore: number; successRate: number; avgLatencyMs: number; sampleCount: number; lastEvaluated: string | null }
}

interface RegistryData {
  ok: boolean
  hfConfigured: boolean
  registry: {
    stats: { total: number; byProvider: Record<string, number>; byStatus: Record<string, number>; learned: number }
    models: RegistryModel[]
  }
  performance: {
    ranking: Array<{ provider: string; modelId: string; name: string; samples: number; successRate: number; avgQuality: number; avgLatencyMs: number; totalCost: number }>
    recentSelections: Array<{ id: string; provider: string; taskType: string; score: number; confidence: number; reason: string; createdAt: string; model: { modelId: string; name: string } | null }>
  }
  compute: {
    hfRouter: { available: boolean }
    endpoints: { running: number; scaledToZero: number; total: number }
    jobs: { pending: number; running: number; completed: number; failed: number }
    models: { active: number; experimental: number }
  }
  storage: { totalObjects: number; totalBytes: number; byBucket: Array<{ bucket: string; objects: number; bytes: number }> }
  endpoints: Array<{ id: string; name: string; modelId: string; status: string; hardware: string; currentReplicas: number; url: string | null }>
  cost: { byModel: Array<{ provider: string; modelId: string; executions: number; costCredits: number }> }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function RegistryPanel() {
  const { t } = useI18n()
  const { toast } = useToast()
  const { data, loading, reload } = usePolling<RegistryData>("/api/admin/models-registry", 20000)
  const [busy, setBusy] = useState<string | null>(null)
  const [view, setView] = useState<"registry" | "compute" | "performance" | "cost">("registry")

  const runAction = useCallback(
    async (label: string, body: Record<string, unknown>) => {
      setBusy(label)
      try {
        const res = await apiPost<Record<string, unknown>>("/api/admin/models-registry", body)
        toast({ title: label, description: JSON.stringify(res).slice(0, 200) })
        await reload()
      } catch (err) {
        toast({ title: "Erreur", description: err instanceof Error ? err.message : String(err), variant: "destructive" })
      } finally {
        setBusy(null)
      }
    },
    [reload, toast]
  )

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!data?.ok) return <p className="text-sm text-zinc-400">Registry indisponible.</p>

  const { registry, compute, storage, performance, cost, endpoints, hfConfigured } = data

  return (
    <div className="space-y-4">
      {/* État HF + actions */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-amber-400" /> {t("admin.registry.title")}
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => runAction("Seed registre", { action: "seed" })}>
              <Sparkles className="mr-1 h-3 w-3" /> Seed
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null || !hfConfigured} onClick={() => runAction("Sync HF Hub", { action: "sync-hf", limit: 30 })}>
              <RefreshCw className="mr-1 h-3 w-3" /> Sync HF
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null || !hfConfigured} onClick={() => runAction("Sync endpoints", { action: "sync-endpoints" })}>
              <Server className="mr-1 h-3 w-3" /> Endpoints
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="flex items-center gap-2">
            <Badge variant={hfConfigured ? "default" : "secondary"}>{hfConfigured ? "HF ON" : "HF OFF"}</Badge>
            <span className="text-zinc-400">{t("admin.registry.hfToken")}</span>
          </div>
          <div>
            <span className="text-zinc-400">{t("admin.registry.models")} : </span>
            <span className="font-mono">{registry.stats.total}</span>
            <span className="ml-1 text-zinc-500">({registry.stats.learned} appris)</span>
          </div>
          <div>
            <span className="text-zinc-400">{t("admin.registry.providers")} : </span>
            <span className="font-mono">{Object.keys(registry.stats.byProvider).length}</span>
          </div>
          <div>
            <span className="text-zinc-400">{t("admin.registry.jobs")} : </span>
            <span className="font-mono">{compute.jobs.running}/{compute.jobs.pending}</span>
            <span className="ml-1 text-zinc-500">run/pending</span>
          </div>
        </CardContent>
      </Card>

      {/* Onglets de vue */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["registry", <Boxes key="i" className="h-3 w-3" />, t("admin.registry.tabRegistry")],
            ["compute", <Server key="i" className="h-3 w-3" />, t("admin.registry.tabCompute")],
            ["performance", <TrendingUp key="i" className="h-3 w-3" />, t("admin.registry.tabPerf")],
            ["cost", <Coins key="i" className="h-3 w-3" />, t("admin.registry.tabCost")],
          ] as const
        ).map(([key, icon, label]) => (
          <Button key={key} size="sm" variant={view === key ? "default" : "outline"} onClick={() => setView(key)}>
            {icon} {label}
          </Button>
        ))}
      </div>

      {view === "registry" && (
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("admin.registry.modelsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="p-2">{t("admin.registry.provider")}</th>
                  <th className="p-2">{t("admin.registry.model")}</th>
                  <th className="p-2">{t("admin.registry.tasks")}</th>
                  <th className="p-2">{t("admin.registry.ctx")}</th>
                  <th className="p-2">Cr/1k in→out</th>
                  <th className="p-2">Success</th>
                  <th className="p-2">Quality</th>
                  <th className="p-2">Latence</th>
                  <th className="p-2">n</th>
                  <th className="p-2">{t("admin.registry.status")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {registry.models.slice(0, 60).map((m) => (
                  <tr key={`${m.provider}/${m.modelId}`} className="border-t border-zinc-800/60">
                    <td className="p-2 font-mono text-amber-300">{m.provider}</td>
                    <td className="p-2 max-w-[260px] truncate" title={m.modelId}>{m.name}</td>
                    <td className="p-2 text-zinc-400">{m.supportedTasks.slice(0, 3).join(", ")}{m.supportedTasks.length > 3 ? "…" : ""}</td>
                    <td className="p-2 font-mono">{(m.contextLength / 1000).toFixed(0)}k</td>
                    <td className="p-2 font-mono">{m.cost.creditsPerKIn}→{m.cost.creditsPerKOut}</td>
                    <td className="p-2 font-mono text-emerald-400">{(m.learned.successRate * 100).toFixed(0)}%</td>
                    <td className="p-2 font-mono">{m.learned.qualityScore.toFixed(2)}</td>
                    <td className="p-2 font-mono text-zinc-400">{(m.learned.avgLatencyMs / 1000).toFixed(1)}s</td>
                    <td className="p-2 font-mono text-zinc-400">{m.learned.sampleCount}</td>
                    <td className="p-2">
                      <Badge variant={m.status === "ACTIVE" ? "default" : m.status === "EXPERIMENTAL" ? "secondary" : "outline"}>{m.status}</Badge>
                    </td>
                    <td className="p-2">
                      {m.status !== "DISABLED" ? (
                        <Button size="sm" variant="ghost" title="Désactiver" onClick={() => runAction(`Désactive ${m.modelId}`, { action: "set-status", provider: m.provider, modelId: m.modelId, status: "DISABLED" })}>
                          <PowerOff className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" title="Activer" onClick={() => runAction(`Active ${m.modelId}`, { action: "set-status", provider: m.provider, modelId: m.modelId, status: "ACTIVE" })}>
                          <Power className="h-3 w-3" />
                        </Button>
                      )}
                      {m.status === "EXPERIMENTAL" && (
                        <Button size="sm" variant="ghost" title="Promouvoir ACTIF" onClick={() => runAction(`Promeut ${m.modelId}`, { action: "set-status", provider: m.provider, modelId: m.modelId, status: "ACTIVE" })}>
                          <FlaskConical className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {view === "compute" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4 text-amber-400" /> {t("admin.registry.computeTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">HF Inference Providers (routeur)</span><Badge variant={compute.hfRouter.available ? "default" : "secondary"}>{compute.hfRouter.available ? "ON" : "OFF"}</Badge></div>
              <div className="flex justify-between"><span className="text-zinc-400">Endpoints dédiés</span><span className="font-mono">{compute.endpoints.running} running / {compute.endpoints.scaledToZero} veille / {compute.endpoints.total} total</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Jobs</span><span className="font-mono">{compute.jobs.running} running · {compute.jobs.pending} pending · {compute.jobs.completed} ok · {compute.jobs.failed} ko</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Modèles actifs / expérimentaux</span><span className="font-mono">{compute.models.active} / {compute.models.experimental}</span></div>
              {endpoints.length > 0 && (
                <div className="pt-2">
                  <p className="mb-1 text-xs text-zinc-500">Endpoints HF</p>
                  {endpoints.slice(0, 8).map((e) => (
                    <div key={e.id} className="flex justify-between border-t border-zinc-800/60 py-1 text-xs">
                      <span className="truncate font-mono" title={e.modelId}>{e.name} · {e.hardware}</span>
                      <Badge variant={e.status === "RUNNING" ? "default" : "secondary"}>{e.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4 text-amber-400" /> {t("admin.registry.storageTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-400">Objets</span><span className="font-mono">{storage.totalObjects}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Volume</span><span className="font-mono">{formatBytes(storage.totalBytes)}</span></div>
              {storage.byBucket.length > 0 && (
                <div className="pt-2">
                  <p className="mb-1 text-xs text-zinc-500">Par bucket</p>
                  {storage.byBucket.map((b) => (
                    <div key={b.bucket} className="flex justify-between border-t border-zinc-800/60 py-1 text-xs">
                      <span className="font-mono text-amber-300">{b.bucket}</span>
                      <span className="text-zinc-400">{b.objects} obj · {formatBytes(b.bytes)}</span>
                    </div>
                  ))}
                </div>
              )}
              {storage.totalObjects === 0 && <p className="text-xs text-zinc-500">{t("admin.registry.storageEmpty")}</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "performance" && (
        <div className="space-y-4">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-amber-400" /> {t("admin.registry.rankingTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {performance.ranking.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("admin.registry.noData")}</p>
              ) : (
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="p-2">Modèle</th>
                      <th className="p-2">Provider</th>
                      <th className="p-2">n</th>
                      <th className="p-2">Success</th>
                      <th className="p-2">Quality</th>
                      <th className="p-2">Latence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.ranking.map((r) => (
                      <tr key={`${r.provider}/${r.modelId}`} className="border-t border-zinc-800/60">
                        <td className="p-2 max-w-[280px] truncate" title={r.modelId}>{r.name}</td>
                        <td className="p-2 font-mono text-amber-300">{r.provider}</td>
                        <td className="p-2 font-mono">{r.samples}</td>
                        <td className="p-2 font-mono text-emerald-400">{(r.successRate * 100).toFixed(0)}%</td>
                        <td className="p-2 font-mono">{r.avgQuality.toFixed(2)}</td>
                        <td className="p-2 font-mono text-zinc-400">{(r.avgLatencyMs / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("admin.registry.selectionsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {performance.recentSelections.length === 0 ? (
                <p className="text-zinc-500">{t("admin.registry.noSelections")}</p>
              ) : (
                performance.recentSelections.map((s) => (
                  <div key={s.id} className="border-t border-zinc-800/60 py-1.5">
                    <span className="font-mono text-amber-300">{s.provider}</span>
                    <span className="mx-1 text-zinc-500">·</span>
                    <span className="font-mono">{s.model?.name ?? "?"}</span>
                    <span className="mx-1 text-zinc-500">·</span>
                    <span className="text-zinc-400">{s.taskType}</span>
                    <span className="mx-1 text-zinc-500">·</span>
                    <span className="font-mono">score {s.score.toFixed(2)} · conf {s.confidence.toFixed(2)}</span>
                    <p className="text-zinc-500">{s.reason}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "cost" && (
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-amber-400" /> {t("admin.registry.costTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {cost.byModel.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("admin.registry.noCost")}</p>
            ) : (
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="p-2">Modèle</th>
                    <th className="p-2">Provider</th>
                    <th className="p-2">Exécutions</th>
                    <th className="p-2">Crédits</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.byModel.map((c) => (
                    <tr key={`${c.provider}/${c.modelId}`} className="border-t border-zinc-800/60">
                      <td className="p-2 max-w-[280px] truncate" title={c.modelId}>{c.modelId}</td>
                      <td className="p-2 font-mono text-amber-300">{c.provider}</td>
                      <td className="p-2 font-mono">{c.executions}</td>
                      <td className="p-2 font-mono text-amber-400">{c.costCredits.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
