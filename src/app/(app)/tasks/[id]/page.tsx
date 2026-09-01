"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { useToast } from "@/hooks/use-toast";
import { usePolling, apiPost, formatCredits, formatDate } from "@/lib/client/hooks";
import {
  Loader2, CheckCircle2, XCircle, Clock, ChevronRight, ShieldAlert, FileCheck,
  Brain, GitBranch, Scale, Play, RefreshCcw, GraduationCap, Package, Coins,
} from "lucide-react";

interface TaskDetail {
  task: {
    id: string
    prompt: string
    status: string
    selectedPlanId: string | null
    costCredits: number
    tokensIn: number
    tokensOut: number
    attempts: number
    error: string | null
    createdAt: string
    completedAt: string | null
    analysis: {
      intent: string
      goals: string[]
      constraints: string[]
      risks: string[]
      successCriteria: string[]
      estimatedComplexity: string
      estimatedSteps: number
    } | null
    plans: {
      id: string
      name: string
      strategy: string
      steps: { title: string; detail: string; tool?: string }[]
      requiredTools: string[]
      risks: string[]
      estimatedCostCredits: number
      successProbability: number
      requiresHumanConfirmation: boolean
    }[] | null
    planScores: {
      scores: { planId: string; weighted: number; breakdown: { criterion: string; value: number; weight: number }[] }[]
      selectedPlanId: string
      rationale: string
    } | null
    executionLog: {
      steps: { stepIndex: number; title: string; status: string; output: string; tool?: string }[]
      finalAnswer: string
    } | null
    verification: {
      verified: boolean
      confidence: number
      criteria: { criterion: string; met: boolean; evidence: string }[]
      gaps: string[]
      verdict: string
    } | null
    correctionLog: {
      attempt: number
      phase: string
      error: string
      classification: string
      strategy: string
      action: string
      outcome: string
    }[] | null
    learning: { lessons: string[]; userPreferences: string[]; reusablePatterns: string[] } | null
    result: { answer: string; metrics: { tokensIn: number; tokensOut: number; credits: number; attempts: number } } | null
    pendingApproval: { reason: string; planId: string; dangerousOperations: string[] } | null
  }
  steps: {
    id: string
    phase: string
    stepIndex: number
    title: string
    status: string
    detail: unknown
    startedAt: string | null
    finishedAt: string | null
  }[]
}

const ACTIVE_STATUSES = ["QUEUED", "ANALYZING", "PLANNING", "SIMULATING", "EXECUTING", "VERIFYING", "LEARNING"]

const PHASE_ICONS: Record<string, React.ReactNode> = {
  ANALYZING: <Brain className="h-3.5 w-3.5" />,
  PLANNING: <GitBranch className="h-3.5 w-3.5" />,
  SIMULATING: <Scale className="h-3.5 w-3.5" />,
  EXECUTING: <Play className="h-3.5 w-3.5" />,
  CORRECTING: <RefreshCcw className="h-3.5 w-3.5" />,
  VERIFYING: <FileCheck className="h-3.5 w-3.5" />,
  LEARNING: <GraduationCap className="h-3.5 w-3.5" />,
  DELIVERING: <Package className="h-3.5 w-3.5" />,
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [approving, setApproving] = useState(false)

  const isActive = (status: string) => ACTIVE_STATUSES.includes(status)
  const { data, loading } = usePolling<TaskDetail>(`/api/tasks/${id}`, null)
  // Sondage conditionnel : actif uniquement quand la tâche tourne.
  const { data: polled, loading: _ } = usePolling<TaskDetail>(
    data && isActive(data.task.status) ? `/api/tasks/${id}` : null,
    3000
  )
  const task = (polled ?? data)?.task
  const steps = (polled ?? data)?.steps ?? []

  async function approve(approved: boolean) {
    setApproving(true)
    try {
      const res = await apiPost(`/api/tasks/${id}/approve`, { approved })
      if (!res.ok) throw new Error(res.error)
      toast({
        title: approved ? "Opération approuvée" : "Opération refusée",
        description: approved ? "L'exécution reprend." : "La tâche est annulée.",
      })
      window.location.reload()
    } catch (err) {
      toast({ title: "Action impossible", description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setApproving(false)
    }
  }

  if (loading || !task) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-3/4 bg-zinc-800/60" />
        <Skeleton className="h-64 w-full bg-zinc-800/60" />
      </div>
    )
  }

  const plans = task.plans ?? []
  const selectedPlan = plans.find((p) => p.id === task.selectedPlanId)

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* En-tête */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-3">
            <Link href="/tasks" className="text-zinc-500 hover:text-zinc-300 text-base font-normal">← Tâches</Link>
            <span className="font-mono text-sm text-zinc-500">{task.id.slice(0, 12)}…</span>
          </h1>
          <StatusBadge status={task.status} />
          {task.attempts > 1 && <Badge variant="outline" className="border-amber-600/40 text-amber-300 text-[11px]">{task.attempts} tentatives</Badge>}
        </div>
        <p className="mt-3 text-sm text-zinc-300 bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 leading-relaxed">
          {task.prompt}
        </p>
      </div>

      {/* Approbation humaine */}
      {task.status === "WAITING_FOR_HUMAN" && task.pendingApproval && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-orange-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-200">Confirmation humaine requise</h3>
                <p className="text-sm text-orange-200/80 mt-1">{task.pendingApproval.reason}</p>
                <ul className="mt-3 space-y-1.5">
                  {task.pendingApproval.dangerousOperations.map((op) => (
                    <li key={op} className="text-xs font-mono text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1 inline-block mr-2">
                      {op}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-3">
                  <Button onClick={() => approve(true)} disabled={approving} className="bg-orange-500 hover:bg-orange-400 text-zinc-950 font-semibold">
                    {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span className="ml-2">Approuver et continuer</span>
                  </Button>
                  <Button onClick={() => approve(false)} disabled={approving} variant="outline" className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10">
                    <XCircle className="h-4 w-4" /><span className="ml-2">Refuser</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline du pipeline */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Pipeline d'exécution</span>
            {isActive(task.status) && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-normal">
                <Loader2 className="h-3 w-3 animate-spin" /> en cours — rafraîchissement auto
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-zinc-500 flex items-center gap-2 py-4">
              <Clock className="h-4 w-4" /> En file d'attente…
            </p>
          ) : (
            <div className="space-y-0 max-h-[500px] overflow-y-auto pr-2">
              {steps.map((s, i) => {
                const icon = PHASE_ICONS[s.phase] ?? <Play className="h-3.5 w-3.5" />
                const color =
                  s.status === "DONE" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : s.status === "FAILED" ? "text-red-400 border-red-500/30 bg-red-500/10"
                  : s.status === "RUNNING" ? "text-teal-300 border-teal-500/30 bg-teal-500/10 animate-pulse"
                  : s.status === "WAITING" ? "text-orange-300 border-orange-500/30 bg-orange-500/10"
                  : "text-zinc-500 border-zinc-800 bg-zinc-900"
                return (
                  <div key={s.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${color}`}>
                        {s.status === "DONE" ? <CheckCircle2 className="h-3.5 w-3.5" /> : icon}
                      </div>
                      {i < steps.length - 1 && <div className="w-px flex-1 bg-zinc-800 my-1" />}
                    </div>
                    <div className="pb-4 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm ${s.status === "RUNNING" ? "text-teal-300" : s.status === "DONE" ? "text-zinc-200" : "text-zinc-500"}`}>
                          {s.title}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-600 uppercase">{s.phase}</span>
                      </div>
                      {s.status === "RUNNING" && s.phase === "EXECUTING" && s.detail && typeof s.detail === "object" && "output" in (s.detail as object) && (
                        <p className="text-xs text-zinc-500 mt-1 truncate max-w-lg">
                          {String((s.detail as { output?: string }).output ?? "").slice(0, 120)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Erreur */}
      {task.error && task.status === "FAILED" && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-red-300 flex items-center gap-2"><XCircle className="h-4 w-4" />Échec de la tâche</h3>
            <p className="text-sm text-red-200/80 mt-2">{task.error}</p>
            <p className="text-xs text-zinc-500 mt-3">
              GEN3IA ne déclare jamais une tâche réussie sans preuve : consultez le rapport de vérification et les corrections ci-dessous.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Résultat */}
      {(task.result || task.executionLog?.finalAnswer) && task.status === "COMPLETED" && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Résultat final — vérifié
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {task.result?.answer ?? task.executionLog?.finalAnswer}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Analyse */}
        {task.analysis && (
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-emerald-400" />Analyse de la demande</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Intention</div>
                <p className="text-zinc-300">{task.analysis.intent}</p>
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Objectifs ({task.analysis.goals.length})</div>
                <ul className="space-y-1">
                  {task.analysis.goals.map((g) => (
                    <li key={g} className="text-zinc-300 flex gap-2"><span className="text-emerald-500">›</span>{g}</li>
                  ))}
                </ul>
              </div>
              {task.analysis.constraints.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Contraintes</div>
                  <ul className="space-y-1">
                    {task.analysis.constraints.map((c) => (
                      <li key={c} className="text-zinc-400 flex gap-2"><span className="text-zinc-600">›</span>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {task.analysis.risks.length > 0 && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Risques</div>
                  <ul className="space-y-1">
                    {task.analysis.risks.map((r) => (
                      <li key={r} className="text-amber-300/80 flex gap-2"><span className="text-amber-600">›</span>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">{task.analysis.estimatedComplexity}</Badge>
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">≈ {task.analysis.estimatedSteps} étapes</Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vérification */}
        {task.verification && (
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileCheck className={`h-4 w-4 ${task.verification.verified ? "text-emerald-400" : "text-red-400"}`} />
                Vérification
                <Badge variant="outline" className={`ml-auto ${task.verification.verified ? "border-emerald-600/50 text-emerald-300" : "border-red-600/50 text-red-300"}`}>
                  confiance {Math.round(task.verification.confidence * 100)}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {task.verification.criteria.map((c, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  {c.met ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-zinc-300">{c.criterion}</div>
                    {c.evidence && <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{c.evidence}</div>}
                  </div>
                </div>
              ))}
              {task.verification.gaps.length > 0 && (
                <div className="pt-2 border-t border-zinc-800">
                  <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Manques identifiés</div>
                  <ul className="space-y-1 text-amber-300/70 text-xs">
                    {task.verification.gaps.map((g) => <li key={g}>• {g}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs text-zinc-500 italic pt-1">{task.verification.verdict}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Plans comparés */}
      {plans.length > 0 && task.planScores && (
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-emerald-400" />
              Comparaison des {plans.length} plans
              <span className="ml-auto text-xs text-zinc-500 font-normal">{task.planScores.rationale}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {plans.map((p) => {
                const score = task.planScores!.scores.find((s) => s.planId === p.id)
                const selected = task.selectedPlanId === p.id
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-4 ${
                      selected ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-lg text-emerald-400">{p.id}</span>
                      {selected && <Badge className="bg-emerald-500 text-zinc-950 text-[10px] font-semibold">SÉLECTIONNÉ</Badge>}
                    </div>
                    <div className="font-medium text-sm mt-1 text-zinc-200">{p.name}</div>
                    <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{p.strategy}</p>
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-zinc-400">
                        <span>Score pondéré</span>
                        <span className="font-mono text-emerald-400">{score ? (score.weighted * 100).toFixed(1) : "—"}%</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Prob. succès</span>
                        <span className="font-mono">{Math.round(p.successProbability * 100)}%</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Coût estimé</span>
                        <span className="font-mono">{p.estimatedCostCredits} cr.</span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Étapes</span>
                        <span className="font-mono">{p.steps.length}</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-zinc-800/60 flex flex-wrap gap-1">
                      {p.requiredTools.slice(0, 4).map((t) => (
                        <span key={t} className="text-[10px] font-mono text-zinc-500 border border-zinc-800 rounded px-1.5 py-0.5">{t}</span>
                      ))}
                      {p.requiresHumanConfirmation && (
                        <span className="text-[10px] font-mono text-orange-300 border border-orange-500/30 rounded px-1.5 py-0.5">confirmation</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {selectedPlan && (
              <div className="mt-5 rounded-lg border border-emerald-500/25 bg-zinc-950 p-4">
                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                  Plan {selectedPlan.id} retenu — étapes d'exécution
                </div>
                <ol className="space-y-2">
                  {selectedPlan.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-mono font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="text-zinc-200">{s.title}</span>
                        {s.tool && <span className="ml-2 text-[10px] font-mono text-emerald-400/70 border border-emerald-500/20 rounded px-1.5 py-0.5">{s.tool}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Corrections */}
      {task.correctionLog && task.correctionLog.length > 0 && (
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCcw className="h-4 w-4 text-amber-400" /> Auto-corrections ({task.correctionLog.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {task.correctionLog.map((c, i) => (
              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3.5 text-xs space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="border-amber-600/40 text-amber-300 text-[10px]">{c.classification}</Badge>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{c.strategy}</Badge>
                  <span className="font-mono text-zinc-600">{c.phase} · tentative {c.attempt}</span>
                  <span className={`ml-auto ${c.outcome === "RECOVERED" ? "text-emerald-400" : c.outcome === "ABORTED" ? "text-red-400" : "text-amber-400"}`}>
                    {c.outcome}
                  </span>
                </div>
                <p className="text-zinc-400">{c.error}</p>
                <p className="text-zinc-500 italic">→ {c.action}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Apprentissage */}
      {task.learning && (
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-emerald-400" /> Apprentissage — mémorisé pour les prochaines tâches
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Leçons</div>
              <ul className="space-y-1.5">
                {task.learning.lessons.map((l) => <li key={l} className="text-zinc-300 text-xs">• {l}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Préférences détectées</div>
              <ul className="space-y-1.5">
                {task.learning.userPreferences.map((l) => <li key={l} className="text-zinc-300 text-xs">• {l}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Patrons réutilisables</div>
              <ul className="space-y-1.5">
                {task.learning.reusablePatterns.map((l) => <li key={l} className="text-zinc-300 text-xs">• {l}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coûts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-zinc-900/40 border-zinc-800 py-3">
          <CardContent className="px-4 text-center">
            <div className="text-lg font-bold flex items-center justify-center gap-1.5"><Coins className="h-4 w-4 text-emerald-400" />{formatCredits(task.costCredits)}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">crédits consommés</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800 py-3">
          <CardContent className="px-4 text-center">
            <div className="text-lg font-bold">{task.tokensIn.toLocaleString("fr-FR")}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">tokens entrée</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800 py-3">
          <CardContent className="px-4 text-center">
            <div className="text-lg font-bold">{task.tokensOut.toLocaleString("fr-FR")}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">tokens sortie</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800 py-3">
          <CardContent className="px-4 text-center">
            <div className="text-lg font-bold">{task.attempts}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5">tentative(s)</div>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-zinc-600 text-center">
        Créée le {formatDate(task.createdAt)}
        {task.completedAt && ` · terminée le ${formatDate(task.completedAt)}`}
      </p>
    </div>
  )
}
