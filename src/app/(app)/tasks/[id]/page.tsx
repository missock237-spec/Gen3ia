"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPost, formatCredits, formatDate } from "@/lib/client/hooks";
import { PipelineDag } from "@/components/tasks/pipeline-dag";
import { StepInterceptor } from "@/components/tasks/step-interceptor";
import { DebugReplay } from "@/components/tasks/debug-replay";
import { Radio } from "lucide-react";
import {
  Loader2, CheckCircle2, XCircle, Clock, ChevronRight, ShieldAlert, FileCheck,
  Brain, GitBranch, Scale, Play, RefreshCcw, GraduationCap, Package, Coins,
  ListChecks, Pencil, Plus, Trash2, Sparkles, Image as ImageIcon, BarChart3,
  Network, Send, Download, Bug, SlidersHorizontal, MessageSquare,
} from "lucide-react";

/** Contenu multimodal généré (image/diagramme/graphique) par la tâche. */
interface GeneratedMedia {
  type: "image" | "diagram" | "chart"
  provider: string
  url: string
  caption: string
  dataUrl?: string
}

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

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { t } = useI18n();
  const [approving, setApproving] = useState(false)
  
  // Chat Multimodal
  const [multimodalPrompt, setMultimodalPrompt] = useState("")
  const [multimodalType, setMultimodalType] = useState<"image" | "diagram" | "chart">("image")
  const [generatingMedia, setGeneratingMedia] = useState(false)
  const [generatedMediaList, setGeneratedMediaList] = useState<GeneratedMedia[]>([])

  const isActive = (status: string) => ACTIVE_STATUSES.includes(status)
  const { data, loading } = usePolling<TaskDetail>(`/api/tasks/${id}`, null)
  const [startingLive, setStartingLive] = useState(false)

  /** Démarre une session live liée à cette tâche (partage d'écran temps réel). */
  async function startLiveSession() {
    setStartingLive(true)
    try {
      const json = await apiPost<{ session?: { code: string } }>(`/api/live`, {
        taskId: id,
        title: t("tasks.live.sessionTitle", { prompt: (data?.task?.prompt ?? t("tasks.live.defaultPrompt")).slice(0, 60) }),
      })
      if (json.ok && json.session) {
        window.location.href = `/live/${json.session.code}`
      } else {
        toast({ title: t("tasks.errors.liveRefused"), description: json.error, variant: "destructive" })
      }
    } catch (err) {
      toast({ title: t("common.errorNetwork"), description: err instanceof Error ? err.message : String(err), variant: "destructive" })
    } finally {
      setStartingLive(false)
    }
  }
  const { data: polled } = usePolling<TaskDetail>(
    data && isActive(data.task.status) ? `/api/tasks/${id}` : null,
    2500
  )
  const task = (polled ?? data)?.task
  const steps = (polled ?? data)?.steps ?? []

  async function approve(approved: boolean) {
    setApproving(true)
    try {
      const res = await apiPost(`/api/tasks/${id}/approve`, { approved })
      if (!res.ok) throw new Error(res.error)
      toast({
        title: approved ? t("tasks.approval.approvedTitle") : t("tasks.approval.rejectedTitle"),
        description: approved ? t("tasks.approval.approvedDesc") : t("tasks.approval.rejectedDesc"),
      })
      window.location.reload()
    } catch (err) {
      toast({ title: t("tasks.errors.actionFailed"), description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setApproving(false)
    }
  }

  async function handleGenerateMultimodal() {
    if (!multimodalPrompt.trim()) return
    setGeneratingMedia(true)

    try {
      const res = await apiPost<{ media: GeneratedMedia }>("/api/multimodal/generate", {
        prompt: multimodalPrompt,
        type: multimodalType,
        taskId: id,
      })

      if (!res.ok) throw new Error(res.error)

      setGeneratedMediaList((prev) => [res.media, ...prev])
      setMultimodalPrompt("")
      toast({
        title: t("tasks.multimodal.generatedTitle"),
        description: `${res.media.caption}`,
      })
    } catch (err) {
      toast({
        title: t("tasks.multimodal.errorTitle"),
        description: err instanceof Error ? err.message : t("common.errorNetwork"),
        variant: "destructive",
      })
    } finally {
      setGeneratingMedia(false)
    }
  }

  if (loading || !task) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-3/4 bg-zinc-800/60" />
        <Skeleton className="h-64 w-full bg-zinc-800/60" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-3">
              <Link href="/tasks" className="text-zinc-500 hover:text-zinc-300 text-base font-normal">{t("tasks.backToTasks")}</Link>
              <span className="font-mono text-sm text-zinc-500">{task.id.slice(0, 12)}…</span>
            </h1>
            <StatusBadge status={task.status} />
            {task.attempts > 1 && (
              <Badge variant="outline" className="border-amber-600/40 text-amber-300 text-[11px]">
                {t("tasks.attempts", { count: task.attempts })}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-zinc-300 bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3.5 leading-relaxed">
            {task.prompt}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={startingLive}
            onClick={() => void startLiveSession()}
            className="border-red-800/60 text-red-300 hover:bg-red-950/30"
          >
            {startingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            {t("tasks.live.button")}
          </Button>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 font-mono text-xs px-3 py-1">
            <Coins className="h-3.5 w-3.5 mr-1.5" />
            {t("tasks.credits", { credits: formatCredits(task.costCredits) })}
          </Badge>
        </div>
      </div>

      {/* Approbation humaine critique */}
      {task.status === "WAITING_FOR_HUMAN" && task.pendingApproval && (
        <Card className="border-orange-500/40 bg-orange-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-6 w-6 text-orange-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-200">{t("tasks.approval.title")}</h3>
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
                    <span className="ml-2">{t("tasks.approval.approve")}</span>
                  </Button>
                  <Button onClick={() => approve(false)} disabled={approving} variant="outline" className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10">
                    <XCircle className="h-4 w-4" /><span className="ml-2">{t("tasks.approval.reject")}</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 1. Visualisation du Graphe d'Exécution (DAG) */}
      <section>
        <PipelineDag task={task} steps={steps} />
      </section>

      {/* Onglets des Fonctionnalités Améliorées & Vues de Détail */}
      <Tabs defaultValue="pas-a-pas" className="space-y-4">
        <TabsList className="bg-zinc-900/80 border border-zinc-800 p-1 grid grid-cols-2 sm:grid-cols-4 gap-1">
          <TabsTrigger value="pas-a-pas" className="text-xs font-medium gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-teal-400" /> {t("tasks.tabs.stepByStep")}
          </TabsTrigger>
          <TabsTrigger value="multimodal" className="text-xs font-medium gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-400" /> {t("tasks.tabs.multimodal")}
          </TabsTrigger>
          <TabsTrigger value="debug" className="text-xs font-medium gap-1.5">
            <Bug className="h-3.5 w-3.5 text-amber-400" /> {t("tasks.tabs.debug")}
          </TabsTrigger>
          <TabsTrigger value="details" className="text-xs font-medium gap-1.5">
            <ListChecks className="h-3.5 w-3.5 text-emerald-400" /> {t("tasks.tabs.details")}
          </TabsTrigger>
        </TabsList>

        {/* 2. Mode "pas-à-pas" interactif SSE */}
        <TabsContent value="pas-a-pas">
          <StepInterceptor taskId={task.id} initialTask={task} initialSteps={steps} />
        </TabsContent>

        {/* 3. Chat Multimodal */}
        <TabsContent value="multimodal" className="space-y-4">
          <Card className="border-purple-500/30 bg-zinc-950/90 shadow-xl">
            <CardHeader className="pb-3 border-b border-zinc-800">
              <CardTitle className="text-base text-zinc-100 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                {t("tasks.multimodal.title")}
              </CardTitle>
            </CardHeader>

            <CardContent className="pt-4 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    value={multimodalPrompt}
                    onChange={(e) => setMultimodalPrompt(e.target.value)}
                    placeholder={t("tasks.multimodal.placeholder")}
                    className="bg-zinc-900 border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500"
                    onKeyDown={(e) => e.key === "Enter" && handleGenerateMultimodal()}
                  />
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant={multimodalType === "image" ? "default" : "outline"}
                    onClick={() => setMultimodalType("image")}
                    className={`h-9 text-xs gap-1 ${multimodalType === "image" ? "bg-purple-600 text-white" : "border-zinc-700"}`}
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> {t("tasks.multimodal.image")}
                  </Button>
                  <Button
                    size="sm"
                    variant={multimodalType === "diagram" ? "default" : "outline"}
                    onClick={() => setMultimodalType("diagram")}
                    className={`h-9 text-xs gap-1 ${multimodalType === "diagram" ? "bg-purple-600 text-white" : "border-zinc-700"}`}
                  >
                    <Network className="h-3.5 w-3.5" /> {t("tasks.multimodal.diagram")}
                  </Button>
                  <Button
                    size="sm"
                    variant={multimodalType === "chart" ? "default" : "outline"}
                    onClick={() => setMultimodalType("chart")}
                    className={`h-9 text-xs gap-1 ${multimodalType === "chart" ? "bg-purple-600 text-white" : "border-zinc-700"}`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> {t("tasks.multimodal.chart")}
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleGenerateMultimodal}
                    disabled={generatingMedia || !multimodalPrompt.trim()}
                    className="bg-purple-500 hover:bg-purple-400 text-zinc-950 font-semibold h-9 text-xs"
                  >
                    {generatingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Galerie de contenus générés */}
              {generatedMediaList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-900">
                  {generatedMediaList.map((media, idx) => (
                    <div key={idx} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-300 font-mono">
                          {media.provider || media.type}
                        </Badge>
                        <a
                          href={media.url}
                          download={`gen3ia-media-${idx + 1}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                        >
                          <Download className="h-3 w-3" /> {t("tasks.multimodal.download")}
                        </a>
                      </div>

                      <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center p-2 min-h-[220px]">
                        <img
                          src={media.url}
                          alt={media.caption}
                          className="max-h-[300px] w-auto object-contain rounded"
                        />
                      </div>

                      <p className="text-xs text-zinc-300 font-medium">{media.caption}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500 text-xs border border-dashed border-zinc-800/80 rounded-lg">
                  {t("tasks.multimodal.empty")}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Mode Débug Avancé */}
        <TabsContent value="debug">
          <DebugReplay task={task} steps={steps} />
        </TabsContent>

        {/* Détails traditionnels du pipeline */}
        <TabsContent value="details" className="space-y-6">
          {/* Résultat Final */}
          {task.result && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardHeader>
                <CardTitle className="text-base text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> {t("tasks.result.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="prose prose-invert prose-emerald text-sm max-w-none bg-zinc-950/80 border border-emerald-500/20 rounded-lg p-4 leading-relaxed whitespace-pre-wrap">
                  {task.result.answer}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analyse */}
          {task.analysis && (
            <Card className="bg-zinc-900/40 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-zinc-200">
                  <Brain className="h-4 w-4 text-emerald-400" /> {t("tasks.analysis.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <span className="text-zinc-500 font-medium">{t("tasks.analysis.intent")}</span>
                  <p className="text-zinc-200 mt-1 font-mono bg-zinc-950 p-2.5 rounded border border-zinc-800">{task.analysis.intent}</p>
                </div>
                {task.analysis.goals?.length > 0 && (
                  <div>
                    <span className="text-zinc-500 font-medium">{t("tasks.analysis.goals")}</span>
                    <ul className="list-disc list-inside mt-1 text-zinc-300 space-y-1">
                      {task.analysis.goals.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
