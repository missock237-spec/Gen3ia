import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"
import { WORKFLOW_CATALOG, findWorkflow } from "@/lib/workflows/catalog"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/workflows — bibliothèque de workflows (catalogue + épingles).
 *
 * Captures v4.1 : modèles catégorisés avec épinglage par utilisateur.
 */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const pins = await db.workflowPin.findMany({
      where: { userId: user.id },
      select: { workflowKey: true },
      orderBy: { createdAt: "desc" },
    })
    return jsonOk({
      workflows: WORKFLOW_CATALOG,
      pinned: pins.map((p) => p.workflowKey),
    })
  })
}

const pinSchema = z.object({
  workflowKey: z.string().min(1).max(64),
  pinned: z.boolean(),
})

/** POST /api/workflows — épingle ou désépingle un workflow. */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const body = await readJson(req, pinSchema)
    if (!findWorkflow(body.workflowKey)) {
      throw new ApiError(404, "Workflow inconnu.", "NOT_FOUND")
    }

    if (body.pinned) {
      await db.workflowPin.upsert({
        where: { userId_workflowKey: { userId: user.id, workflowKey: body.workflowKey } },
        create: { userId: user.id, workflowKey: body.workflowKey },
        update: {},
      })
    } else {
      await db.workflowPin.deleteMany({
        where: { userId: user.id, workflowKey: body.workflowKey },
      })
    }
    return jsonOk({ workflowKey: body.workflowKey, pinned: body.pinned })
  })
}
