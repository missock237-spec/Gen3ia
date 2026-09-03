import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"

const prioritySchema = z.object({
  cost: z.number().min(0).max(1).default(0.33),
  speed: z.number().min(0).max(1).default(0.33),
  accuracy: z.number().min(0).max(1).default(0.34),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id: taskId } = await params
    const body = await readJson(req, prioritySchema)

    await db.taskPriority.upsert({
      where: { taskId },
      create: { taskId, ...body },
      update: { ...body },
    })

    return Response.json({ ok: true, taskId, priorities: body })
  })
}
