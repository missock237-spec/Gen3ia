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
      },
      time: new Date().toISOString(),
    })
  })
}
