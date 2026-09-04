import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import {
  listAgentFiles,
  saveAgentFile,
  agentFilesStats,
} from "@/lib/engines/agent-files"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/agent-files?taskId=…&search=…&stats=1
 * Espace de fichiers des agents (visualiseur de code) — liste et
 * statistiques. Les fichiers sont générés par les agents (write_file)
 * et modifiables par l'utilisateur (voir /decider/modifier).
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const url = new URL(req.url)
    if (url.searchParams.get("stats") === "1") {
      return jsonOk({ stats: await agentFilesStats(user.id) })
    }
    const files = await listAgentFiles(user.id, {
      taskId: url.searchParams.get("taskId") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    })
    return jsonOk({ files })
  })
}

const createSchema = z.object({
  path: z.string().min(1).max(200),
  content: z.string().max(512 * 1024),
  language: z.string().max(30).optional(),
  description: z.string().max(500).optional(),
  taskId: z.string().nullable().optional(),
  source: z.enum(["HUMAN"]).optional(), // côté utilisateur : source HUMAN uniquement
})

/**
 * POST /api/agent-files — création/édition humaine d'un fichier.
 * Chaque écriture crée une nouvelle version (source=HUMAN) ; les
 * agents passent par l'outil write_file (source=AGENT).
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const body = await readJson(req, createSchema)
    const saved = await saveAgentFile(
      {
        path: body.path,
        content: body.content,
        language: body.language,
        description: body.description,
        taskId: body.taskId ?? null,
        source: "HUMAN",
      },
      user.id
    )
    if (!saved.ok) throw new ApiError(400, saved.error ?? "écriture impossible")
    return jsonOk({ ...saved })
  })
}
