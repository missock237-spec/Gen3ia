import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { getProviderStatuses, APP_NAME } from "@/lib/config"
import { listApps, appAvailability } from "@/lib/connectors/apps"
import { catalogStats } from "@/lib/connectors/catalog"
import { isHfConfigured } from "@/lib/hf/client"
import { activeBackend } from "@/lib/rag/backends/types"
import pkg from "../../../../package.json"

/** Health check — état base de données + fournisseurs IA configurés. */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    let database = "ok"
    try {
      await db.$queryRaw`SELECT 1`
    } catch {
      database = "unavailable"
    }
    const providers = getProviderStatuses()
    // Connecteurs : nombre d'apps connectables (moteur local — ADR-0014).
    const connectableApps = listApps().filter((a) => appAvailability(a).connectable).length
    const catalog = catalogStats()
    let registryCount: number | null = null
    try {
      registryCount = await db.aIModel.count()
    } catch {
      registryCount = null
    }
    return Response.json({
      ok: true,
      app: APP_NAME,
      version: pkg.version,
      database,
      llmProviders: providers.filter((p) => p.available).map((p) => p.key),
      connectors: `local:${connectableApps}/${listApps().length}`,
      catalog: `${catalog.apps} apps / ${catalog.tools} outils`,
      features: {
        oauthLogin: !!(process.env.AUTH_GITHUB_CLIENT_ID || process.env.AUTH_GOOGLE_CLIENT_ID),
        live: true,
        catalog: true,
        /** v3.5 */
        liveCopilot: true,
        i18n: true,
        ads: true,
        creditsSale: { min: 50 },
        /** v3.6 — entreprise (7 piliers) */
        subscriptions: true,
        marketplace: { commission: 0.2 },
        paymentProcessor: "chariow", // UNIQUE processeur (ADR-0007)
        workerIsolation: true,
        keyringRotation: true,
        ragTuning: true,
        debateEngine: true,
        metaLearning: true,
        openapi: "/api/v1/openapi",
        sdkTypes: true,
        otel: !!(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
        queue: process.env.REDIS_URL ? "bullmq" : "in-memory",
        /** v4.0 — Model & Compute Intelligence Layer (Hugging Face) */
        huggingFace: {
          inferenceProviders: isHfConfigured(),
          inferenceEndpoints: isHfConfigured(),
          jobs: isHfConfigured() || !!process.env.REDIS_URL,
          storageBuckets: isHfConfigured(),
        },
        modelRegistry: { models: registryCount, learning: true },
        modelRouter: { intelligent: true, performanceRegistry: true },
        multiModelPlans: true,
        vectorStore: activeBackend(),
        unifiedApi: ["/api/v1/chat", "/api/v1/models", "/api/v1/models/select", "/api/v1/embeddings", "/api/v1/files", "/api/v1/knowledge", "/api/v1/jobs"],
        /** v4.1 — mise à jour entreprise (terminal agents, code viewer, saisie enrichie, workflows, vocal, plan 5000) */
        agentTerminal: { execution: "agents-only", humanView: "read-only" },
        codeViewer: { hitl: true, versions: true },
        chatComposer: { voice: true, attachments: "all-types", connectors: true, modelSelector: true },
        workflows: { catalog: true, pins: true },
        voiceMode: { personas: 5, dictation: true, asr: true },
        toolsPage: "settings#tools",
        billingPlans: { tiers: [2000, 5000, 10000, 50000], processor: "chariow" },
      },
      time: new Date().toISOString(),
    })
  })
}
