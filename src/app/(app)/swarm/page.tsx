"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Network, ChevronDown, ChevronUp, PlayCircle } from "lucide-react";

/**
 * Swarm Intelligence — sessions multi-agents (hiérarchique ou débat).
 * Page exposant le moteur SwarmOrchestrator/DebateOrchestrator.
 */

interface SwarmSessionView {
  id: string;
  prompt: string;
  strategy: string;
  status: string;
  costCredits: number;
  createdAt: string;
}

interface SwarmDetail {
  session: {
    id: string;
    prompt: string;
    strategy: string;
    status: string;
    result: { summary?: string; [k: string]: unknown } | null;
    subTasks: Array<{ id: string; title: string; status: string; agentRole?: string }>;
    sharedMemories: Array<{ id: string; key?: string; content?: string }>;
    messages: Array<{ id: string; from?: string; content?: string; createdAt?: string }>;
  };
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: "En cours", cls: "border-blue-700/50 text-blue-300" },
  COMPLETED: { label: "Terminée", cls: "border-emerald-700/50 text-emerald-300" },
  FAILED: { label: "Échec", cls: "border-red-800/60 text-red-300" },
};

export default function SwarmPage() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SwarmSessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [strategy, setStrategy] = useState<"HIERARCHICAL" | "DEBATE">("HIERARCHICAL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<SwarmDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/swarm");
      const json = (await res.json()) as { ok: boolean; sessions?: SwarmSessionView[] };
      if (json.ok && json.sessions) setSessions(json.sessions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function launch() {
    if (prompt.trim().length < 10) {
      toast({ title: "Prompt trop court", description: "Décrivez la mission (10 caractères minimum).", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, strategy }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; sessionId?: string };
      if (json.ok) {
        toast({ title: "Swarm lancé", description: strategy === "DEBATE" ? "Débat multi-agents en cours…" : "Orchestration hiérarchique en cours…" });
        setPrompt("");
        await refresh();
      } else {
        toast({ title: "Lancement refusé", description: json.error, variant: "destructive" });
      }
    } finally {
      setRunning(false);
    }
  }

  async function openSession(id: string) {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/swarm/${id}`);
      const json = (await res.json()) as { ok: boolean } & SwarmDetail;
      if (json.ok) setDetail(json);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Swarm Intelligence</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Missions multi-agents : un orchestrateur coordonne plusieurs agents spécialisés
          (hiérarchique) ou les oppose en débat argumenté pour affiner la réponse. Mémoire
          partagée et bus de messages temps réel entre agents.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStrategy("HIERARCHICAL")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${strategy === "HIERARCHICAL" ? "border-emerald-600 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
          >
            <Network className="h-4 w-4" /> Hiérarchique
          </button>
          <button
            onClick={() => setStrategy("DEBATE")}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${strategy === "DEBATE" ? "border-emerald-600 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"}`}
          >
            <Users className="h-4 w-4" /> Débat
          </button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Mission du swarm : « Analysez le marché des fintech africaines et proposez 3 stratégies d'entrée… »"
          className="bg-zinc-950 border-zinc-800"
        />
        <Button onClick={() => void launch()} disabled={running} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Lancer le swarm
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          Aucune session swarm. Lancez votre première mission multi-agents ci-dessus.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const meta = STATUS_META[s.status] ?? { label: s.status, cls: "border-zinc-700 text-zinc-400" };
            return (
              <div key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40">
                <button
                  onClick={() => void openSession(s.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                        {s.strategy === "DEBATE" ? "Débat" : "Hiérarchique"}
                      </Badge>
                      <span className="text-[11px] text-zinc-600">
                        {new Date(s.createdAt).toLocaleString("fr-FR")} · {s.costCredits.toFixed(1)} crédits
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-zinc-300">{s.prompt}</p>
                  </div>
                  {expanded === s.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                </button>

                {expanded === s.id && (
                  <div className="border-t border-zinc-800 p-4">
                    {detailLoading || !detail ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {detail.session.subTasks.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                              Sous-tâches ({detail.session.subTasks.length})
                            </h4>
                            <div className="space-y-1.5">
                              {detail.session.subTasks.map((st) => (
                                <div key={st.id} className="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs">
                                  <span className={`h-2 w-2 shrink-0 rounded-full ${st.status === "COMPLETED" ? "bg-emerald-500" : st.status === "RUNNING" ? "bg-blue-500" : "bg-zinc-600"}`} />
                                  <span className="text-zinc-300">{st.title}</span>
                                  <span className="ml-auto text-zinc-600">{st.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {detail.session.messages.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                              Bus de messages ({detail.session.messages.length})
                            </h4>
                            <div className="max-h-64 space-y-1.5 overflow-y-auto">
                              {detail.session.messages.map((m, i) => (
                                <div key={m.id ?? i} className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs">
                                  <span className="font-medium text-emerald-400">{m.from ?? "agent"}</span>
                                  <span className="ml-2 text-zinc-400">{m.content}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {detail.session.result && (
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">Résultat</h4>
                            <pre className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-[11px] leading-relaxed text-zinc-300">
                              {typeof detail.session.result === "string"
                                ? detail.session.result
                                : JSON.stringify(detail.session.result, null, 2)}
                            </pre>
                          </div>
                        )}
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
