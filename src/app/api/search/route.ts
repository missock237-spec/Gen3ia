// API Search V2 - Recherche globale amelioree
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
    switch (scope) {
      case 'search': {
        if (!q || q.length < 2) return NextResponse.json({ success: true, results: [] });
        const typesParam = url.searchParams.get('types');
        const sortBy = url.searchParams.get('sort') || 'relevance';
        const limit = Math.min(50, parseInt(url.searchParams.get('limit') || '20'));
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const results = await searchEngine.search(q, auth.userId, { types: typesParam ? typesParam.split(',') : undefined, limit, offset, sortBy: sortBy as any });
        return NextResponse.json({ success: true, results, total: results.length, query: q, limit, offset });
      }
      case 'suggest': {
        if (!q || q.length < 1) return NextResponse.json({ success: true, suggestions: [] });
        const suggestions = await searchEngine.suggest(q, auth.userId);
        return NextResponse.json({ success: true, suggestions, query: q });
      }
      case 'counts': { const counts = await searchEngine.getSearchCounts(auth.userId); return NextResponse.json({ success: true, counts }); }
      default: return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}