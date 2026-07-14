/**
 * Web Search — Moteur de recherche web via SerpAPI
 * Permet aux agents AI de chercher des informations en temps réel
 * Utilise SerpAPI (Google Search) avec fallback automatique
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('web-search');

// ============================================================
// Types
// ============================================================

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  source: string;
}

export interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
  query: string;
  provider: string;
}

export interface SearchOptions {
  num?: number;
  lang?: string;
  country?: string;
  safe?: boolean;
}

// ============================================================
// SerpAPI Client
// ============================================================

/**
 * Effectue une recherche web via SerpAPI
 * Nécessite SERPAPI_API_KEY dans .env
 * Gratuit : 100 recherches/mois
 */
export async function searchWeb(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const {
    num = 10,
    lang = 'lang_fr|lang_en',
    country = 'fr',
    safe = true,
  } = options;

  const startTime = Date.now();
  const apiKey = process.env.SERPAPI_API_KEY;

  if (!apiKey) {
    log.warn('SERPAPI_API_KEY non configurée, utilisation du fallback');
    return searchFallback(query, options);
  }

  try {
    const params = new URLSearchParams({
      q: query,
      api_key: apiKey,
      num: String(Math.min(num, 20)),
      hl: lang.replace('lang_', '').split('|')[0] || 'fr',
      gl: country.toUpperCase(),
      safe: safe ? 'active' : 'off',
      engine: 'google',
      google_domain: 'google.com',
      output: 'json',
    });

    const response = await fetch(
      `https://serpapi.com/search?${params.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`SerpAPI error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const organic = data.organic_results || [];

    const results: SearchResult[] = organic.map((r: {
      title?: string;
      link?: string;
      snippet?: string;
      position?: number;
    }, i: number) => ({
      title: r.title || 'Sans titre',
      link: r.link || '',
      snippet: r.snippet || '',
      position: r.position ?? i + 1,
      source: 'serpapi',
    }));

    const searchTime = Date.now() - startTime;

    log.info('Recherche SerpAPI effectuée', {
      query: query.substring(0, 50),
      results: results.length,
      timeMs: searchTime,
    });

    return {
      results,
      totalResults: data.search_information?.total_results || results.length,
      searchTime,
      query,
      provider: 'serpapi',
    };
  } catch (err) {
    log.error('SerpAPI a échoué, fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return searchFallback(query, options);
  }
}

/**
 * Effectue une recherche web avec contexte pour un agent AI
 * Retourne un texte formaté prêt à être injecté dans le prompt
 */
export async function searchWebForAgent(
  query: string,
  options: SearchOptions = {}
): Promise<string> {
  const result = await searchWeb(query, options);

  if (result.results.length === 0) {
    return 'Aucun résultat trouvé pour cette recherche.';
  }

  let context = `## Résultats de recherche web pour: "${query}"\n\n`;

  for (let i = 0; i < Math.min(result.results.length, 8); i++) {
    const r = result.results[i];
    context += `[Source ${i + 1}] ${r.title}\n`;
    context += `URL: ${r.link}\n`;
    context += `${r.snippet}\n\n`;
  }

  context += `---\nFournisseur: ${result.provider} | Temps: ${result.searchTime}ms\n`;

  return context;
}

// ============================================================
// Fallback — Recherche directe via Google (limité)
// ============================================================

async function searchFallback(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const { num = 5 } = options;
  const startTime = Date.now();

  try {
    // Utilise l'API de suggestion Google (gratuite, limitée)
    // ou un scraping basique
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GenovaAI/1.0; +https://github.com/missock237-spec/Genova)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const results = parseGoogleResults(html);

    return {
      results: results.slice(0, num),
      totalResults: results.length,
      searchTime: Date.now() - startTime,
      query,
      provider: 'google_fallback',
    };
  } catch (err) {
    log.warn('Fallback de recherche échoué', {
      error: err instanceof Error ? err.message : String(err),
    });

    return {
      results: [],
      totalResults: 0,
      searchTime: Date.now() - startTime,
      query,
      provider: 'none',
    };
  }
}

/**
 * Parse les résultats Google depuis le HTML
 */
function parseGoogleResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Extraction basique des résultats Google
  // Note: Google peut changer sa structure HTML, ceci est un fallback
  try {
    const linkRegex = /<a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)<\/a>/gi;
    const snippetRegex = /<span[^>]*class="[^"]*aCOpRe[^"]*"[^>]*>(.*?)<\/span>/gi;

    const links: string[] = [];
    const titles: string[] = [];
    const snippets: string[] = [];

    let match;
    while ((match = linkRegex.exec(html)) !== null && links.length < 10) {
      const url = match[1];
      if (!url.includes('google.com') && !url.includes('youtube.com')) {
        links.push(url);
        titles.push(match[2].replace(/<[^>]*>/g, '').trim());
      }
    }

    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 10) {
      snippets.push(match[1].replace(/<[^>]*>/g, '').trim());
    }

    for (let i = 0; i < Math.min(links.length, 10); i++) {
      results.push({
        title: titles[i] || 'Résultat',
        link: links[i],
        snippet: snippets[i] || '',
        position: i + 1,
        source: 'google_fallback',
      });
    }
  } catch { /* ignore parse errors */ }

  return results;
}

// ============================================================
// API Route Helper
// ============================================================

/**
 * POST /api/web-search
 * Body: { query: string, options?: SearchOptions }
 */
export async function handleWebSearchRequest(body: {
  query: string;
  options?: SearchOptions;
}): Promise<SearchResponse> {
  const { query, options } = body;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('La requête de recherche est requise');
  }

  if (query.length > 500) {
    throw new Error('La requête est trop longue (max 500 caractères)');
  }

  return searchWeb(query.trim(), options);
}
