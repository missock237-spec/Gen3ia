"use client";

import Link from "next/link";
import { useUser, usePolling, formatCredits, formatDate } from "@/lib/client/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Bot, ListChecks, Coins, CheckCircle2, Plus, ArrowRight, Coins as CoinsIcon } from "lucide-react";

interface TaskRow {
  id: string
  prompt: string
  status: string
  costCredits: number
  createdAt: string
  selectedPlanId: string | null
}

interface AgentRow {
  id: string
  name: string
  status: string
  stats: string | null
}

interface DashboardData {
  ok: boolean
  tasks: TaskRow[]
  agents: AgentRow[]
}

export default function DashboardPage() {
  const { user } = useUser();
  const { data, loading } = usePolling<DashboardData>("/api/tasks", 8000);
  const { data: agentsData } = usePolling<{ ok: boolean; agents: AgentRow[] }>("/api/agents");

  const tasks = data?.tasks ?? [];
  const agents = agentsData?.agents ?? [];
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const failed = tasks.filter((t) => t.status === "FAILED").length;
  const active = tasks.filter((t) => !["COMPLETED", "FAILED", "CANCELLED"].includes(t.status)).length;
  const successRate = completed + failed > 0 ? Math.round((completed / (completed + failed)) * 100) : null;
  const totalCredits = tasks.reduce((acc, t) => acc + t.costCredits, 0);
  const publishedAgents = agents.filter((a) => a.status === "PUBLISHED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Bonjour {user?.name ?? ""} — voici l'état de votre plateforme d'agents.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/agents/new">
            <Button variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-800/60">
              <Bot className="h-4 w-4 mr-2" />
              Nouvel agent
            </Button>
          </Link>
          <Link href="/tasks">
            <Button className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold">
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle tâche
            </Button>
          </Link>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Agents</CardTitle>
            <Bot className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{agents.length}</div>
            <p className="text-xs text-zinc-500 mt-1">{publishedAgents} publié(s)</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Tâches</CardTitle>
            <ListChecks className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{tasks.length}</div>
            <p className="text-xs text-zinc-500 mt-1">{active} active(s)</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Taux de réussite</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{successRate === null ? "—" : `${successRate}%`}</div>
            {successRate !== null && (
              <Progress value={successRate} className="mt-2 h-1.5 [&>div]:bg-emerald-500" />
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Crédits</CardTitle>
            <CoinsIcon className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{formatCredits(user?.credits ?? 0)}</div>
            <p className="text-xs text-zinc-500 mt-1">{formatCredits(totalCredits)} consommés</p>
          </CardContent>
        </Card>
      </div>

      {/* Rappel du pipeline */}
      <Card className="bg-gradient-to-r from-emerald-500/5 via-zinc-900/40 to-zinc-900/40 border-zinc-800">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs">
            {["Analyse", "5 Plans", "Évaluation", "Exécution", "Vérification", "Apprentissage", "Livraison"].map((phase, i) => (
              <span key={phase} className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-500/25 text-emerald-300/90 font-normal">
                  {phase}
                </Badge>
                {i < 6 && <ArrowRight className="h-3 w-3 text-zinc-700" />}
              </span>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-3">
            Chaque tâche traverse ce pipeline — visible en direct dans le Task Center.
          </p>
        </CardContent>
      </Card>

      {/* Tâches récentes */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Tâches récentes</CardTitle>
          <Link href="/tasks">
            <Button variant="ghost" size="sm" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
              Tout voir <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-zinc-800/60" />)}
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">
              <ListChecks className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">Aucune tâche pour l'instant.</p>
              <Link href="/tasks" className="mt-3 inline-block">
                <Button size="sm" className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                  <Plus className="h-4 w-4 mr-2" /> Lancer votre première tâche
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 6).map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-3 hover:border-zinc-700 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate">{t.prompt}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {formatDate(t.createdAt)} · {t.costCredits > 0 ? `${formatCredits(t.costCredits)} crédits` : "—"}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
