/**
 * Web Search API — Recherche web en temps réel
 *
 * GET  /api/web-search?q=query → Recherche web
 * POST /api/web-search          → Recherche avec options avancées
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { searchWeb, formatSearchResultsForAgent, formatSearchResultsShort } from '@/lib/web-search';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * GET /api/web-search?q=ma+requete&maxResults=5&format=short
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 }, // 30 req/min
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), request);

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const maxResults = parseInt(searchParams.get('maxResults') || '10', 10);
    const format = searchParams.get('format') || 'full'; // full | short | raw
    const language = searchParams.get('language') || 'fr';
    const country = searchParams.get('country') || 'fr';

    if (!query.trim()) {
      return secureResponse(
        NextResponse.json({ error: 'Paramètre "q" requis' }, { status: 400 }),
        request
      );
    }

    const results = await searchWeb(query, { maxResults, language, country });

    // Formater selon le format demandé
    if (format === 'short') {
      return secureResponse(
        NextResponse.json({
          query: results.query,
          formatted: formatSearchResultsShort(results),
          resultCount: results.results.length,
          source: results.source,
        }),
        request
      );
    }

    if (format === 'agent') {
      return secureResponse(
        NextResponse.json({
          query: results.query,
          formatted: formatSearchResultsForAgent(results),
          resultCount: results.results.length,
          source: results.source,
        }),
        request
      );
    }

    // Format complet (par défaut)
    return secureResponse(NextResponse.json(results), request);
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Erreur recherche', details: err instanceof Error ? err.message : 'Erreur inconnue' },
        { status: 500 }
      ),
      request
    );
  }
}

/**
 * POST /api/web-search avec plus d'options
 */
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { query, maxResults, language, country, safeSearch, format } = body;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return secureResponse(
        NextResponse.json({ error: 'Le champ "query" est requis' }, { status: 400 }),
        request
      );
    }

    const results = await searchWeb(query, {
      maxResults: maxResults || 10,
      language: language || 'fr',
      country: country || 'fr',
      safeSearch: safeSearch !== false,
    });

    // Préparer la réponse
    const response: Record<string, unknown> = {
      query: results.query,
      results: results.results,
      totalResults: results.totalResults,
      searchTimeMs: results.searchTime,
      source: results.source,
    };

    // Ajouter le formatage pour les agents si demandé
    if (format === 'agent') {
      response.formatted = formatSearchResultsForAgent(results);
    } else if (format === 'short') {
      response.formatted = formatSearchResultsShort(results);
    }

    return secureResponse(NextResponse.json(response), request);
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Erreur recherche', details: err instanceof Error ? err.message : 'Erreur inconnue' },
        { status: 500 }
      ),
      request
    );
  }
}
