import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { BUILT_IN_SKILLS } from "@/lib/skills/builtins"

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().min(10).max(400),
  category: z.string().max(40).default("GENERAL"),
  instructions: z.string().max(4000).optional(),
  tools: z.array(z.string()).max(8).default([]),
  isPublic: z.boolean().default(false),
})

/** Compétences intégrées + compétences personnalisées de l'utilisateur. */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const custom = await db.skill.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    })
    return Response.json({
      ok: true,
      builtIn: BUILT_IN_SKILLS,
      custom,
    })
  })
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, createSchema)

    const key = `skill-${body.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30)}`

    const exists = await db.skill.findUnique({ where: { key } })
    if (exists) throw new ApiError(409, "Une compétence porte déjà ce nom.", "KEY_TAKEN")

    const skill = await db.skill.create({
      data: {
        userId: user.id,
        key,
        name: body.name.trim(),
        description: body.description.trim(),
        category: body.category,
        definition: JSON.stringify({ instructions: body.instructions ?? "", tools: body.tools }),
        isPublic: body.isPublic,
      },
    })
    return Response.json({ ok: true, skill })
  })
}
