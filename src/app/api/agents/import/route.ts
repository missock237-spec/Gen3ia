import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { agentImporter } from "@/lib/agents/import-export"

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, z.any())
    const agentId = await agentImporter.importAgent(user.id, body)
    return Response.json({ ok: true, agentId })
  })
}
