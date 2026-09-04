import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, jsonOk, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const PERSONAS = ["maple", "ember", "sage", "coral", "onyx"] as const
const LANGUAGES = ["auto", "fr", "en"] as const

const putSchema = z.object({
  persona: z.enum(PERSONAS).optional(),
  language: z.enum(LANGUAGES).optional(),
  backgroundConversations: z.boolean().optional(),
  dictationsEnabled: z.boolean().optional(),
})

async function ensureSettings(userId: string) {
  const existing = await db.voiceSettings.findFirst({ where: { userId } })
  if (existing) return existing
  return db.voiceSettings.create({ data: { userId } })
}

/** GET /api/voice/settings — préférences vocales courantes. */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const settings = await ensureSettings(user.id)
    return jsonOk({
      settings: {
        persona: settings.persona,
        language: settings.language,
        backgroundConversations: settings.backgroundConversations,
        dictationsEnabled: settings.dictationsEnabled,
        personas: PERSONAS,
        languages: LANGUAGES,
      },
    })
  })
}

/** PUT /api/voice/settings — mise à jour des préférences vocales. */
export async function PUT(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const body = await readJson(req, putSchema)
    await ensureSettings(user.id)
    const updated = await db.voiceSettings.update({
      where: { userId: user.id },
      data: body,
    })
    return jsonOk({
      settings: {
        persona: updated.persona,
        language: updated.language,
        backgroundConversations: updated.backgroundConversations,
        dictationsEnabled: updated.dictationsEnabled,
      },
    })
  })
}
