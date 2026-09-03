import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { getProviderStatuses, APP_NAME } from "@/lib/config"
import { listApps, appAvailability } from "@/lib/connectors/apps"
import { catalogStats } from "@/lib/connectors/catalog"
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
      },
      time: new Date().toISOString(),
    })
  })
}
