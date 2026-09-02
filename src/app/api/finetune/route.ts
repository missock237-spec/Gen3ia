import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { fineTuneManager } from "@/lib/learning/finetune"

const createSchema = z.object({
  name: z.string().min(1).max(100),
  engine: z.enum(["unsloth", "axolotl"]).default("unsloth"),
  baseModel: z.string().optional(),
})

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, createSchema)
    const jobId = await fineTuneManager.createJob(user.id, body.name, {
      engine: body.engine,
      baseModel: body.baseModel,
    })
    // Démarrer le job asynchrone
    await fineTuneManager.startJob(jobId)
    return Response.json({ ok: true, jobId })
  })
}

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const jobs = await fineTuneManager.getJobStatus("all", user.id)
    return Response.json({ ok: true, jobs })
  })
}
