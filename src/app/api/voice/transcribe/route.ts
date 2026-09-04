import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { db } from "@/lib/db"
import { transcribeAudio } from "@/lib/engines/chat-attachments"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/voice/transcribe — transcription ASR réelle.
 * multipart/form-data : file (audio), persist? (enregistrer dans
 * l'historique de dictée, défaut true).
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const form = await req.formData().catch(() => null)
    if (!form) throw new ApiError(400, "Requête multipart/form-data attendue.")
    const file = form.get("file")
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiError(400, "Champ « file » (audio) manquant.")
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new ApiError(413, "Audio trop volumineux (10 Mo maximum).")
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const result = await transcribeAudio(bytes, file.type || "audio/mpeg")
    if (!result.ok) {
      throw new ApiError(503, `Transcription indisponible : ${result.error}`, "ASR_UNAVAILABLE")
    }

    // Historique de dictée (préférence : activé par défaut).
    let dictationId: string | null = null
    const settings = await db.voiceSettings.findFirst({ where: { userId: user.id } })
    const persist = form.get("persist")
    const shouldPersist = persist === "false" ? false : (settings?.dictationsEnabled ?? true)
    if (shouldPersist) {
      const entry = await db.dictationEntry.create({
        data: {
          userId: user.id,
          text: result.text.slice(0, 8000),
          durationMs: 0,
          lang: settings?.language === "auto" ? "auto" : settings?.language ?? "auto",
        },
      })
      dictationId = entry.id
    }

    return jsonOk({ text: result.text, dictationId })
  })
}
