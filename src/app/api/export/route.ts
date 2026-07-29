// API Export de donnees
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { exportEngine } from '@/lib/export-engine';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'stats';
    switch (scope) {
      case 'stats': { const stats = await exportEngine.getAccountStats(auth.userId); return NextResponse.json({ success: true, stats }); }
      case 'export': { const entity = (url.searchParams.get('entity') || 'all') as any; const format = (url.searchParams.get('format') || 'json') as any; const result = await exportEngine.exportEntity(auth.userId, entity, format); return NextResponse.json({ success: true, ...result }); }
      case 'download': { const entity = (url.searchParams.get('entity') || 'all') as any; const format = (url.searchParams.get('format') || 'json') as any; const result = await exportEngine.exportEntity(auth.userId, entity, format); if (format === 'csv') { const rows: any[] = []; for (const [key, items] of Object.entries(result.data)) { if (Array.isArray(items)) rows.push(...items.map((item: any) => ({ _type: key, ...item }))); } const csv = exportEngine.toCSV(rows); return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename=gen3ia-export.csv' } }); } return NextResponse.json(result.data, { headers: { 'Content-Disposition': 'attachment; filename=gen3ia-export.json' } }); }
      default: return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}