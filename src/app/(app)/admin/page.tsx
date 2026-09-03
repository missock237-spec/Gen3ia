"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPatch, formatCredits, useUser } from "@/lib/client/hooks";
import { EnginesPanel } from "@/components/admin/engines-panel";
import { ShieldCheck, Users, Activity, Coins, Loader2, ScrollText, Gauge } from "lucide-react";

interface AdminData {
  ok: boolean
  stats: {
    users: number
    agents: number
    tasks: Record<string, number>
    documents: number
    memories: number
    apiKeys: number
    totalCredits: number
    transactions: { count: number; volume: number }
    payments: { count: number; volume: number }
  }
  users: {
    id: string
    email: string
    name: string | null
    role: string
    plan: string
    credits: number
    createdAt: string
  }[]
  auditLogs: {
    id: string
    userId: string | null
    action: string
    entityType: string | null
    entityId: string | null
    ip: string | null
    createdAt: string
  }[]
}

export default function AdminPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const { user: me } = useUser();
  const { data, loading, reload } = usePolling<AdminData>("/api/admin", 15000);
  const [grantAmount, setGrantAmount] = useState<Record<string, string>>({});
  const [granting, setGranting] = useState<string | null>(null);
  // v3.1 — onglets : vue générale / moteurs & observabilité.
  const [tab, setTab] = useState<"general" | "engines">("general");

  async function grantCredits(userId: string) {
    const amount = Number(grantAmount[userId] ?? 0)
    if (amount <= 0) return
    setGranting(userId)
    const res = await apiPatch(`/api/admin/users/${userId}`, { credits: amount, reason: "Ajustement manuel administrateur" })
    setGranting(null)
    if (!res.ok) {
      toast({ title: t("admin.grant.failed"), description: res.error, variant: "destructive" })
      return
    }
    toast({ title: t("admin.grant.done"), description: t("admin.grant.doneDesc", { count: amount }) })
    setGrantAmount({ ...grantAmount, [userId]: "" })
    await reload()
  }

  if (loading && !data) {
    return <Skeleton className="h-96 w-full bg-zinc-800/60" />
  }

  if (data && !data.ok) {
    return (
      <Card className="border-red-500/30 bg-red-500/5">
        <CardContent className="py-12 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-red-400" />
          <p className="text-sm text-red-300">{t("admin.forbidden")}</p>
        </CardContent>
      </Card>
    )
  }

  const stats = data?.stats
  const totalTasks = stats ? Object.values(stats.tasks).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-emerald-400" /> {t("admin.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{t("admin.subtitle")}</p>
      </div>

      {/* v3.1 — Onglets */}
      <div className="flex gap-2 border-b border-zinc-800 pb-px">
        <button
          type="button"
          onClick={() => setTab("general")}
          className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition-colors ${
            tab === "general"
              ? "border-emerald-500 text-emerald-300"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {t("admin.tab.general")}
        </button>
        <button
          type="button"
          onClick={() => setTab("engines")}
          className={`px-4 py-2 text-sm rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === "engines"
              ? "border-emerald-500 text-emerald-300"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Gauge className="h-3.5 w-3.5" />
          {t("admin.tab.engines")}
        </button>
      </div>

      {tab === "engines" ? (
        <EnginesPanel />
      ) : (
      <>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">{t("admin.stats.users")}</CardTitle>
            <Users className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.users ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">{t("admin.stats.agents")}</CardTitle>
            <Activity className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.agents ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">{t("admin.stats.tasks")}</CardTitle>
            <Activity className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalTasks}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {t("admin.stats.tasksDetail", { completed: stats?.tasks?.COMPLETED ?? 0, failed: stats?.tasks?.FAILED ?? 0, waiting: stats?.tasks?.WAITING_FOR_HUMAN ?? 0 })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">{t("admin.stats.credits")}</CardTitle>
            <Coins className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{formatCredits(stats?.totalCredits ?? 0)}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {t("admin.stats.paymentsDetail", { count: stats?.payments?.count ?? 0, volume: formatCredits(stats?.payments?.volume ?? 0) })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Utilisateurs */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.users.title", { count: data?.users.length ?? 0 })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {(data?.users ?? []).map((u) => (
              <div key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-zinc-200 truncate">{u.name ?? u.email}</span>
                    {u.role === "ADMIN" && <Badge variant="outline" className="border-emerald-600/40 text-emerald-300 text-[10px]">ADMIN</Badge>}
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{u.plan}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">{u.email} · {formatCredits(u.credits)} {t("admin.creditsUnit")} · {new Date(u.createdAt).toLocaleString(locale)}</p>
                </div>
                {me?.role === "ADMIN" && u.id !== me.id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      value={grantAmount[u.id] ?? ""}
                      onChange={(e) => setGrantAmount({ ...grantAmount, [u.id]: e.target.value })}
                      placeholder={t("common.credits")}
                      type="number"
                      min={1}
                      className="h-8 w-24 bg-zinc-950 border-zinc-800 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={() => grantCredits(u.id)}
                      disabled={granting === u.id || !(Number(grantAmount[u.id]) > 0)}
                      className="h-8 bg-emerald-500 text-zinc-950 hover:bg-emerald-400 text-xs"
                    >
                      {granting === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("admin.grant")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Audit */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-emerald-400" /> {t("admin.audit.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 font-mono text-xs">
            {(data?.auditLogs ?? []).map((log) => (
              <div key={log.id} className="flex items-center gap-3 rounded border border-zinc-800/60 bg-zinc-950 px-3 py-2">
                <span className="text-emerald-400/80 shrink-0">{log.action}</span>
                <span className="text-zinc-600 truncate">{log.entityType ?? ""} {log.entityId?.slice(0, 10) ?? ""}</span>
                <span className="ml-auto text-zinc-600 shrink-0">{new Date(log.createdAt).toLocaleString(locale)}</span>
              </div>
            ))}
            {(data?.auditLogs ?? []).length === 0 && (
              <p className="text-center text-zinc-600 py-6">{t("admin.audit.empty")}</p>
            )}
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}
