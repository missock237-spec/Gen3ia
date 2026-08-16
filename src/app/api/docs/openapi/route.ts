// ============================================================
// GET /api/docs/openapi — Spécification OpenAPI 3.1
// Générée automatiquement depuis les schémas Zod
// ============================================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Importer le registre et les routes (chargement différé)
    const { openApiRegistry } = await import('@/lib/openapi/openapi-registry');
    await import('@/lib/openapi/routes');

    const spec = openApiRegistry.generateSpec();

    return NextResponse.json(spec, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erreur de génération de la documentation', details: message },
      { status: 500 }
    );
  }
}
