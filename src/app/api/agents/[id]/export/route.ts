import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { agentExporter } from "@/lib/agents/import-export"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id: agentId } = await params
    const json = await agentExporter.exportAgentJSON(agentId)
    return Response.json({ ok: true, export: JSON.parse(json) })
  })
}
