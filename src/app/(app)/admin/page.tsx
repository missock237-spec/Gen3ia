"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePolling, apiPatch, formatCredits, formatDate, useUser } from "@/lib/client/hooks";
import { ShieldCheck, Users, Activity, Coins, Loader2, ScrollText } from "lucide-react";

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
  const { user: me } = useUser();
  const { data, loading, reload } = usePolling<AdminData>("/api/admin", 15000);
  const [grantAmount, setGrantAmount] = useState<Record<string, string>>({});
  const [granting, setGranting] = useState<string | null>(null);

  async function grantCredits(userId: string) {
    const amount = Number(grantAmount[userId] ?? 0)
    if (amount <= 0) return
    setGranting(userId)
    const res = await apiPatch(`/api/admin/users/${userId}`, { credits: amount, reason: "Ajustement manuel administrateur" })
    setGranting(null)
    if (!res.ok) {
      toast({ title: "Attribution impossible", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Crédits attribués", description: `${amount} crédits ajoutés (via le ledger).` })
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
          <p className="text-sm text-red-300">Accès réservé aux administrateurs.</p>
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
          <ShieldCheck className="h-6 w-6 text-emerald-400" /> Administration
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Vue globale de la plateforme — statistiques, utilisateurs, audit.</p>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Utilisateurs</CardTitle>
            <Users className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.users ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Agents</CardTitle>
            <Activity className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.agents ?? "—"}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Tâches</CardTitle>
            <Activity className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalTasks}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {stats?.tasks?.COMPLETED ?? 0} réussies · {stats?.tasks?.FAILED ?? 0} échecs · {stats?.tasks?.WAITING_FOR_HUMAN ?? 0} en attente
            </p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Crédits en circulation</CardTitle>
            <Coins className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{formatCredits(stats?.totalCredits ?? 0)}</div>
            <p className="text-xs text-zinc-500 mt-1">
              {stats?.payments?.count ?? 0} paiements · {formatCredits(stats?.payments?.volume ?? 0)} FCFA
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Utilisateurs */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Utilisateurs ({data?.users.length ?? 0})</CardTitle>
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
                  <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">{u.email} · {formatCredits(u.credits)} crédits · {formatDate(u.createdAt)}</p>
                </div>
                {me?.role === "ADMIN" && u.id !== me.id && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      value={grantAmount[u.id] ?? ""}
                      onChange={(e) => setGrantAmount({ ...grantAmount, [u.id]: e.target.value })}
                      placeholder="Crédits"
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
                      {granting === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Attribuer"}
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
            <ScrollText className="h-4 w-4 text-emerald-400" /> Journal d'audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 font-mono text-xs">
            {(data?.auditLogs ?? []).map((log) => (
              <div key={log.id} className="flex items-center gap-3 rounded border border-zinc-800/60 bg-zinc-950 px-3 py-2">
                <span className="text-emerald-400/80 shrink-0">{log.action}</span>
                <span className="text-zinc-600 truncate">{log.entityType ?? ""} {log.entityId?.slice(0, 10) ?? ""}</span>
                <span className="ml-auto text-zinc-600 shrink-0">{formatDate(log.createdAt)}</span>
              </div>
            ))}
            {(data?.auditLogs ?? []).length === 0 && (
              <p className="text-center text-zinc-600 py-6">Aucune entrée d'audit.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
