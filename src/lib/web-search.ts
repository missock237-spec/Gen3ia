/**
 * Web Search — Recherche web via SerpAPI
 * Permet aux agents AI de faire des recherches en temps réel
 * Utilise SerpAPI (100 recherches/mois gratuites)
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('web-search');

// ============================================================
// Types
// ============================================================

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  source?: string;
  date?: string;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  totalResults: number;
  searchTime: number;
  source: 'serpapi' | 'fallback';
}

export interface WebSearchOptions {
  maxResults?: number;
  language?: string;
  country?: string;
  safeSearch?: boolean;
}

// ============================================================
// SerpAPI Search
// ============================================================

const SERPAPI_BASE_URL = 'https://serpapi.com/search';

/**
 * Recherche web via SerpAPI
 */
async function searchWithSerpAPI(
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResponse> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_API_KEY non configurée. Obtenez une clé sur https://serpapi.com');
  }

  const startTime = Date.now();
  const maxResults = options.maxResults || 10;

  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    num: String(Math.min(maxResults, 20)),
    engine: 'google',
    google_domain: 'google.com',
    ...(options.language ? { hl: options.language } : {}),
    ...(options.country ? { gl: options.country } : {}),
    ...(options.safeSearch !== false ? { safe: 'active' } : {}),
  });

  const response = await fetch(`${SERPAPI_BASE_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Erreur inconnue');
    throw new Error(`SerpAPI error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const searchTime = Date.now() - startTime;

  // Vérifier les erreurs SerpAPI
  if (data.error) {
    throw new Error(`SerpAPI: ${data.error}`);
  }

  // Extraire les résultats
  const organic = data.organic_results || [];
  const results: WebSearchResult[] = organic.slice(0, maxResults).map((r: {
    title?: string;
    link?: string;
    snippet?: string;
    position?: number;
    source?: string;
    date?: string;
  }, index: number) => ({
    title: r.title || 'Sans titre',
    link: r.link || '#',
    snippet: r.snippet || '',
    position: r.position || index + 1,
    source: r.source,
    date: r.date,
  }));

  log.info('Recherche web effectuée', {
    query,
    resultsCount: results.length,
    searchTimeMs: searchTime,
    totalResults: data.search_information?.total_results || 0,
  });

  return {
    query,
    results,
    totalResults: data.search_information?.total_results || results.length,
    searchTime,
    source: 'serpapi',
  };
}

/**
 * Fallback: recherche via DuckDuckGo (gratuit, sans clé API)
 * Utilisé si SerpAPI n'est pas configuré
 */
async function searchFallback(query: string, maxResults: number = 10): Promise<WebSearchResponse> {
  const startTime = Date.now();

  try {
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GenovaAI/1.0)',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo error: ${response.status}`);
    }

    const html = await response.text();

    // Extraction simple des résultats depuis le HTML
    const results: WebSearchResult[] = [];
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let position = 0;

    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      position++;
      results.push({
        title: match[2].replace(/<[^>]*>/g, '').trim(),
        link: match[1],
        snippet: match[3].replace(/<[^>]*>/g, '').trim(),
        position,
      });
    }

    return {
      query,
      results,
      totalResults: results.length,
      searchTime: Date.now() - startTime,
      source: 'fallback',
    };
  } catch (err) {
    log.error('Fallback search failed', { error: err instanceof Error ? err.message : String(err) });
    return {
      query,
      results: [],
      totalResults: 0,
      searchTime: Date.now() - startTime,
      source: 'fallback',
    };
  }
}

// ============================================================
// API publique
// ============================================================

/**
 * Effectue une recherche web.
 * Utilise SerpAPI si configuré, sinon fallback DuckDuckGo.
 */
export async function searchWeb(
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResponse> {
  if (!query || query.trim().length === 0) {
    return {
      query,
      results: [],
      totalResults: 0,
      searchTime: 0,
      source: 'fallback',
    };
  }

  // Essayer SerpAPI d'abord
  if (process.env.SERPAPI_API_KEY) {
    try {
      return await searchWithSerpAPI(query, options);
    } catch (err) {
      log.warn('SerpAPI a échoué, fallback DuckDuckGo', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback
    }
  }

  // Fallback DuckDuckGo (gratuit)
  return await searchFallback(query, options.maxResults);
}

/**
 * Formate les résultats de recherche pour les agents AI
 */
export function formatSearchResultsForAgent(response: WebSearchResponse): string {
  if (response.results.length === 0) {
    return 'Aucun résultat trouvé.';
  }

  const header = `Résultats de recherche pour "${response.query}" (${response.source}, ${response.searchTime}ms):\n\n`;
  const body = response.results
    .map((r, i) => {
      return `[${i + 1}] ${r.title}\n   URL: ${r.link}\n   Extrait: ${r.snippet}\n`;
    })
    .join('\n');

  return header + body;
}

/**
 * Format court pour les réponses AI (concis)
 */
export function formatSearchResultsShort(response: WebSearchResponse): string {
  if (response.results.length === 0) {
    return 'Aucun résultat.';
  }

  return response.results
    .slice(0, 5)
    .map((r) => `- ${r.title}: ${r.snippet.substring(0, 150)}`)
    .join('\n');
}
