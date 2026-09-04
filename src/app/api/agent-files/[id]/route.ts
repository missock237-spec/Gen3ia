import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import {
  getAgentFile,
  saveAgentFile,
  decideAgentFile,
  deleteAgentFile,
  getVersionContent,
} from "@/lib/engines/agent-files"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/agent-files/[id]?version=N — détail d'un fichier agent :
 * contenu courant + historique des versions. version=N renvoie le
 * contenu de cette version précise (comparaison/rollback).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const url = new URL(req.url)
    const versionParam = url.searchParams.get("version")
    if (versionParam) {
      const version = Number(versionParam)
      if (!Number.isInteger(version) || version < 1) {
        throw new ApiError(400, "Numéro de version invalide.")
      }
      const v = await getVersionContent(user.id, id, version)
      if (!v) throw new ApiError(404, "Version introuvable.")
      return jsonOk({ version: v })
    }
    const file = await getAgentFile(user.id, id)
    if (!file) throw new ApiError(404, "Fichier introuvable.")
    return jsonOk({ file })
  })
}

const patchSchema = z
  .object({
    content: z.string().max(512 * 1024).optional(),
    language: z.string().max(30).optional(),
    description: z.string().max(500).optional(),
    decision: z.enum(["APPROVE", "REJECT"]).optional(),
  })
  .refine((b) => b.content !== undefined || b.decision !== undefined || b.language !== undefined || b.description !== undefined, {
    message: "Rien à mettre à jour (content, language, description ou decision requis).",
  })

/**
 * PATCH /api/agent-files/[id] — MODIFIER (nouvelle version source=HUMAN)
 * ou DÉCIDER (APPROVE / REJECT) : le cœur du visualiseur de code pour
 * les vibe codeurs.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const body = await readJson(req, patchSchema)

    if (body.decision) {
      const ok = await decideAgentFile(user.id, id, body.decision)
      if (!ok) throw new ApiError(404, "Fichier introuvable.")
      return jsonOk({ id, status: body.decision === "APPROVE" ? "APPROVED" : "REJECTED" })
    }

    const current = await getAgentFile(user.id, id)
    if (!current) throw new ApiError(404, "Fichier introuvable.")

    const saved = await saveAgentFile(
      {
        path: current.path,
        content: body.content ?? current.content,
        language: body.language ?? current.language,
        description: body.description ?? current.description ?? undefined,
        taskId: current.taskId,
        source: "HUMAN",
      },
      user.id
    )
    if (!saved.ok) throw new ApiError(400, saved.error ?? "mise à jour impossible")
    return jsonOk({ ...saved })
  })
}

/** DELETE /api/agent-files/[id] — suppression (fichier + versions). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const { id } = await params
    const ok = await deleteAgentFile(user.id, id)
    if (!ok) throw new ApiError(404, "Fichier introuvable.")
    return jsonOk({ id, deleted: true })
  })
}
