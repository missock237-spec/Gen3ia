import { searchWeb } from './web-search';
import { relayChat } from '@/lib/relay/relay-router';
import { createLogger } from '@/lib/logger';
const log = createLogger('search-ai');
export async function searchWithAISummary(query: string, limit: number = 10): Promise<{ results: any[]; summary?: string; provider: string }> {
  const sr = await searchWeb(query, { limit });
  if (sr.results.length === 0) return { results: [], provider: sr.provider };
  try {
    const snippets = sr.results.slice(0, 5).map(r => `- ${r.title}: ${r.snippet}`).join('\n');
    const ai = await relayChat([{ role: 'system', content: 'Summarize these search results concisely in French.' }, { role: 'user', content: `Résultats pour "${query}":\n${snippets}` }], { preferFree: true });
    return { results: sr.results, summary: ai.content, provider: sr.provider };
  } catch (e) {
    log.warn('AI summary failed', { error: String(e) });
    return { results: sr.results, provider: sr.provider };
  }
}