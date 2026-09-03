import { NextRequest } from "next/server"
import { handleRoute } from "@/lib/api"
import { authenticateApiKey, checkRateLimit } from "@/lib/auth/apikey"
import { hfStorage } from "@/lib/hf/storage"

/**
 * API unifiée v1 — GET /api/v1/files/download?bucket=&path=
 * Passe-relais AUTHENTIFIÉ des objets Bucket HF : le token HF reste côté
 * serveur (Phase 23 — jamais exposé), l'utilisateur est identifié par sa
 * clé API / session et doit posséder l'objet.
 */
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const ctx = await authenticateApiKey(req)
    checkRateLimit(ctx.apiKey.id)

    const url = new URL(req.url)
    const bucket = url.searchParams.get("bucket") ?? undefined
    const path = url.searchParams.get("path")
    if (!path) {
      return Response.json({ ok: false, error: "Paramètre « path » requis.", code: "BAD_REQUEST" }, { status: 400 })
    }

    // Propriété vérifiée par findObject (userId) — échec explicite sinon.
    const bytes = await hfStorage.download(ctx.user.id, path, bucket)
    const meta = await hfStorage.metadata(ctx.user.id, path, bucket).catch(() => null)

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": meta?.contentType ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${path.split("/").pop() ?? "file"}"`,
        "X-Gen3ia-Bucket": meta?.bucket ?? bucket ?? "auto",
      },
    })
  })
}
