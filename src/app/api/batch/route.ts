import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"
import { createBatch, executeBatch } from "@/lib/tasks/batch"

const batchSchema = z.object({
  prompts: z.array(z.string().min(1).max(8000)).min(1).max(50),
  name: z.string().optional(),
  autoExecute: z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, batchSchema)
    const batchId = await createBatch(user.id, body.prompts, body.name)
    if (body.autoExecute) {
      const result = await executeBatch(batchId, user.id)
      return Response.json({ ok: true, batchId, result })
    }
    return Response.json({ ok: true, batchId })
  })
}

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const batches = await db.batchTask.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        items: {
          select: { id: true, status: true, taskId: true },
        },
      },
    })
    return Response.json({
      ok: true,
      batches: batches.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.status,
        total: b.items.length,
        completed: b.items.filter((i) => i.status === "COMPLETED").length,
        failed: b.items.filter((i) => i.status === "FAILED").length,
        createdAt: b.createdAt,
      })),
    })
  })
}
