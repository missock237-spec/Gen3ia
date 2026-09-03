"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Layers, PlayCircle, RefreshCw } from "lucide-react";

/**
 * Batch Tasks — exécution en série de multiples prompts (jusqu'à 50).
 * Page exposant le moteur batch (BatchTask/BatchItem).
 */

interface BatchView {
  id: string;
  name: string | null;
  status: string;
  total: number;
  completed: number;
  failed: number;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "border-zinc-700 text-zinc-400" },
  RUNNING: { label: "En cours", cls: "border-blue-700/50 text-blue-300" },
  COMPLETED: { label: "Terminé", cls: "border-emerald-700/50 text-emerald-300" },
  FAILED: { label: "Échec", cls: "border-red-800/60 text-red-300" },
};

export default function BatchPage() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<BatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [prompts, setPrompts] = useState("");
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ batch?: { items?: Array<{ id: string; prompt?: string; status: string; taskId?: string }> } } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/batch");
      const json = (await res.json()) as { ok: boolean; batches?: BatchView[] };
      if (json.ok && json.batches) setBatches(json.batches);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function launch() {
    const list = prompts
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (list.length === 0) {
      toast({ title: "Aucun prompt", description: "Saisissez un prompt par ligne.", variant: "destructive" })
      return
    }
    if (list.length > 50) {
      toast({ title: "Trop de prompts", description: "Maximum 50 prompts par lot.", variant: "destructive" })
      return
    }
    setRunning(true)
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: list, name: name || undefined, autoExecute: true }),
      })
      const json = (await res.json()) as { ok: boolean; batchId?: string; error?: string }
      if (json.ok) {
        toast({ title: "Lot lancé", description: `${list.length} tâches en exécution.` })
        setPrompts("")
        setName("")
        await refresh()
      } else {
        toast({ title: "Lancement refusé", description: json.error, variant: "destructive" })
      }
    } finally {
      setRunning(false)
    }
  }

  async function openBatch(id: string) {
    setActiveId(id)
    setDetail(null)
    const res = await fetch(`/api/batch/${id}`)
    const json = (await res.json()) as { ok: boolean } & { batch?: { items?: Array<{ id: string; prompt?: string; status: string; taskId?: string }> } }
    if (json.ok) setDetail(json)
  }

  async function rerun(id: string) {
    setRunning(true)
    try {
      const res = await fetch(`/api/batch/${id}`, { method: "POST" })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        toast({ title: "Ré-exécution lancée", description: "Le lot redémarre." })
        await refresh()
      } else {
        toast({ title: "Refusé", description: json.error, variant: "destructive" })
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Batch Tasks</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Exécutez un lot de prompts (jusqu&apos;à 50) en une opération : chaque ligne devient une
          tâche suivie individuellement, avec suivi de progression et relance possible.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du lot (optionnel)"
          className="bg-zinc-950 border-zinc-800"
        />
        <Textarea
          value={prompts}
          onChange={(e) => setPrompts(e.target.value)}
          rows={6}
          placeholder={"Un prompt par ligne :\nAnalyse le marché des énergies renouvelables au Cameroun\nCompare les 3 meilleures solutions CRM pour PME\nRédige un plan de lancement produit…"}
          className="bg-zinc-950 border-zinc-880 font-mono text-xs"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {prompts.split("\n").filter((l) => l.trim()).length} / 50 prompts
          </span>
          <Button onClick={() => void launch()} disabled={running} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Lancer le lot
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          Aucun lot. Créez votre premier batch ci-dessus.
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const meta = STATUS_META[b.status] ?? { label: b.status, cls: "border-zinc-700 text-zinc-400" }
            const pct = b.total > 0 ? Math.round((b.completed / b.total) * 100) : 0
            return (
              <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold text-zinc-100">{b.name ?? `Lot ${b.id.slice(0, 8)}`}</span>
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void openBatch(b.id)}>
                      Détails
                    </Button>
                    <Button size="sm" variant="outline" disabled={running} onClick={() => void rerun(b.id)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{b.completed}/{b.total} terminées{b.failed > 0 && ` · ${b.failed} échecs`}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="mt-2 block text-[11px] text-zinc-600">
                  {new Date(b.createdAt).toLocaleString("fr-FR")}
                </span>

                {activeId === b.id && (
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    {detail?.batch?.items ? (
                      <div className="max-h-60 space-y-1.5 overflow-y-auto">
                        {detail.batch.items.map((it) => (
                          <div key={it.id} className="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${it.status === "COMPLETED" ? "bg-emerald-500" : it.status === "RUNNING" ? "bg-blue-500" : it.status === "FAILED" ? "bg-red-500" : "bg-zinc-600"}`} />
                            <span className="truncate text-zinc-300">{it.prompt ?? it.taskId}</span>
                            <span className="ml-auto shrink-0 text-zinc-600">{it.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
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
  )
}
