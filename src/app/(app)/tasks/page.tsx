"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { useToast } from "@/hooks/use-toast";
import { usePolling, apiPost, formatCredits, formatDate } from "@/lib/client/hooks";
import { Loader2, Plus, Zap, ChevronRight, Bot } from "lucide-react";

interface TaskRow {
  id: string
  prompt: string
  status: string
  costCredits: number
  attempts: number
  selectedPlanId: string | null
  agentId: string | null
  createdAt: string
}

export default function TasksPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("")
  const [creating, setCreating] = useState(false)
  const { data, loading, reload } = usePolling<{ ok: boolean; tasks: TaskRow[] }>("/api/tasks", 5000)
  const { data: agentsData } = usePolling<{ ok: boolean; agents: { id: string; name: string; status: string }[] }>("/api/agents")

  const tasks = data?.tasks ?? []
  const agents = (agentsData?.agents ?? []).filter((a) => a.status !== "ARCHIVED")

  async function createTask() {
    if (prompt.trim().length < 10) {
      toast({ title: "Demande trop courte", description: "Décrivez votre tâche en au moins 10 caractères.", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await apiPost<{ task: { id: string } }>("/api/tasks", {
        prompt: prompt.trim(),
        agentId: agentId || null,
      })
      if (!res.ok) throw new Error(res.error)
      toast({ title: "Tâche lancée", description: "Le pipeline démarre : analyse → plans → exécution → vérification." })
      setPrompt("")
      await reload()
      router.push(`/tasks/${res.task.id}`)
    } catch (err) {
      toast({ title: "Lancement impossible", description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Task Center</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Lancez une tâche : GEN3IA l'analyse, génère 5 plans, exécute le meilleur, vérifie et livre.
        </p>
      </div>

      {/* Création */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-emerald-400" /> Nouvelle tâche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex. : Analyse les 3 dernières actualités sur l'énergie solaire en Afrique de l'Ouest et rédige une synthèse structurée avec sources."
            className="min-h-[100px] bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-zinc-500">Agent (optionnel)</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              >
                <option value="">Aucun — moteur GEN3IA générique</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={createTask}
                disabled={creating || prompt.trim().length < 10}
                className="w-full sm:w-auto bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-9"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="ml-2">Lancer la tâche</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Tâches ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-zinc-800/60" />)}</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Zap className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">Aucune tâche. Lancez votre première tâche ci-dessus.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-3.5 hover:border-emerald-500/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate group-hover:text-white">{t.prompt}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      <span>{formatDate(t.createdAt)}</span>
                      {t.selectedPlanId && <span className="font-mono">Plan {t.selectedPlanId}</span>}
                      {t.costCredits > 0 && <span className="text-emerald-400/80">{formatCredits(t.costCredits)} crédits</span>}
                      {t.agentId && <span className="flex items-center gap-1"><Bot className="h-3 w-3" />agent</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={t.status} />
                    <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-emerald-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
