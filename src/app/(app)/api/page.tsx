"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPost, apiDelete } from "@/lib/client/hooks";
import { KeyRound, Plus, Trash2, Copy, Check, Terminal, ShieldCheck } from "lucide-react";

interface KeyRow {
  id: string
  name: string
  prefix: string
  scopes: string
  requests: number
  revoked: boolean
  lastUsedAt: string | null
  createdAt: string
}

export default function ApiKeysPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const { data, loading, reload } = usePolling<{ ok: boolean; keys: KeyRow[] }>("/api/apikeys");
  const { data: agentsData } = usePolling<{ ok: boolean; agents: { id: string; name: string }[] }>("/api/agents");
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setCreating(true)
    const res = await apiPost<{ secret: string }>("/api/apikeys", {
      name: name.trim() || t("apikeys.defaultName"),
      agentId: agentId || null,
    })
    setCreating(false)
    if (!res.ok) {
      toast({ title: t("apikeys.errors.create"), description: res.error, variant: "destructive" })
      return
    }
    setNewSecret(res.secret)
    setName("")
    await reload()
  }

  async function revoke(id: string) {
    const res = await apiDelete(`/api/apikeys/${id}`)
    if (!res.ok) {
      toast({ title: t("apikeys.errors.revoke"), description: res.error, variant: "destructive" })
      return
    }
    toast({ title: t("apikeys.revoked.title"), description: t("apikeys.revoked.desc") })
    await reload()
  }

  const keys = data?.keys ?? []
  const agents = agentsData?.agents ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("apikeys.title")}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("apikeys.subtitle")}
        </p>
      </div>

      {newSecret && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-amber-300 font-semibold flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> {t("apikeys.newKeyTitle")}
              </div>
              <Button
                size="sm" variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                onClick={() => {
                  void navigator.clipboard.writeText(newSecret)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="ml-1.5 text-xs">{copied ? t("apikeys.copied") : t("apikeys.copy")}</span>
              </Button>
            </div>
            <code className="block font-mono text-sm text-amber-200 break-all bg-zinc-950 rounded-lg p-3 border border-amber-500/20">
              {newSecret}
            </code>
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-400" />{t("apikeys.create")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_240px_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">{t("common.name")}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("apikeys.namePlaceholder")} className="bg-zinc-950 border-zinc-800" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">{t("apikeys.linkAgent")}</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              >
                <option value="">{t("apikeys.noAgent")}</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <Button onClick={createKey} disabled={creating} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-9">
              {creating ? "…" : t("apikeys.generate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">{t("apikeys.myKeys", { count: keys.filter((k) => !k.revoked).length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-16 bg-zinc-800/60" />)}</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <KeyRound className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">{t("apikeys.empty")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${k.revoked ? "border-zinc-800/40 bg-zinc-900/20 opacity-50" : "border-zinc-800/60 bg-zinc-950"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200">{k.name}</span>
                      {k.revoked && <span className="text-[10px] text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 font-mono">{t("apikeys.revoked")}</span>}
                    </div>
                    <p className="text-xs font-mono text-zinc-500 mt-1">
                      {k.prefix}… · {t("apikeys.requestsCount", { count: k.requests })} · {new Date(k.createdAt).toLocaleString(locale)}
                      {k.lastUsedAt && ` · ${t("apikeys.lastUsed", { date: new Date(k.lastUsedAt).toLocaleString(locale) })}`}
                    </p>
                  </div>
                  {!k.revoked && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(k.id)} className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-8">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400" />{t("apikeys.usage")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 overflow-x-auto">
            <code className="text-xs text-zinc-300 whitespace-pre">curl -X POST {typeof window !== "undefined" ? window.location.origin : ""}/api/v1/chat \
  -H "Authorization: Bearer g3ia_live_..." \
  -H "Content-Type: application/json" \
  -d '{"{"}"message": "Bonjour", "agent_slug": "mon-agent"{"}"}'</code>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            {t("apikeys.limit")}
          </div>
          <Link href="/sdk" className="text-sm text-emerald-400 hover:text-emerald-300 inline-block">
            {t("apikeys.sdkLink")}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
