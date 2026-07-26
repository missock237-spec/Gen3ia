import { NextRequest, NextResponse } from 'next/server';
import { searchWeb, searchImages, searchNews, SearchType } from '@/lib/search/web-search';
import { searchWithAISummary } from '@/lib/search/search-ai';
import { createLogger } from '@/lib/logger';
const log = createLogger('api-search');
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const type = (searchParams.get('type') as SearchType) || SearchType.WEB;
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const summarize = searchParams.get('summarize') === 'true';
    if (!q) return NextResponse.json({ success: false, error: 'Parametre q requis' }, { status: 400 });
    log.info('Search API request', { query: q.slice(0, 50), type, limit, summarize });
    if (summarize) {
      const result = await searchWithAISummary(q, limit);
      return NextResponse.json({ success: true, data: result });
    }
    if (type === SearchType.IMAGES) {
      const result = await searchImages(q, { limit });
      return NextResponse.json({ success: true, data: result });
    }
    if (type === SearchType.NEWS) {
      const result = await searchNews(q, { limit });
      return NextResponse.json({ success: true, data: result });
    }
    const result = await searchWeb(q, { type, limit });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    log.error('Search API error', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 });
  }
}