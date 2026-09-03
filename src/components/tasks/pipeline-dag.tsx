"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Brain,
  GitBranch,
  Scale,
  Play,
  FileCheck,
  GraduationCap,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Coins,
  Loader2,
} from "lucide-react"

export interface PipelineDagProps {
  task: {
    id: string
    status: string
    costCredits?: number
    tokensIn?: number
    tokensOut?: number
    startedAt?: string | null
    completedAt?: string | null
    analysis?: any
    plans?: any
    planScores?: any
    executionLog?: any
    verification?: any
    learning?: any
    result?: any
  }
  steps?: {
    id: string
    phase: string
    stepIndex: number
    title: string
    status: string
    detail?: any
    startedAt?: string | null
    finishedAt?: string | null
  }[]
  mini?: boolean
  onNodeClick?: (phase: string) => void
}

const PHASES = [
  { key: "ANALYZING", label: "Analyse", icon: Brain, description: "Compréhension de la demande & contraintes" },
  { key: "PLANNING", label: "5 Plans", icon: GitBranch, description: "Génération de 5 stratégies d'exécution" },
  { key: "SIMULATING", label: "Évaluation", icon: Scale, description: "Simulation, filtres éthiques & choix du plan" },
  { key: "EXECUTING", label: "Exécution", icon: Play, description: "Exécution pas-à-pas des outils & LLM" },
  { key: "VERIFYING", label: "Vérification", icon: FileCheck, description: "Contrôle factuel & détection d'hallucinations" },
  { key: "LEARNING", label: "Apprentissage", icon: GraduationCap, description: "Extraction de leçons & mise en mémoire" },
  { key: "DELIVERING", label: "Livraison", icon: Package, description: "Restitution du résultat final" },
]

export function PipelineDag({ task, steps = [], mini = false, onNodeClick }: PipelineDagProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)

  // Calcule le statut de chaque phase du pipeline
  const getPhaseStatus = (phaseKey: string) => {
    const phaseStep = steps.find((s) => s.phase === phaseKey)
    if (phaseStep) return phaseStep.status

    const statusMap: Record<string, string[]> = {
      ANALYZING: ["ANALYZING", "PLANNING", "SIMULATING", "WAITING_PLAN_APPROVAL", "EXECUTING", "VERIFYING", "LEARNING", "COMPLETED"],
      PLANNING: ["PLANNING", "SIMULATING", "WAITING_PLAN_APPROVAL", "EXECUTING", "VERIFYING", "LEARNING", "COMPLETED"],
      SIMULATING: ["SIMULATING", "WAITING_PLAN_APPROVAL", "EXECUTING", "VERIFYING", "LEARNING", "COMPLETED"],
      EXECUTING: ["EXECUTING", "VERIFYING", "LEARNING", "COMPLETED"],
      VERIFYING: ["VERIFYING", "LEARNING", "COMPLETED"],
      LEARNING: ["LEARNING", "COMPLETED"],
      DELIVERING: ["COMPLETED"],
    }

    if (task.status === "FAILED") return "FAILED"
    if (task.status === phaseKey) return "RUNNING"
    if (task.status === "WAITING_PLAN_APPROVAL" && phaseKey === "SIMULATING") return "WAITING"
    if ((statusMap[phaseKey] ?? []).includes(task.status)) return "DONE"
    return "PENDING"
  }

  // Calcule la durée estimée ou réelle d'une phase
  const getPhaseDuration = (phaseKey: string) => {
    const phaseStep = steps.find((s) => s.phase === phaseKey)
    if (phaseStep?.startedAt && phaseStep?.finishedAt) {
      const ms = new Date(phaseStep.finishedAt).getTime() - new Date(phaseStep.startedAt).getTime()
      return `${(ms / 1000).toFixed(1)}s`
    }
    if (phaseStep?.startedAt && phaseStep?.status === "RUNNING") {
      const ms = Date.now() - new Date(phaseStep.startedAt).getTime()
      return `${(ms / 1000).toFixed(1)}s`
    }
    return null
  }

  // Distribution indicative du coût
  const getPhaseCost = (phaseKey: string) => {
    if (!task.costCredits || task.costCredits === 0) return null
    const weights: Record<string, number> = {
      ANALYZING: 0.1,
      PLANNING: 0.3,
      SIMULATING: 0.1,
      EXECUTING: 0.4,
      VERIFYING: 0.05,
      LEARNING: 0.05,
      DELIVERING: 0.0,
    }
    const val = task.costCredits * (weights[phaseKey] ?? 0.05)
    return val > 0.001 ? `${val.toFixed(3)} cr` : null
  }

  if (mini) {
    return (
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-xs">
        {PHASES.map((p, idx) => {
          const status = getPhaseStatus(p.key)
          const isDone = status === "DONE"
          const isRunning = status === "RUNNING"
          const isFailed = status === "FAILED"
          const isWaiting = status === "WAITING"

          return (
            <div key={p.key} className="flex items-center gap-1 shrink-0">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-mono text-[10px] ${
                  isDone
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : isRunning
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-300 animate-pulse"
                      : isWaiting
                        ? "bg-teal-500/10 border-teal-500/40 text-teal-300"
                        : isFailed
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                          : "bg-zinc-900 border-zinc-800 text-zinc-500"
                }`}
              >
                {isRunning ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 className="h-2.5 w-2.5" />
                ) : isFailed ? (
                  <AlertCircle className="h-2.5 w-2.5" />
                ) : null}
                {p.label}
              </span>
              {idx < PHASES.length - 1 && <span className="text-zinc-700 font-bold">→</span>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
            <h3 className="text-sm font-semibold text-zinc-200 tracking-wide">
              Graphe d'Exécution du Pipeline (DAG)
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
            {task.costCredits !== undefined && (
              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                <Coins className="h-3 w-3" /> {task.costCredits.toFixed(3)} cr
              </span>
            )}
            <Badge variant="outline" className="border-zinc-700 text-zinc-300 font-normal">
              {task.status}
            </Badge>
          </div>
        </div>

        {/* Représentation SVG Inline du DAG avec Flèches et Nœuds */}
        <div className="relative overflow-x-auto pt-2 pb-4">
          <svg viewBox="0 0 950 180" className="w-full min-w-[850px] h-auto">
            <defs>
              <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
              </linearGradient>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#52525b" />
              </marker>
              <marker
                id="arrowhead-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
              </marker>
            </defs>

            {/* Arêtes (Dépendances entre nœuds) */}
            {PHASES.slice(0, -1).map((_, i) => {
              const x1 = 60 + i * 130 + 90
              const y1 = 80
              const x2 = 60 + (i + 1) * 130
              const y2 = 80
              const status = getPhaseStatus(PHASES[i].key)
              const isActiveEdge = status === "DONE" || status === "RUNNING"

              return (
                <g key={`edge-${i}`}>
                  <path
                    d={`M ${x1} ${y1} C ${x1 + 20} ${y1}, ${x2 - 20} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={isActiveEdge ? "#10b981" : "#27272a"}
                    strokeWidth={isActiveEdge ? "2.5" : "1.5"}
                    strokeDasharray={isActiveEdge ? "none" : "4,4"}
                    markerEnd={isActiveEdge ? "url(#arrowhead-active)" : "url(#arrowhead)"}
                  />
                </g>
              )
            })}

            {/* Nœuds par Phase */}
            {PHASES.map((p, idx) => {
              const x = 60 + idx * 130
              const y = 45
              const nodeWidth = 100
              const nodeHeight = 70
              const status = getPhaseStatus(p.key)
              const Icon = p.icon
              const duration = getPhaseDuration(p.key)
              const cost = getPhaseCost(p.key)

              const isDone = status === "DONE"
              const isRunning = status === "RUNNING"
              const isFailed = status === "FAILED"
              const isWaiting = status === "WAITING"

              const strokeColor = isDone
                ? "#10b981"
                : isRunning
                  ? "#f59e0b"
                  : isWaiting
                    ? "#14b8a6"
                    : isFailed
                      ? "#f43f5e"
                      : "#27272a"

              const fillColor = isDone
                ? "#064e3b"
                : isRunning
                  ? "#78350f"
                  : isWaiting
                    ? "#134e4a"
                    : isFailed
                      ? "#881337"
                      : "#18181b"

              return (
                <g
                  key={p.key}
                  transform={`translate(${x}, ${y})`}
                  className="cursor-pointer transition-transform hover:scale-105"
                  onClick={() => onNodeClick?.(p.key)}
                >
                  {/* Rectangle du Nœud */}
                  <rect
                    width={nodeWidth}
                    height={nodeHeight}
                    rx="10"
                    fill={fillColor}
                    fillOpacity="0.4"
                    stroke={strokeColor}
                    strokeWidth={isRunning ? "2.5" : "1.5"}
                    className={isRunning ? "animate-pulse" : ""}
                  />

                  {/* Badge de Statut ou Icône */}
                  <circle
                    cx="20"
                    cy="25"
                    r="12"
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth="1.5"
                  />
                  <foreignObject x="12" y="17" width="16" height="16">
                    <div className="flex items-center justify-center text-zinc-100">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </foreignObject>

                  {/* Libellé de la phase */}
                  <text
                    x="40"
                    y="28"
                    fill="#f4f4f5"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="sans-serif"
                  >
                    {p.label}
                  </text>

                  {/* Durée / Coût dans le nœud */}
                  <g transform="translate(10, 48)">
                    {duration && (
                      <text fill="#10b981" fontSize="9" fontFamily="monospace">
                        ⏱ {duration}
                      </text>
                    )}
                    {cost && (
                      <text x="50" fill="#f59e0b" fontSize="9" fontFamily="monospace">
                        ⚡ {cost}
                      </text>
                    )}
                    {!duration && !cost && (
                      <text fill="#71717a" fontSize="9" fontFamily="monospace">
                        {status}
                      </text>
                    )}
                  </g>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Détails interactifs sur sélection */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-900 text-xs">
          {PHASES.map((p) => {
            const status = getPhaseStatus(p.key)
            const duration = getPhaseDuration(p.key)
            const cost = getPhaseCost(p.key)
            return (
              <div
                key={p.key}
                onClick={() => onNodeClick?.(p.key)}
                className="bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/60 rounded-lg p-2.5 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between font-medium text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <p.icon className="h-3.5 w-3.5 text-emerald-400" />
                    {p.label}
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-zinc-700">
                    {status}
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <span>{duration ? `Durée: ${duration}` : "—"}</span>
                  <span>{cost ? `Coût: ${cost}` : ""}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}
