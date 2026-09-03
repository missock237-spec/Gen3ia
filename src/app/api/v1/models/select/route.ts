import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { selectModel } from "@/lib/ai/router-v2"

const selectSchema = z.object({
  prompt: z.string().max(20_000).optional(),
  task_type: z.enum([
    "ANALYSIS", "PLANNING", "EXECUTION", "VERIFICATION", "LEARNING",
    "CHAT", "SUMMARIZATION", "EMBEDDING", "VISION",
  ]).optional(),
  required_capabilities: z.array(z.string().max(40)).max(10).optional(),
  context_tokens: z.number().int().min(0).max(2_000_000).optional(),
  desired_quality: z.enum(["fast", "balanced", "premium"]).optional(),
  latency_constraint_ms: z.number().int().min(100).max(600_000).optional(),
  budget_credits: z.number().min(0).max(100_000).optional(),
  user_plan: z.enum(["FREE", "PRO", "ENTERPRISE"]).optional(),
  available_credits: z.number().min(0).optional(),
  model_constraints: z
    .object({
      providers: z.array(z.string().max(30)).max(10).optional(),
      exclude_providers: z.array(z.string().max(30)).max(10).optional(),
      exclude_models: z.array(z.string().max(200)).max(20).optional(),
      require_commercial_use: z.boolean().optional(),
      max_latency_ms: z.number().int().optional(),
      max_cost_per_k_out: z.number().optional(),
    })
    .optional(),
})

/**
 * API unifiée v1 — POST /api/v1/models/select
 * Demande au Model Router la MEILLEURE sélection (sans exécuter) :
 * modèle, provider, RAISON, score, alternatives, coût estimé, confiance.
 */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const body = await readJson(req, selectSchema)

    const selection = await selectModel(
      {
        prompt: body.prompt,
        taskType: body.task_type,
        requiredCapabilities: body.required_capabilities,
        contextTokens: body.context_tokens,
        desiredQuality: body.desired_quality,
        latencyConstraintMs: body.latency_constraint_ms,
        budgetCredits: body.budget_credits,
        userPlan: body.user_plan ?? ctx.user.plan,
        availableCredits: body.available_credits ?? ctx.user.credits,
        modelConstraints: body.model_constraints
          ? {
              providers: body.model_constraints.providers,
              excludeProviders: body.model_constraints.exclude_providers,
              excludeModels: body.model_constraints.exclude_models,
              requireCommercialUse: body.model_constraints.require_commercial_use,
              maxLatencyMs: body.model_constraints.max_latency_ms,
              maxCostPerKOut: body.model_constraints.max_cost_per_k_out,
            }
          : undefined,
      },
      { userId: ctx.user.id, traceSelection: true }
    )

    return Response.json({
      ok: true,
      model: selection.model,
      provider: selection.provider,
      name: selection.name,
      score: selection.score,
      confidence: selection.confidence,
      reason: selection.reason,
      alternatives: selection.alternatives.map((a) => ({
        provider: a.provider,
        model: a.model,
        score: a.score,
        reason: a.reason,
      })),
      costEstimate: {
        creditsIn: selection.costEstimate.creditsIn,
        creditsOut: selection.costEstimate.creditsOut,
        creditsTotal: selection.costEstimate.creditsTotal,
        baseTokensIn: selection.costEstimate.baseTokensIn,
        baseTokensOut: selection.costEstimate.baseTokensOut,
      },
      fallbackChain: selection.fallbackChain,
    })
  })
}
