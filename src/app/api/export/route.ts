// ============================================================
// GET /api/export — Exporter les données utilisateur
// ============================================================
//  Query: ?format=json|csv&collections=agents,conversations,credits
//  Headers: Cookie gen3ia_session (authentification)
//  Response: fichier téléchargeable
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { exportUserData, type ExportCollection, type ExportFormat } from '@/lib/data-export';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(req: NextRequest): Promise<NextResponse> {
  try {
    // Extraire l'userId de la session
    const sessionCookie = req.cookies.get('gen3ia_session')?.value;
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = JSON.parse(Buffer.from(sessionCookie, 'base64url').toString());
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
    }

    // Paramètres
    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'json') as ExportFormat;
    const collectionsParam = url.searchParams.get('collections') || 'agents,conversations,creditTransactions,executions,profile';

    const validCollections: ExportCollection[] = ['agents', 'conversations', 'creditTransactions', 'executions', 'workflows', 'apiKeys', 'notifications', 'profile'];
    const requestedCollections = collectionsParam.split(',')
      .filter(c => validCollections.includes(c as ExportCollection)) as ExportCollection[];

    if (!requestedCollections.length) {
      return NextResponse.json({ error: 'Collections invalides' }, { status: 400 });
    }

    // Lancer l'export
    const result = await exportUserData({
      userId,
      format,
      collections: requestedCollections,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Retourner comme fichier téléchargeable
    const contentType = format === 'json' ? 'application/json' : 'text/csv';
    const response = new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Export-Collections': result.collections.join(','),
        'X-Export-Records': String(result.totalRecords),
      },
    });

    return response;
  } catch (error) {
    console.error('[export] error:', error);
    return NextResponse.json({ error: "Erreur lors de l'export" }, { status: 500 });
  }
}

export const GET = withRateLimit(handler, RATE_LIMIT_PRESETS.export);
