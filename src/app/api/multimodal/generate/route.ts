import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { chargeCredits } from "@/lib/credits/ledger"
import { generateMultimodalContent } from "@/lib/ai/multimodal"

const generateSchema = z.object({
  prompt: z.string().min(2).max(1000),
  type: z.enum(["image", "diagram", "chart"]).default("image"),
  style: z.string().max(100).optional(),
  width: z.number().min(200).max(2000).optional(),
  height: z.number().min(200).max(2000).optional(),
  taskId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  return handleRoute(
    req,
    async () => {
      const user = await requireUser(req)
      const body = await readJson(req, generateSchema)

      // Prélèvement de crédits symbolique pour la génération multimodale
      const creditCost = body.type === "image" ? 0.05 : 0.02
      await chargeCredits(user.id, creditCost, {
        type: "TASK_EXECUTION",
        description: `Génération multimodale (${body.type}) : ${body.prompt.slice(0, 50)}`,
        refType: body.taskId ? "task" : undefined,
        refId: body.taskId,
      })

      const media = await generateMultimodalContent({
        prompt: body.prompt,
        type: body.type,
        style: body.style,
        width: body.width,
        height: body.height,
      })

      return Response.json({
        ok: true,
        media,
      })
    },
    { rateLimit: { policy: "user", identify: "userId" } }
  )
}
