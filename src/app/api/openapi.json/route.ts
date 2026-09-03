import { NextRequest } from "next/server"
import { buildOpenApiDocument } from "@/lib/sdk/openapi"

/**
 * GET /api/openapi.json — spécification OpenAPI 3.1 de l'API publique v1.
 * Publique (aucune auth) : consommable par Swagger UI, Postman, insomnia,
 * générateurs de clients (openapi-generator), CI de contrat.
 */
export async function GET(req: NextRequest) {
  const doc = buildOpenApiDocument()
  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      "Content-Type": "application/json",
      // Utilisable depuis n'importe quel outil externe (Swagger Editor en ligne…).
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  })
}

export const dynamic = "force-static"
