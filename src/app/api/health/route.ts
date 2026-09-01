import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { handleRoute } from "@/lib/api"
import { getProviderStatuses, APP_NAME } from "@/lib/config"

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
      version: "3.0.0",
      database,
      llmProviders: providers.filter((p) => p.available).map((p) => p.key),
      time: new Date().toISOString(),
    })
  })
}
