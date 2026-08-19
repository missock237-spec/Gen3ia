import { createLogger } from '@/lib/logger';
const log = createLogger('web-search');
export enum SearchType { WEB='web', IMAGES='images', NEWS='news', VIDEO='video', SHOPPING='shopping', SCHOLAR='scholar' }
export interface SearchResult { title: string; link: string; snippet: string; source: string; position: number; thumbnail?: string; publishedAt?: string; }
export interface SearchResponse { query: string; type: SearchType; totalResults: number; results: SearchResult[]; relatedQueries: string[]; durationMs: number; cached: boolean; provider: string; }
const CACHE_TTL = 300000;
const cache = new Map<string, { r: SearchResponse; e: number }>();
class Engine {
  private key: string;
  private useSerp: boolean;
  constructor() { this.key = process.env.SERPAPI_API_KEY || ''; this.useSerp = this.key.length > 10; }
  async search(query: string, type: SearchType = SearchType.WEB, opts?: { limit?: number; country?: string; useCache?: boolean }): Promise<SearchResponse> {
    const start = Date.now();
    const lim = opts?.limit || 10;
    const ck = `s:${type}:${query.toLowerCase().slice(0, 100)}`;
    if (opts?.useCache !== false) { const ca = cache.get(ck); if (ca && ca.e > Date.now()) return { ...ca.r, cached: true }; }
    let res: SearchResponse;
    if (this.useSerp) res = await this.serp(query, type, lim, opts?.country);
    else res = await this.ddg(query, type, lim);
    res.durationMs = Date.now() - start;
    res.cached = false;
    if (res.results.length > 0) cache.set(ck, { r: res, e: Date.now() + CACHE_TTL });
    return res;
  }
  private async serp(q: string, t: SearchType, lim: number, country?: string): Promise<SearchResponse> {
    const p = new URLSearchParams({ q, api_key: this.key, num: String(Math.min(lim, 20)), ...(country ? { gl: country } : {}) });
    const c = new AbortController();
    const tm = setTimeout(() => c.abort(), 15000);
    try {
      const r = await fetch('https://serpapi.com/search?' + p.toString(), { signal: c.signal });
      if (!r.ok) { if (r.status === 429) return this.ddg(q, t, lim); throw new Error('SerpAPI error ' + r.status); }
      const d = await r.json();
      const results: SearchResult[] = (d.organic_results || []).slice(0, lim).map((x: any, i: number) => ({ title: x.title||'', link: x.link||'', snippet: x.snippet||'', source: x.source||x.domain||'', position: i+1 }));
      const rq: string[] = [];
      if (d.related_questions) for (const qq of d.related_questions) { if (qq.question) rq.push(qq.question); }
      if (d.related_searches) for (const ss of d.related_searches) { if (ss.query) rq.push(ss.query); }
      return { query: q, type: t, totalResults: results.length, results, relatedQueries: rq.slice(0,10), durationMs: 0, cached: false, provider: 'serpapi' };
    } catch (err) { if (err instanceof DOMException && (err as any).name === 'AbortError') return this.ddg(q, t, lim); throw err; }
    finally { clearTimeout(tm); }
  }
  private async ddg(q: string, t: SearchType, lim: number): Promise<SearchResponse> {
    const results: SearchResult[] = [];
    const c = new AbortController();
    const tm = setTimeout(() => c.abort(), 10000);
    try {
      const r = await fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1', { signal: c.signal });
      if (r.ok) {
        const d = await r.json();
        if (d.AbstractText && d.AbstractURL) results.push({ title: d.Headline||d.AbstractText.slice(0,60), link: d.AbstractURL, snippet: d.AbstractText, source: d.AbstractSource||'', position: 0 });
        if (d.RelatedTopics) for (const top of d.RelatedTopics.slice(0, lim)) {
          if (top.Text && top.FirstURL) results.push({ title: top.Text.split(' - ')[0]||top.Text, link: top.FirstURL, snippet: top.Text, source: new URL(top.FirstURL).hostname, position: results.length+1 });
          if (top.Topics) for (const sub of top.Topics) { if (results.length<lim && sub.Text && sub.FirstURL) results.push({ title: sub.Text.split(' - ')[0]||sub.Text, link: sub.FirstURL, snippet: sub.Text, source: new URL(sub.FirstURL).hostname, position: results.length+1 }); }
        }
      }
    } catch {}
    finally { clearTimeout(tm); }
    return { query: q, type: t, totalResults: results.length, results, relatedQueries: [], durationMs: 0, cached: false, provider: results.length > 0 ? 'duckduckgo' : 'none' };
  }
}
const instance = new Engine();
export async function searchWeb(query: string, opts?: { type?: SearchType; limit?: number; country?: string; useCache?: boolean }): Promise<SearchResponse> { return instance.search(query, opts?.type || SearchType.WEB, opts); }
export async function searchImages(query: string, opts?: { limit?: number }): Promise<SearchResponse> { return instance.search(query, SearchType.IMAGES, opts); }
export async function searchNews(query: string, opts?: { limit?: number; language?: string }): Promise<SearchResponse> { return instance.search(query, SearchType.NEWS, opts); }