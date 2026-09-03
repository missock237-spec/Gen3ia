"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Brain, Trash2, PlusCircle, RefreshCw } from "lucide-react";

/**
 * Fine-tuning — jobs d'affinage des modèles sur les données d'apprentissage
 * GEN3IA (moteurs unsloth/axolotl), avec métriques et suivi d'exécution.
 */

interface JobView {
  id: string;
  name: string;
  status: string;
  engine: string;
  baseModel: string | null;
  datasetSize: number;
  metrics: Record<string, number> | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: "En file", cls: "border-zinc-700 text-zinc-400" },
  RUNNING: { label: "En cours", cls: "border-blue-700/50 text-blue-300" },
  COMPLETED: { label: "Terminé", cls: "border-emerald-700/50 text-emerald-300" },
  FAILED: { label: "Échec", cls: "border-red-800/60 text-red-300" },
  CANCELLED: { label: "Annulé", cls: "border-zinc-700 text-zinc-500" },
};

export default function FinetunePage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<"unsloth" | "axolotl">("unsloth");
  const [baseModel, setBaseModel] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/finetune");
      const json = (await res.json()) as { ok: boolean; jobs?: JobView[] };
      if (json.ok && json.jobs) setJobs(json.jobs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (!name) {
      toast({ title: "Nom requis", description: "Donnez un nom au job d'affinage.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/finetune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, engine, baseModel: baseModel || undefined }),
      });
      const json = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (json.ok) {
        toast({ title: "Job créé", description: "L'affinage démarre — le dataset est construit depuis vos apprentissages." });
        setShowForm(false);
        setName("");
        setBaseModel("");
        await refresh();
      } else {
        toast({ title: "Création refusée", description: json.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/finetune/${id}`, { method: "DELETE" });
      toast({ title: "Job annulé" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fine-tuning</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Affinez vos modèles sur les apprentissages accumulés (skill-creator, profils, mémoire) —
            jobs asynchrones avec métriques de convergence et suivi détaillé.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowForm((s) => !s)} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            <PlusCircle className="h-4 w-4" /> {showForm ? "Fermer" : "Nouveau job"}
          </Button>
        </div>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="name">Nom du job</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent-support-v2" className="bg-zinc-950 border-zinc-800" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engine">Moteur</Label>
              <select
                id="engine"
                value={engine}
                onChange={(e) => setEngine(e.target.value as "unsloth" | "axolotl")}
                className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
              >
                <option value="unsloth">Unsloth</option>
                <option value="axolotl">Axolotl</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseModel">Modèle de base (optionnel)</Label>
              <Input id="baseModel" value={baseModel} onChange={(e) => setBaseModel(e.target.value)} placeholder="auto" className="bg-zinc-950 border-zinc-800" />
            </div>
          </div>
          <Button onClick={() => void create()} disabled={busy} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lancer l'affinage"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          Aucun job d&apos;affinage. Créez-en un pour spécialiser vos modèles sur vos données.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const meta = STATUS_META[job.status] ?? { label: job.status, cls: "border-zinc-700 text-zinc-400" };
            return (
              <div key={job.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold text-zinc-100">{job.name}</span>
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">{job.engine}</Badge>
                  </div>
                  {(job.status === "QUEUED" || job.status === "RUNNING") && (
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => void cancel(job.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Annuler
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
                  <span>Dataset : <span className="text-zinc-400">{job.datasetSize} échantillons</span></span>
                  {job.baseModel && <span>Base : <span className="text-zinc-400">{job.baseModel}</span></span>}
                  {job.startedAt && (
                    <span>Démarré : <span className="text-zinc-400">{new Date(job.startedAt).toLocaleString("fr-FR")}</span></span>
                  )}
                  {job.finishedAt && (
                    <span>Terminé : <span className="text-zinc-400">{new Date(job.finishedAt).toLocaleString("fr-FR")}</span></span>
                  )}
                </div>
                {job.metrics && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(job.metrics).map(([k, v]) => (
                      <span key={k} className="rounded-full border border-zinc-800 bg-zinc-950/40 px-3 py-1 font-mono text-[11px] text-zinc-300">
                        {k} : {typeof v === "number" ? v.toFixed(4) : String(v)}
                      </span>
                    ))}
                  </div>
                )}
                {job.error && (
                  <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    {job.error}
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
