// API Search - Recherche globale
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { searchEngine } from '@/lib/search-engine';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const scope = url.searchParams.get('scope') || 'search';

    if (scope === 'counts') {
      const counts = await searchEngine.getSearchCounts(auth.userId);
      return NextResponse.json({ success: true, counts });
    }

    if (!q || q.length < 2) {
      return NextResponse.json({ success: true, results: [] });
    }

    const typesParam = url.searchParams.get('types');
    const types = typesParam ? typesParam.split(',') : undefined;

    const results = await searchEngine.search(q, auth.userId, { types });
    return NextResponse.json({ success: true, results, total: results.length, query: q });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}