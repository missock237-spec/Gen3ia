import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { writeMemory, recallMemories } from "@/lib/memory/store"

const writeSchema = z.object({
  layer: z.enum(["SHORT_TERM", "LONG_TERM", "TASK", "USER", "AGENT"]),
  content: z.string().min(3).max(2000),
  importance: z.number().min(0).max(1).default(0.5),
  agentId: z.string().max(64).nullable().optional(),
})

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const memories = await db.memory.findMany({
      where: { userId: user.id },
      orderBy: [{ layer: "asc" }, { importance: "desc" }, { createdAt: "desc" }],
      take: 200,
    })
    const layers: Record<string, typeof memories> = {}
    for (const layer of ["SHORT_TERM", "LONG_TERM", "TASK", "USER", "AGENT"]) {
      layers[layer] = memories.filter((m) => m.layer === layer)
    }
    return Response.json({ ok: true, layers })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, writeSchema)
    const memory = await writeMemory({
      userId: user.id,
      layer: body.layer,
      content: body.content,
      importance: body.importance,
      agentId: body.agentId ?? null,
    })
    return Response.json({ ok: true, memory: { id: memory.id, layer: memory.layer, content: memory.content } })
  })
}
