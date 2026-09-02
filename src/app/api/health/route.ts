import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { getProviderStatuses, APP_NAME } from "@/lib/config"
import { isComposioConfigured } from "@/lib/connectors/composio"
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
    return Response.json({
      ok: true,
      app: APP_NAME,
      version: pkg.version,
      database,
      llmProviders: providers.filter((p) => p.available).map((p) => p.key),
      connectors: isComposioConfigured() ? "composio" : "not-configured",
      time: new Date().toISOString(),
    })
  })
}
