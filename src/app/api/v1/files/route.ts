import { NextRequest } from "next/server"
import { z } from "zod"
import { handleRoute, readJson } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { hfStorage } from "@/lib/hf/storage"
import { isHfConfigured } from "@/lib/hf/client"

const uploadSchema = z.object({
  path: z.string().min(1).max(500),
  content_base64: z.string().min(1).max(12_000_000), // ~9 Mo encodé
  content_type: z.string().max(100).optional(),
  bucket: z.enum([
    "models", "datasets", "users", "agents", "knowledge",
    "embeddings", "generated", "checkpoints", "artifacts", "logs", "temporary",
  ]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * API unifiée v1 — POST /api/v1/files
 * Dépose un fichier dans le Storage Bucket Hugging Face (octets chez HF,
 * métadonnées dans PostgreSQL — jamais l'inverse).
 */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    if (!isHfConfigured()) {
      return Response.json(
        { ok: false, error: "Stockage Hugging Face non configuré (HF_TOKEN absent).", code: "HF_NOT_CONFIGURED" },
        { status: 503 }
      )
    }

    const body = await readJson(req, uploadSchema)
    const bytes = Buffer.from(body.content_base64, "base64")

    const uploaded = await hfStorage.upload(ctx.user.id, body.path, new Uint8Array(bytes), {
      contentType: body.content_type,
      bucket: body.bucket,
      metadata: body.metadata,
    })

    return Response.json({
      ok: true,
      bucket: uploaded.bucket,
      path: uploaded.path,
      repoId: uploaded.repoId,
      size: uploaded.size,
      sha: uploaded.sha,
      url: uploaded.url,
    })
  })
}

/** GET /api/v1/files?bucket=knowledge&folder=reports — liste les objets. */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const url = new URL(req.url)
    const bucket = url.searchParams.get("bucket") ?? "knowledge"
    const folder = url.searchParams.get("folder") ?? undefined

    const objects = await hfStorage.list(ctx.user.id, bucket, { folder })
    return Response.json({
      ok: true,
      bucket,
      count: objects.length,
      objects,
    })
  })
}

const deleteSchema = z.object({ path: z.string().min(1).max(500) })

/** DELETE /api/v1/files — supprime un objet (soft-delete + delete HF). */
export async function DELETE(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const body = await readJson(req, deleteSchema)
    const bucket = new URL(req.url).searchParams.get("bucket") ?? undefined
    await hfStorage.remove(ctx.user.id, body.path, bucket)
    return Response.json({ ok: true, removed: body.path })
  })
}
