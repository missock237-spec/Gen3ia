"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { apiPost } from "@/lib/client/hooks"
import {
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Pencil,
  RotateCcw,
  Radio,
  SlidersHorizontal,
  Loader2,
  ListChecks,
  Sparkles,
} from "lucide-react"

export interface StepInterceptorProps {
  taskId: string
  initialTask?: any
  initialSteps?: any[]
  onTaskUpdated?: (task: any, steps: any[]) => void
}

export function StepInterceptor({ taskId, initialTask, initialSteps = [], onTaskUpdated }: StepInterceptorProps) {
  const { toast } = useToast()
  const [task, setTask] = useState<any>(initialTask)
  const [steps, setSteps] = useState<any[]>(initialSteps)
  const [stepByStepMode, setStepByStepMode] = useState<boolean>(true)
  const [sseConnected, setSseConnected] = useState<boolean>(false)

  // Édition d'étape
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editDetail, setEditDetail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Établissement du flux SSE
  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource(`/api/tasks/${taskId}/stream`)

      eventSource.onopen = () => {
        setSseConnected(true)
      }

      eventSource.addEventListener("init", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          setTask(data.task)
          setSteps(data.steps)
          onTaskUpdated?.(data.task, data.steps)
        } catch {}
      })

      eventSource.addEventListener("update", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          setTask(data.task)
          setSteps(data.steps)
          onTaskUpdated?.(data.task, data.steps)
        } catch {}
      })

      eventSource.addEventListener("status_change", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          toast({
            title: `Changement de phase : ${data.newStatus}`,
            description: `Le pipeline est passé de ${data.oldStatus} à ${data.newStatus}.`,
          })
        } catch {}
      })

      eventSource.onerror = () => {
        setSseConnected(false)
      }
    } catch {
      setSseConnected(false)
    }

    return () => {
      eventSource?.close()
    }
  }, [taskId])

  const handleApproveStep = async (approved: boolean) => {
    setSubmitting(true)
    try {
      const res = await apiPost(`/api/tasks/${taskId}/approve`, { approved })
      if (!res.ok) throw new Error(res.error)
      toast({
        title: approved ? "Étape validée avec succès" : "Étape refusée",
        description: approved ? "Poursuite de l'exécution du pipeline..." : "Tâche interrompue.",
      })
      if (res.task) setTask(res.task)
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible de valider l'étape",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveStepEdit = async (planId?: string) => {
    if (editingStepIndex === null) return
    setSubmitting(true)

    try {
      const currentPlan = task.plans?.find((p: any) => p.id === (planId || task.selectedPlanId || "P1"))
      if (!currentPlan) throw new Error("Plan introuvable pour la modification")

      const updatedSteps = [...(currentPlan.steps || [])]
      updatedSteps[editingStepIndex] = {
        ...updatedSteps[editingStepIndex],
        title: editTitle,
        detail: editDetail,
      }

      const res = await apiPost(`/api/tasks/${taskId}/plans/approve`, {
        approved: true,
        planId: currentPlan.id,
        editedSteps: updatedSteps,
      })

      if (!res.ok) throw new Error(res.error)

      toast({
        title: "Étape modifiée",
        description: "Modifications appliquées et relance du pipeline.",
      })
      setEditingStepIndex(null)
      if (res.task) setTask(res.task)
    } catch (err) {
      toast({
        title: "Erreur lors de l'enregistrement",
        description: err instanceof Error ? err.message : "Échec",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const currentPlan = task?.plans?.find((p: any) => p.id === (task?.selectedPlanId || task?.planScores?.selectedPlanId || "P1"))

  return (
    <Card className="border-teal-500/30 bg-zinc-950/90 shadow-xl">
      <CardHeader className="pb-3 border-b border-zinc-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-5 w-5 text-teal-400" />
            <CardTitle className="text-base text-zinc-100 font-semibold">
              Mode Pas-à-Pas Interactif (SSE Direct)
            </CardTitle>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Radio className={`h-3.5 w-3.5 ${sseConnected ? "text-emerald-400 animate-pulse" : "text-zinc-600"}`} />
              <span className={sseConnected ? "text-emerald-400" : "text-zinc-500"}>
                {sseConnected ? "SSE Connecté" : "Hors-ligne"}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-2.5 py-1">
              <Label htmlFor="step-mode" className="text-zinc-300 text-[11px] cursor-pointer">
                Validation pas-à-pas
              </Label>
              <Switch id="step-mode" checked={stepByStepMode} onCheckedChange={setStepByStepMode} />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Statut d'attente d'approbation */}
        {task?.status === "WAITING_PLAN_APPROVAL" && (
          <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-teal-300 font-semibold text-sm">
              <ListChecks className="h-4 w-4" />
              Interception : Validation du plan d'exécution requise
            </div>
            <p className="text-xs text-teal-200/80">
              Le pipeline SSE est en pause. Vous pouvez modifier la séquence des étapes ci-dessous avant de lancer l'exécution.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => handleApproveStep(true)}
                disabled={submitting}
                className="bg-teal-500 text-zinc-950 hover:bg-teal-400 font-semibold h-8 text-xs"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                Valider & Exécuter le pipeline
              </Button>
              <Button
                onClick={() => handleApproveStep(false)}
                disabled={submitting}
                variant="outline"
                className="border-teal-500/40 text-teal-300 hover:bg-teal-500/10 h-8 text-xs"
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" /> Refuser
              </Button>
            </div>
          </div>
        )}

        {/* Liste des Étapes avec possibilité d'édition temps réel */}
        {currentPlan ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-zinc-400 flex items-center justify-between">
              <span>Étapes du plan sélectionné ({currentPlan.name}) :</span>
              <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 font-normal">
                {currentPlan.steps?.length || 0} étapes
              </Badge>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {currentPlan.steps?.map((step: any, idx: number) => {
                const isEditing = editingStepIndex === idx

                return (
                  <div
                    key={idx}
                    className="bg-zinc-900/60 border border-zinc-800/80 rounded-lg p-3 transition-colors hover:border-zinc-700 space-y-2"
                  >
                    {isEditing ? (
                      <div className="space-y-3 pt-1">
                        <div>
                          <Label className="text-xs text-zinc-400">Titre de l'étape</Label>
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="bg-zinc-950 border-zinc-700 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-zinc-400">Détails / Instructions</Label>
                          <Textarea
                            value={editDetail}
                            onChange={(e) => setEditDetail(e.target.value)}
                            className="bg-zinc-950 border-zinc-700 text-xs mt-1 h-20"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingStepIndex(null)}
                            className="h-7 text-xs text-zinc-400"
                          >
                            Annuler
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSaveStepEdit(currentPlan.id)}
                            disabled={submitting}
                            className="h-7 text-xs bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                          >
                            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                            Enregistrer l'étape
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-teal-400 font-semibold">#{idx + 1}</span>
                            <span className="text-xs font-medium text-zinc-200">{step.title}</span>
                            {step.tool && (
                              <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 text-zinc-400">
                                {step.tool}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{step.detail}</p>
                        </div>

                        {stepByStepMode && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingStepIndex(idx)
                              setEditTitle(step.title)
                              setEditDetail(step.detail)
                            }}
                            className="h-7 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 shrink-0"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Modifier
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-zinc-800 rounded-lg">
            Aucun plan en attente de validation pour le moment.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
