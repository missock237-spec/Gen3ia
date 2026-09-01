"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePolling, apiPost, apiDelete, formatDate } from "@/lib/client/hooks";
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
      name: name.trim() || "Ma clé",
      agentId: agentId || null,
    })
    setCreating(false)
    if (!res.ok) {
      toast({ title: "Création impossible", description: res.error, variant: "destructive" })
      return
    }
    setNewSecret(res.secret)
    setName("")
    await reload()
  }

  async function revoke(id: string) {
    const res = await apiDelete(`/api/apikeys/${id}`)
    if (!res.ok) {
      toast({ title: "Révocation impossible", description: res.error, variant: "destructive" })
      return
    }
    toast({ title: "Clé révoquée", description: "Elle n'est plus acceptée par l'API." })
    await reload()
  }

  const keys = data?.keys ?? []
  const agents = agentsData?.agents ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Clés API</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Authentifiez vos appels à l'API v1. Seule l'empreinte SHA-256 est stockée — le secret n'est visible qu'à la création.
        </p>
      </div>

      {newSecret && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-amber-300 font-semibold flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Nouvelle clé — copiez-la maintenant
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
                <span className="ml-1.5 text-xs">{copied ? "Copiée" : "Copier"}</span>
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
          <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-400" />Créer une clé</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_240px_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Nom</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Production — app mobile" className="bg-zinc-950 border-zinc-800" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-500">Lier à un agent (optionnel)</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              >
                <option value="">Aucun agent spécifique</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <Button onClick={createKey} disabled={creating} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-9">
              {creating ? "…" : "Générer"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Mes clés ({keys.filter((k) => !k.revoked).length} actives)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-16 bg-zinc-800/60" />)}</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <KeyRound className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">Aucune clé. Générez-en une pour appeler l'API.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${k.revoked ? "border-zinc-800/40 bg-zinc-900/20 opacity-50" : "border-zinc-800/60 bg-zinc-950"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200">{k.name}</span>
                      {k.revoked && <span className="text-[10px] text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 font-mono">révoquée</span>}
                    </div>
                    <p className="text-xs font-mono text-zinc-500 mt-1">
                      {k.prefix}… · {k.requests} requête(s) · {formatDate(k.createdAt)}
                      {k.lastUsedAt && ` · dernière utilisation ${formatDate(k.lastUsedAt)}`}
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
          <CardTitle className="text-base flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400" />Utilisation</CardTitle>
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
            Limite : 60 requêtes/minute par clé. Endpoints : POST /api/v1/chat, POST /api/v1/task, GET /api/v1/task/{"{id}"}.
          </div>
          <Link href="/sdk" className="text-sm text-emerald-400 hover:text-emerald-300 inline-block">
            → Voir les SDK JavaScript et Python complets
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
