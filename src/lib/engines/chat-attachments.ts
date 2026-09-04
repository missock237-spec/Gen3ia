/**
 * Pièces jointes de chat (v4.1) — imports multimédiaux réels.
 *
 * Fichiers de tout type depuis la barre de saisie enrichie :
 * - DOCUMENTS (pdf, txt, md, csv, json, code…) : texte extrait
 *   (pdf-parse côté serveur), indexé dans la base de connaissances
 *   (RAG) → les agents y accèdent via knowledge_search ;
 * - AUDIO : transcription ASR réelle (z-ai-web-dev-sdk) → texte
 *   réinséré dans le prompt + historique de dictée ;
 * - IMAGES / VIDÉOS : bucket Hugging Face si HF_TOKEN configuré,
 *   sinon stockage base64 en base (≤ 2 Mo) avec data URL.
 *
 * Aucun mock : chaque voie a une implémentation réelle et des
 * limites explicites documentées.
 */

import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { chunkText } from "@/lib/rag/retriever"
import { indexDocument } from "@/lib/rag/vector-store"
import { isHfConfigured } from "@/lib/hf/client"
import { hfStorage } from "@/lib/hf/storage"

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 Mo (import)
const MAX_DB_INLINE_BYTES = 2 * 1024 * 1024 // 2 Mo (stockage base64)
const MAX_TEXT_EXTRACT_CHARS = 200_000

export type AttachmentKind = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "FILE"

const MIME_KINDS: Record<string, AttachmentKind> = {
  "image/": "IMAGE",
  "video/": "VIDEO",
  "audio/": "AUDIO",
  "text/": "DOCUMENT",
  "application/pdf": "DOCUMENT",
  "application/json": "DOCUMENT",
  "application/xml": "DOCUMENT",
  "application/msword": "DOCUMENT",
  "application/vnd.openxmlformats-officedocument": "DOCUMENT",
  "application/octet-stream": "FILE",
}

export function kindForMime(contentType: string, filename: string): AttachmentKind {
  const ct = (contentType ?? "").toLowerCase()
  for (const [prefix, kind] of Object.entries(MIME_KINDS)) {
    if (ct.startsWith(prefix)) return kind
  }
  // Extension de repli.
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"].includes(ext)) return "IMAGE"
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "VIDEO"
  if (["mp3", "wav", "ogg", "m4a", "flac", "aac", "opus", "webm"].includes(ext)) return "AUDIO"
  if (["pdf", "txt", "md", "csv", "json", "html", "xml", "tsv", "log", "yml", "yaml", "ts", "js", "py", "sql"].includes(ext)) return "DOCUMENT"
  return "FILE"
}

// ─────────────────────────────────────────────────────────────
// Extraction de texte
// ─────────────────────────────────────────────────────────────

/** PDF → texte (pdf-parse, import direct pour éviter le mode debug). */
async function extractPdfText(bytes: Buffer): Promise<string> {
  // require dynamique : la lib est CommonJS et ne doit pas entrer dans
  // le bundle client — résolue uniquement côté serveur Node.
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>
  const result = await pdfParse(bytes)
  return result.text ?? ""
}

function isPdf(contentType: string, filename: string): boolean {
  return (
    contentType.toLowerCase().includes("pdf") ||
    filename.toLowerCase().endsWith(".pdf")
  )
}

async function extractText(bytes: Buffer, contentType: string, filename: string): Promise<string> {
  if (isPdf(contentType, filename)) {
    try {
      return await extractPdfText(bytes)
    } catch (err) {
      logger.warn("attachments: extraction PDF impossible", {
        filename,
        error: err instanceof Error ? err.message : String(err),
      })
      return ""
    }
  }
  // Texte brut / code / csv / json / markdown.
  return bytes.toString("utf8")
}

// ─────────────────────────────────────────────────────────────
// Transcription audio (ASR réel)
// ─────────────────────────────────────────────────────────────

export interface TranscriptionResult {
  ok: boolean
  text: string
  error?: string
}

/**
 * Transcrit un fichier audio en texte via l'ASR z-ai-web-dev-sdk.
 * Côté serveur uniquement — le SDK n'est jamais importé côté client.
 */
export async function transcribeAudio(
  bytes: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default
    const zai = await ZAI.create()
    const base64 = bytes.toString("base64")
    const response = await zai.audio.asr.create({
      file_base64: base64,
    })
    const text = (response?.text ?? "").trim()
    if (!text) return { ok: false, text: "", error: "ASR: transcription vide" }
    return { ok: true, text }
  } catch (err) {
    return { ok: false, text: "", error: err instanceof Error ? err.message : String(err) }
  }
}

// ─────────────────────────────────────────────────────────────
// Enregistrement d'une pièce jointe
// ─────────────────────────────────────────────────────────────

export interface SaveAttachmentParams {
  filename: string
  contentType: string
  bytes: Buffer
  taskId?: string | null
}

export interface SavedAttachment {
  ok: boolean
  id: string
  kind: AttachmentKind
  filename: string
  size: number
  storage: "DB" | "HF"
  textExtract: string | null
  dataUrl: string | null
  documentId: string | null
  dictationId: string | null
  error?: string
}

export async function saveAttachment(
  userId: string,
  params: SaveAttachmentParams
): Promise<SavedAttachment> {
  const { filename, contentType, bytes } = params
  const kind = kindForMime(contentType, filename)
  const size = bytes.length

  if (size > MAX_FILE_BYTES) {
    return failure("FICHIER_TROP_VOLUMINEUX", `Fichier > ${MAX_FILE_BYTES / (1024 * 1024)} Mo`)
  }

  // 1. Voie HF Storage (médias et tout fichier) si configurée.
  let storage: "DB" | "HF" = "DB"
  let repoId: string | null = null
  let objectPath: string | null = null
  let sha: string | null = null
  let dataUrl: string | null = null

  if (isHfConfigured()) {
    try {
      const uploaded = await hfStorage.upload(userId, `chat/${Date.now()}-${sanitize(filename)}`, new Uint8Array(bytes), {
        contentType,
        bucket: "users",
        metadata: { kind, filename, taskId: params.taskId ?? null },
      })
      storage = "HF"
      repoId = uploaded.repoId
      objectPath = uploaded.path
      sha = uploaded.sha ?? null
    } catch (err) {
      logger.warn("attachments: upload HF impossible, repli DB", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (storage === "DB" && size <= MAX_DB_INLINE_BYTES) {
    dataUrl = `data:${contentType || "application/octet-stream"};base64,${bytes.toString("base64")}`
  }

  // 2. Texte extrait (documents) / transcription (audio).
  let textExtract: string | null = null
  let documentId: string | null = null
  let dictationId: string | null = null

  if (kind === "DOCUMENT") {
    const text = (await extractText(bytes, contentType, filename)).slice(0, MAX_TEXT_EXTRACT_CHARS)
    if (text.trim().length >= 20) {
      const doc = await indexTextDocument(userId, filename, text)
      documentId = doc?.id ?? null
      textExtract = text.slice(0, 4000) // aperçu conservé sur la pièce
    }
  } else if (kind === "AUDIO") {
    const asr = await transcribeAudio(bytes, contentType || "audio/mpeg")
    if (asr.ok) {
      textExtract = asr.text.slice(0, 4000)
      const entry = await db.dictationEntry.create({
        data: {
          userId,
          text: asr.text.slice(0, 8000),
          durationMs: 0,
          lang: "auto",
        },
      })
      dictationId = entry.id
    } else if (size <= MAX_DB_INLINE_BYTES || storage === "HF") {
      // L'audio reste joint (lisible/téléchargeable) même sans transcription.
      logger.warn("attachments: ASR indisponible", { error: asr.error })
    }
  }

  const row = await db.chatAttachment.create({
    data: {
      userId,
      taskId: params.taskId ?? null,
      kind,
      filename,
      contentType: contentType || "application/octet-stream",
      size,
      storage,
      repoId,
      objectPath,
      sha,
      dataUrl: dataUrl ? dataUrl.slice(0, 2 * 1024 * 1024 + 512) : null,
      textExtract,
      documentId,
      dictationId,
    },
  })

  logger.info("attachments: pièce jointe enregistrée", {
    id: row.id,
    kind,
    storage,
    filename,
    documentId,
    dictationId,
  })

  return {
    ok: true,
    id: row.id,
    kind,
    filename,
    size,
    storage,
    textExtract,
    dataUrl,
    documentId,
    dictationId,
  }

  function failure(code: string, message: string): SavedAttachment {
    return {
      ok: false,
      id: "",
      kind,
      filename,
      size,
      storage: "DB",
      textExtract: null,
      dataUrl: null,
      documentId: null,
      dictationId: null,
      error: `${code} : ${message}`,
    }
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)
}

/** Indexe le texte dans la knowledge base (RAG) de l'utilisateur. */
async function indexTextDocument(userId: string, title: string, content: string) {
  const chunks = chunkText(content)
  if (chunks.length === 0) return null
  try {
    const document = await db.document.create({
      data: {
        userId,
        title: title.slice(0, 150),
        sourceType: "FILE",
        content: content.slice(0, 200_000),
        chunks: JSON.stringify(chunks),
        size: content.length,
      },
    })
    // Indexation vectorielle best-effort (repli lexical garanti).
    await indexDocument(userId, document.id, title, content).catch(() => undefined)
    return document
  } catch (err) {
    logger.warn("attachments: indexation document impossible", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────

export interface AttachmentView {
  id: string
  taskId: string | null
  kind: string
  filename: string
  contentType: string
  size: number
  storage: string
  dataUrl: string | null
  textExtract: string | null
  documentId: string | null
  dictationId: string | null
  createdAt: string
}

export async function listAttachments(
  userId: string,
  opts: { taskId?: string | null; limit?: number } = {}
): Promise<AttachmentView[]> {
  const rows = await db.chatAttachment.findMany({
    where: { userId, ...(opts.taskId ? { taskId: opts.taskId } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
  })
  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    kind: r.kind,
    filename: r.filename,
    contentType: r.contentType,
    size: r.size,
    storage: r.storage,
    // dataUrl renvoyé uniquement pour les pièces stockées en base.
    dataUrl: r.storage === "DB" ? r.dataUrl : null,
    textExtract: r.textExtract ? r.textExtract.slice(0, 400) : null,
    documentId: r.documentId,
    dictationId: r.dictationId,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function deleteAttachment(userId: string, id: string): Promise<boolean> {
  const row = await db.chatAttachment.findFirst({ where: { id, userId } })
  if (!row) return false
  await db.chatAttachment.delete({ where: { id: row.id } })
  return true
}
