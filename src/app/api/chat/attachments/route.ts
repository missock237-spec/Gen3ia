import { NextRequest } from "next/server"
import { handleRoute, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { saveAttachment, listAttachments, deleteAttachment } from "@/lib/engines/chat-attachments"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/chat/attachments — import multimédia réel.
 * multipart/form-data : file (tous types), taskId? (liaison tâche).
 *
 * - DOCUMENT : texte extrait (pdf-parse) + indexé knowledge (RAG) ;
 * - AUDIO : transcription ASR réelle + historique de dictée ;
 * - IMAGE/VIDÉO/autres : HF Bucket si HF_TOKEN, sinon base64 (≤ 2 Mo).
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const form = await req.formData().catch(() => null)
    if (!form) throw new ApiError(400, "Requête multipart/form-data attendue.")

    const file = form.get("file")
    if (!(file instanceof File)) throw new ApiError(400, "Champ « file » manquant.")
    if (file.size === 0) throw new ApiError(400, "Fichier vide.")
    if (file.size > 10 * 1024 * 1024) {
      throw new ApiError(413, "Fichier trop volumineux (10 Mo maximum).", "FILE_TOO_LARGE")
    }

    const taskId = typeof form.get("taskId") === "string" ? (form.get("taskId") as string) : null
    const bytes = Buffer.from(await file.arrayBuffer())

    const saved = await saveAttachment(user.id, {
      filename: file.name || "fichier",
      contentType: file.type || "application/octet-stream",
      bytes,
      taskId,
    })
    if (!saved.ok) throw new ApiError(400, saved.error ?? "import impossible")

    return jsonOk({
      attachment: {
        id: saved.id,
        kind: saved.kind,
        filename: saved.filename,
        size: saved.size,
        storage: saved.storage,
        textExtract: saved.textExtract?.slice(0, 400) ?? null,
        dataUrl: saved.dataUrl && saved.storage === "DB" ? saved.dataUrl.slice(0, 100) + "…" : null,
        hasData: saved.storage === "DB" || saved.storage === "HF",
        documentId: saved.documentId,
        dictationId: saved.dictationId,
      },
    })
  })
}

/** GET /api/chat/attachments?taskId=… — pièces jointes de l'utilisateur. */
export async function GET(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const url = new URL(req.url)
    const taskId = url.searchParams.get("taskId")
    const attachments = await listAttachments(user.id, { taskId })
    return jsonOk({ attachments })
  })
}

/** DELETE /api/chat/attachments?id=… */
export async function DELETE(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const id = new URL(req.url).searchParams.get("id")
    if (!id) throw new ApiError(400, "Paramètre id requis.")
    const ok = await deleteAttachment(user.id, id)
    if (!ok) throw new ApiError(404, "Pièce jointe introuvable.")
    return jsonOk({ id, deleted: true })
  })
}
