"use client";

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"
import { formatCredits } from "@/lib/client/hooks"
import { GitBranch, Coins, Timer, Zap } from "lucide-react"

/**
 * Graphe de dépendances des étapes d'un plan + simulation de coûts
 * (v3.6 — mode Explain).
 *
 * Dépendances : les étapes d'un plan GEN3IA forment une chaîne d'approvision-
 * nement — chaque étape consomme le contexte produit par la précédente
 * (cf. executor : contextBlock enrichi après chaque étape). Le graphe rend
 * cette réalité visible : nœud = étape, arête = dépendance de données.
 *
 * Simulation de coûts TEMPS RÉEL : à chaque frappe dans l'éditeur d'étape
 * (brouillon local), le poids de l'étape change → estimation par étape et
 * coût cumulé recalculés instantanément (fonction pure, testée).
 */

export interface PlanStepLike {
  title: string
  detail: string
  tool?: string
}

export interface PlanLike {
  name: string
  estimatedCostCredits: number
  steps: PlanStepLike[]
}

export interface ExecutedStepLike {
  title?: string
  status?: string
  latencyMs?: number
  tokensIn?: number
  tokensOut?: number
}

export interface StepCostEstimate {
  index: number
  /** Poids relatif de l'étape (0-1) dans le plan. */
  weight: number
  credits: number
  tokensIn: number
  tokensOut: number
  cumulativeCredits: number
}

/**
 * Estimation déterministe du coût d'un plan (fonction pure, testée) :
 *  - le budget total du plan (estimatedCostCredits) est réparti entre les
 *    étapes au prorata d'un POIDS = longueur du détail + bonus outil
 *    (une étape outillée consomme plus de tours ReAct) ;
 *  - 1 crédit ≈ 1000 tokens de sortie (convention du planificateur) ;
 *  - tokens d'entrée ≈ contexte cumulé (détails des étapes précédentes).
 */
export function estimateStepCosts(
  plan: Pick<PlanLike, "estimatedCostCredits">,
  steps: PlanStepLike[]
): StepCostEstimate[] {
  if (steps.length === 0) return []
  const weights = steps.map((s) => {
    const base = Math.max(20, s.detail.length)
    const toolBonus = s.tool ? 1.6 : 1
    const titleBonus = Math.max(5, s.title.length) / 4
    return base * toolBonus + titleBonus
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let cumulative = 0
  return steps.map((s, i) => {
    const weight = total > 0 ? weights[i] / total : 1 / steps.length
    const credits = Math.round(plan.estimatedCostCredits * weight * 100) / 100
    cumulative = Math.round((cumulative + credits) * 100) / 100
    // Entrée : contexte des étapes précédentes + cette étape (heuristic ~0.4).
    const contextChars = steps.slice(0, i + 1).reduce((a, x) => a + x.detail.length, 0)
    return {
      index: i,
      weight: Math.round(weight * 1000) / 1000,
      credits,
      tokensIn: Math.round((contextChars / 4) * 1.0),
      tokensOut: Math.round(credits * 1000),
      cumulativeCredits: cumulative,
    }
  })
}

const STATUS_COLORS: Record<string, string> = {
  DONE: "border-emerald-500/50 bg-emerald-500/10",
  FAILED: "border-rose-500/50 bg-rose-500/10",
  RUNNING: "border-teal-400/50 bg-teal-400/10 animate-pulse",
  PENDING: "border-zinc-700 bg-zinc-900/60",
  SKIPPED: "border-zinc-800 bg-zinc-900/30 opacity-60",
}

export interface PlanGraphProps {
  plan: PlanLike
  /** Brouillon d'édition locale (temps réel) — prime sur plan.steps. */
  draft?: Record<number, Partial<PlanStepLike>>
  /** Journal d'exécution (statuts/latences réelles si disponibles). */
  executionLog?: ExecutedStepLike[]
  compact?: boolean
}

export function PlanGraph({ plan, draft, executionLog, compact = false }: PlanGraphProps) {
  const { t } = useI18n()

  const steps = useMemo(() => {
    const merged = plan.steps.map((s, i) => ({ ...s, ...(draft?.[i] ?? {}) }))
    return merged
  }, [plan.steps, draft])

  const estimates = useMemo(() => estimateStepCosts(plan, steps), [plan, steps])
  const totalCredits = plan.estimatedCostCredits

  const nodeW = 148
  const nodeH = 84
  const gap = 44
  const width = Math.max(steps.length * (nodeW + gap) + 24, 320)
  const height = compact ? 120 : 150

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <GitBranch className="h-4 w-4 text-teal-400" />
          {t("tasks.explain.graph.title")}
          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400 font-normal">
            {steps.length} {t("tasks.explain.graph.stepsCount")}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-amber-300 font-mono">
            <Coins className="h-3.5 w-3.5" />
            {t("tasks.explain.cost.estimated")} {formatCredits(totalCredits)} cr
          </span>
          <span className="flex items-center gap-1.5 text-zinc-500 font-mono">
            <Zap className="h-3.5 w-3.5" />
            ≈ {Math.round(totalCredits * 1000).toLocaleString()} {t("tasks.explain.cost.tokensOut")}
          </span>
        </div>
      </div>

      {/* Graphe de dépendances (chaîne de contexte, scroll horizontal) */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
        <svg width={width} height={height} className="min-w-full" role="img" aria-label={t("tasks.explain.graph.title")}>
          {steps.map((step, i) => {
            const x = 12 + i * (nodeW + gap)
            const executed = executionLog?.[i]
            const status = executed?.status ?? "PENDING"
            const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.PENDING
            const est = estimates[i]
            return (
              <g key={i}>
                {/* Arête de dépendance (contexte produit → consommé) */}
                {i > 0 && (
                  <g>
                    <line
                      x1={x - gap + 8}
                      y1={compact ? 46 : 60}
                      x2={x - 12}
                      y2={compact ? 46 : 60}
                      stroke="#3f3f46"
                      strokeWidth={2}
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                )}
                {/* Nœud */}
                <foreignObject x={x} y={12} width={nodeW} height={nodeH}>
                  <div
                    className={`w-full h-full rounded-lg border p-2 text-left flex flex-col justify-between ${colorClass}`}
                    style={{ boxSizing: "border-box" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-teal-400 font-bold">#{i + 1}</span>
                      <span className="text-[11px] font-medium text-zinc-200 leading-tight line-clamp-2">
                        {step.title || "(sans titre)"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      {step.tool ? (
                        <Badge variant="outline" className="text-[9px] font-mono border-zinc-600 text-zinc-400 px-1">
                          {step.tool}
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-zinc-600">—</span>
                      )}
                      <span className="text-[10px] font-mono text-amber-300/80" title={t("tasks.explain.cost.stepCredits")}>
                        {est ? est.credits.toFixed(2) : "?"} cr
                      </span>
                    </div>
                    {executed?.latencyMs ? (
                      <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1">
                        <Timer className="h-2.5 w-2.5" /> {(executed.latencyMs / 1000).toFixed(1)}s
                      </span>
                    ) : null}
                  </div>
                </foreignObject>
                {/* Coût cumulé sous le nœud */}
                <text x={x + nodeW / 2} y={height - 16} textAnchor="middle" className="fill-zinc-500" fontSize={9} fontFamily="monospace">
                  Σ {est ? est.cumulativeCredits.toFixed(2) : "?"} cr
                </text>
              </g>
            )
          })}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#52525b" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Barre de répartition du budget (temps réel) */}
      <div>
        <div className="text-[10px] text-zinc-500 mb-1">{t("tasks.explain.cost.distribution")}</div>
        <div className="flex h-4 rounded-md overflow-hidden border border-zinc-800">
          {estimates.map((e, i) => (
            <div
              key={i}
              className="group relative"
              style={{
                width: `${e.weight * 100}%`,
                background: `hsl(${(160 + i * 24) % 360} 60% ${28 + (i % 3) * 6}%)`,
              }}
              title={`#${i + 1} — ${e.credits.toFixed(2)} cr`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
