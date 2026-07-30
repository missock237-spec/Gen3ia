// ============================================================
// SEARCH ENGINE V2 — Recherche globale amelioree
// Scoring pondere, fuzzy matching, suggestions,
// historique, cache memoization, filtres avances
// ============================================================
import { prisma } from './prisma';
import { createLogger } from './logger';

const log = createLogger('search-engine');

export interface SearchResult {
  id: string;
  type: 'agent' | 'workflow' | 'dataset' | 'dashboard' | 'marketplace' | 'conversation' | 'template' | 'plugin';
  title: string;
  description: string;
  subtitle: string;
  icon: string;
  url: string;
  score: number;
  matchField?: string;
  matchPosition?: number;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  types?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'recent' | 'popular';
  filters?: Record<string, string>;
}

export interface SuggestionResult {
  text: string;
  type: string;
  count: number;
}

// Cache LRU simple
const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 secondes
const CACHE_MAX = 50;

export class SearchEngine {
  /**
   * Recherche globale avec scoring pondere V2
   */
  async search(query: string, userId: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!query || query.length < 2) return [];

    const q = query.toLowerCase().trim();
    const limit = options.limit || 20;
    const offset = options.offset || 0;
    const cacheKey = `${userId}:${q}:${options.types?.sort().join(',') || 'all'}:${options.sortBy || 'relevance'}`;

    // Cache check
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.results.slice(offset, offset + limit);
    }

    const types = options.types;
    const maxPerType = Math.ceil((limit + offset) / 5) + 2;
    const results: SearchResult[] = [];

    // Lancer toutes les recherches en parallele
    await Promise.all([
      this.searchAgents(q, userId, maxPerType, results),
      this.searchWorkflows(q, userId, maxPerType, results),
      this.searchDatasets(q, userId, maxPerType, results),
      this.searchDashboards(q, userId, maxPerType, results),
      this.searchMarketplace(q, maxPerType, results),
      this.searchConversations(q, userId, maxPerType, results),
      this.searchTemplates(q, userId, maxPerType, results),
      this.searchMessages(q, userId, maxPerType, results),
    ]);

    // Scoring final avec boost contextuel
    for (const r of results) {
      r.score = this.computeBoostedScore(r, q);
    }

    // Tri selon l'option
    if (options.sortBy === 'recent') {
      results.sort((a, b) => (b.metadata?.updatedAt || 0) - (a.metadata?.updatedAt || 0));
    } else if (options.sortBy === 'popular') {
      results.sort((a, b) => (b.metadata?.usageCount || 0) - (a.metadata?.usageCount || 0));
    } else {
      results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    }

    const finalResults = results.slice(offset, offset + limit);

    // Mettre en cache
    searchCache.set(cacheKey, { results, timestamp: Date.now() });
    if (searchCache.size > CACHE_MAX) {
      const firstKey = searchCache.keys().next().value;
      if (firstKey) searchCache.delete(firstKey);
    }

    return finalResults;
  }

  /**
   * Suggestions en temps reel (prefix matching)
   */
  async suggest(query: string, userId: string): Promise<SuggestionResult[]> {
    if (!query || query.length < 1) return [];

    const q = query.toLowerCase().trim();
    const suggestions: SuggestionResult[] = [];

    const [agents, workflows, datasets] = await Promise.all([
      prisma.agent.findMany({ where: { ownerId: userId, name: { startsWith: q, mode: 'insensitive' } }, select: { name: true }, take: 3 }),
      prisma.workflow.findMany({ where: { userId, name: { startsWith: q, mode: 'insensitive' } }, select: { name: true }, take: 3 }),
      prisma.dataset.findMany({ where: { userId, name: { startsWith: q, mode: 'insensitive' } }, select: { name: true }, take: 3 }),
    ]);

    agents.forEach(a => suggestions.push({ text: a.name, type: 'agent', count: 0 }));
    workflows.forEach(w => suggestions.push({ text: w.name, type: 'workflow', count: 0 }));
    datasets.forEach(d => suggestions.push({ text: d.name, type: 'dataset', count: 0 }));

    return suggestions.slice(0, 6);
  }

  /**
   * Fuzzy match (Levenshtein) pour tolerer les fautes de frappe
   */
  private fuzzyMatch(text: string, query: string): number {
    if (text.includes(query)) return 1.0;

    const parts = query.split(/s+/);
    let matchScore = 0;
    for (const part of parts) {
      if (part.length < 2) continue;
      if (text.includes(part)) {
        matchScore += part.length / query.length;
      } else {
        // Levenshtein simple pour 1 faute
        for (let i = 0; i <= text.length - part.length; i++) {
          let dist = 0;
          for (let j = 0; j < part.length; j++) {
            if (text[i + j] !== part[j]) dist++;
          }
          if (dist <= 1) { matchScore += (part.length / query.length) * 0.7; break; }
        }
      }
    }
    return Math.min(matchScore, 1.0);
  }

  /**
   * Scoring V2 avec boost contextuel
   */
  private computeBoostedScore(result: SearchResult, query: string): number {
    const lower = result.title.toLowerCase();
    const desc = result.description.toLowerCase();
    let score = 0;

    // Score base
    if (lower === query) score += 100;
    else if (lower.startsWith(query)) score += 85;
    else if (lower.includes(' ' + query)) score += 70;
    else if (lower.includes(query)) score += 55;
    else if (desc.includes(query)) score += 35;
    else score += this.fuzzyMatch(lower, query) * 30;

    // Boost par type (agents et workflows prioritaires)
    const typeBoost: Record<string, number> = {
      agent: 10, workflow: 8, dataset: 5, dashboard: 5,
      marketplace: 3, template: 3, conversation: 2, plugin: 2,
    };
    score += typeBoost[result.type] || 0;

    // Boost par metadonnees
    if (result.metadata?.usageCount) {
      score += Math.min(result.metadata.usageCount * 0.5, 5);
    }
    if (result.metadata?.rating) {
      score += result.metadata.rating * 1.5;
    }

    return Math.round(Math.min(score, 120));
  }

  // ===== RECHERCHES PAR MODULE =====

  private async searchAgents(q: string, userId: string, take: number, results: SearchResult[]) {
    const agents = await prisma.agent.findMany({
      where: { ownerId: userId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { role: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }] },
      take, select: { id: true, name: true, description: true, role: true, status: true, model: true, usageCount: true, updatedAt: true },
    });
    agents.forEach(a => {
      const matchField = a.name.toLowerCase().includes(q) ? 'name' : a.description?.toLowerCase().includes(q) ? 'description' : 'role';
      results.push({ id: a.id, type: 'agent', title: a.name, description: a.description || a.role, subtitle: `${a.model} · ${a.status}`, icon: '🤖', url: '/agents/' + a.id, score: 0, matchField, metadata: { usageCount: a.usageCount, updatedAt: a.updatedAt?.getTime() } });
    });
  }

  private async searchWorkflows(q: string, userId: string, take: number, results: SearchResult[]) {
    const workflows = await prisma.workflow.findMany({
      where: { userId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
      take, select: { id: true, name: true, description: true, trigger: true, status: true, updatedAt: true },
    });
    workflows.forEach(w => results.push({ id: w.id, type: 'workflow', title: w.name, description: w.description || `Declencheur: ${w.trigger}`, subtitle: `${w.status} · ${w.trigger}`, icon: '⚡', url: '/workflows/' + w.id, score: 0, metadata: { updatedAt: w.updatedAt?.getTime() } }));
  }

  private async searchDatasets(q: string, userId: string, take: number, results: SearchResult[]) {
    const datasets = await prisma.dataset.findMany({
      where: { userId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { tags: { contains: q, mode: 'insensitive' } }] },
      take, select: { id: true, name: true, description: true, source: true, rowCount: true, tags: true },
    });
    datasets.forEach(d => results.push({ id: d.id, type: 'dataset', title: d.name, description: d.description || `${d.source} dataset`, subtitle: `${d.source} · ${d.rowCount} lignes`, icon: '📊', url: '/data/datasets/' + d.id, score: 0, metadata: { usageCount: d.rowCount } }));
  }

  private async searchDashboards(q: string, userId: string, take: number, results: SearchResult[]) {
    const dashboards = await prisma.dashboard.findMany({
      where: { userId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
      take, select: { id: true, name: true, description: true },
    });
    dashboards.forEach(d => results.push({ id: d.id, type: 'dashboard', title: d.name, description: d.description || 'Tableau de bord', subtitle: 'Dashboard', icon: '📈', url: '/data/dashboards/' + d.id, score: 0 }));
  }

  private async searchMarketplace(q: string, take: number, results: SearchResult[]) {
    const listings = await prisma.marketplaceListing.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }], status: 'published', isActive: true },
      take, select: { id: true, name: true, description: true, type: true, price: true, rating: true },
    });
    listings.forEach(l => results.push({ id: l.id, type: 'marketplace', title: l.name, description: l.description || l.type, subtitle: `${l.type}${l.price > 0 ? ` · ${l.price} FCFA` : ' · Gratuit'}`, icon: '🛒', url: '/marketplace/' + l.id, score: 0, metadata: { rating: l.rating } }));
  }

  private async searchConversations(q: string, userId: string, take: number, results: SearchResult[]) {
    const conversations = await prisma.conversation.findMany({
      where: { userId, title: { contains: q, mode: 'insensitive' } },
      take, select: { id: true, title: true, type: true, updatedAt: true },
    });
    conversations.forEach(c => results.push({ id: c.id, type: 'conversation', title: c.title, description: `Conversation ${c.type}`, subtitle: c.type, icon: '💬', url: '/chat/' + c.id, score: 0, metadata: { updatedAt: c.updatedAt?.getTime() } }));
  }

  private async searchTemplates(q: string, userId: string, take: number, results: SearchResult[]) {
    const templates = await prisma.workflowTemplate.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }], OR: [{ isPublic: true }, { userId }] },
      take, select: { id: true, name: true, description: true, category: true, icon: true, usageCount: true },
    });
    templates.forEach(t => results.push({ id: t.id, type: 'template', title: t.name, description: t.description || t.category, subtitle: t.category, icon: t.icon || '📋', url: '/templates/' + t.id, score: 0, metadata: { usageCount: t.usageCount } }));
  }

  private async searchMessages(q: string, userId: string, take: number, results: SearchResult[]) {
    const conversations = await prisma.conversation.findMany({ where: { userId }, select: { id: true, title: true }, take: 20 });
    const convIds = conversations.map(c => c.id);
    if (convIds.length === 0) return;
    const messages = await prisma.message.findMany({
      where: { conversationId: { in: convIds }, content: { contains: q, mode: 'insensitive' } },
      take, select: { id: true, content: true, conversationId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    messages.forEach(m => {
      const conv = conversations.find(c => c.id === m.conversationId);
      results.push({ id: m.id, type: 'conversation', title: conv?.title || 'Message', description: m.content.slice(0, 100), subtitle: 'Message', icon: '💬', url: '/chat/' + m.conversationId, score: 0, matchField: 'content' });
    });
  }

  /**
   * Compteurs par type
   */
  async getSearchCounts(userId: string): Promise<Record<string, number>> {
    const [agents, workflows, datasets, dashboards, conversations] = await Promise.all([
      prisma.agent.count({ where: { ownerId: userId } }),
      prisma.workflow.count({ where: { userId } }),
      prisma.dataset.count({ where: { userId } }),
      prisma.dashboard.count({ where: { userId } }),
      prisma.conversation.count({ where: { userId } }),
    ]);
    return { agents, workflows, datasets, dashboards, conversations };
  }

  /**
   * Vide le cache
   */
  clearCache(): void {
    searchCache.clear();
    log.info('search_cache_cleared');
  }
}

export const searchEngine = new SearchEngine();
export default searchEngine;
