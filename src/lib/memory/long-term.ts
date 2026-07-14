// Long-term Memory — Persistent knowledge with Qdrant vector search
// Utilise Qdrant pour le stockage vectoriel, avec fallback SQLite

import { db } from '@/lib/db';
import { extractKeywords } from './embeddings';
import { getVectorStore } from '@/lib/rag/vector-store';
import { generateText } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';

const log = createLogger('long-term-memory');

// ============================================================
// Types
// ============================================================

export interface KnowledgeEntry {
  id: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  relevance: number;
  userId: string;
  createdAt: string;
  importance: number;
}

export interface MemorySearchResult {
  entry: KnowledgeEntry;
  score: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

// ============================================================
// LONG-TERM MEMORY ENGINE — Propulsé par Qdrant
// ============================================================

export class LongTermMemory {
  private vectorStore = getVectorStore();

  /**
   * Store a knowledge entry avec embedding vectoriel dans Qdrant
   */
  async store(entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>): Promise<string> {
    const knowledge = await db.knowledge.create({
      data: {
        content: entry.content,
        category: entry.category,
        tags: JSON.stringify(entry.tags),
        source: entry.source,
        relevance: entry.relevance,
        userId: entry.userId,
      },
    });

    // Générer et stocker l'embedding dans Qdrant (ou SQLite fallback)
    try {
      const { generateEmbedding } = await import('./embeddings');
      const embedding = await generateEmbedding(entry.content);

      await this.vectorStore.upsert({
        id: knowledge.id,
        content: entry.content,
        vector: embedding,
        metadata: {
          category: entry.category,
          source: entry.source,
          userId: entry.userId,
          tags: entry.tags,
          importance: entry.relevance,
        },
      });

      log.info('Mémoire stockée avec vecteur Qdrant', { id: knowledge.id, category: entry.category });
    } catch (err) {
      log.warn('Stockage vectoriel non disponible, mémoire en base uniquement', {
        id: knowledge.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return knowledge.id;
  }

  /**
   * Recherche multi-stratégies : Qdrant (vectoriel) → SQLite (mots-clés)
   */
  async search(
    query: string,
    userId: string,
    options?: {
      category?: string;
      limit?: number;
      minScore?: number;
      searchType?: 'semantic' | 'keyword' | 'hybrid';
    }
  ): Promise<MemorySearchResult[]> {
    const { category, limit = 10, minScore = 0.1, searchType = 'hybrid' } = options || {};

    const where: Record<string, unknown> = { userId };
    if (category) where.category = category;

    const allKnowledge = await db.knowledge.findMany({ where });
    if (allKnowledge.length === 0) return [];

    let results: MemorySearchResult[] = [];

    // Stratégie 1 : Recherche vectorielle via Qdrant
    if (searchType === 'semantic' || searchType === 'hybrid') {
      try {
        const { generateEmbedding } = await import('./embeddings');
        const queryVector = await generateEmbedding(query);

        const vectorResults = await this.vectorStore.search(queryVector, {
          topK: limit * 2,
          minScore,
          filter: { userId },
        });

        results = vectorResults.map(r => ({
          entry: {
            id: r.id,
            content: r.content,
            category: (r.metadata.category as string) || 'general',
            tags: (r.metadata.tags as string[]) || [],
            source: (r.metadata.source as string) || 'vector',
            relevance: r.score,
            userId,
            createdAt: new Date().toISOString(),
            importance: r.score,
          },
          score: r.score,
          matchType: 'semantic' as const,
        }));
      } catch (err) {
        log.warn('Recherche vectorielle échouée, fallback mots-clés', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Stratégie 2 : Recherche par mots-clés (fallback ou complément)
    if ((searchType === 'keyword' || searchType === 'hybrid') && results.length < limit) {
      const { findMostRelevant } = await import('./embeddings');

      const keywordResults = findMostRelevant(query, allKnowledge.map(k => ({
        id: k.id,
        content: k.content,
        source: k.source,
        category: k.category,
        tags: k.tags,
        relevance: k.relevance,
        createdAt: k.createdAt,
      })), limit * 2);

      const keywordEntries: MemorySearchResult[] = keywordResults.map(r => ({
        entry: {
          id: r.document.id,
          content: r.document.content,
          category: r.document.category,
          tags: JSON.parse(r.document.tags || '[]'),
          source: r.document.source,
          relevance: r.document.relevance,
          userId,
          createdAt: r.document.createdAt.toISOString(),
          importance: r.document.relevance,
        },
        score: r.score,
        matchType: 'keyword' as const,
      }));

      // Fusion sans doublons
      const existingIds = new Set(results.map(r => r.entry.id));
      for (const ke of keywordEntries) {
        if (!existingIds.has(ke.entry.id)) {
          results.push(ke);
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .filter(r => r.score >= minScore)
      .slice(0, limit);
  }

  /**
   * Récupère le contexte pertinent pour une requête (utilisé par les agents)
   */
  async getContextForQuery(query: string, userId: string): Promise<string> {
    const relevant = await this.search(query, userId, { limit: 5, searchType: 'hybrid' });
    if (relevant.length === 0) return '';

    return relevant
      .map((r, i) => `[Mémoire ${i + 1}] (${r.matchType}, ${r.entry.category}): ${r.entry.content}`)
      .join('\n\n');
  }

  /**
   * Récupère toutes les connaissances d'un utilisateur
   */
  async getAll(userId: string, category?: string): Promise<KnowledgeEntry[]> {
    const where: Record<string, unknown> = { userId };
    if (category) where.category = category;

    const entries = await db.knowledge.findMany({ where, orderBy: { createdAt: 'desc' } });

    return entries.map(k => ({
      id: k.id,
      content: k.content,
      category: k.category,
      tags: JSON.parse(k.tags || '[]'),
      source: k.source,
      relevance: k.relevance,
      userId: k.userId,
      createdAt: k.createdAt.toISOString(),
      importance: k.relevance,
    }));
  }

  async delete(id: string): Promise<void> {
    await db.knowledge.delete({ where: { id } }).catch(() => {});
    try { await this.vectorStore.delete(id); } catch { /* ignore */ }
  }

  /**
   * Extraction et stockage automatique depuis une conversation
   */
  async extractAndStore(conversationId: string, userId: string): Promise<void> {
    const messages = await db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) return;

    const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    try {
      const result = await generateText([
        {
          role: 'system',
          content: `Extrais les informations clés de cette conversation sous format JSON:
[{ "content": "info", "category": "preference|project|workflow_context|agent_learning", "tags": ["tag"] }]
Réponds UNIQUEMENT avec le JSON, pas de texte autour.`
        },
        { role: 'user', content: conversationText.substring(0, 4000) },
      ]);

      let extracted: Array<{ content: string; category: string; tags: string[] }>;
      try {
        let content = result.content.trim();
        content = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        extracted = JSON.parse(content);
      } catch {
        extracted = [{ content: conversationText.substring(0, 1000), category: 'project', tags: extractKeywords(conversationText, 5) }];
      }

      for (const insight of extracted) {
        await this.store({
          content: insight.content,
          category: insight.category || 'project',
          tags: insight.tags || [],
          source: 'conversation',
          relevance: 0.7,
          userId,
        });
      }
    } catch {
      const keywords = extractKeywords(conversationText, 10);
      await this.store({
        content: conversationText.substring(0, 1500),
        category: 'project',
        tags: keywords,
        source: 'conversation',
        relevance: 0.7,
        userId,
      });
    }
  }

  /**
   * Obtient les statistiques mémoire
   */
  async getMemoryStats(userId: string): Promise<{
    totalMemories: number;
    byCategory: Record<string, number>;
    averageImportance: number;
    vectorStoreType: string;
    vectorCount: number;
  }> {
    const allMemories = await db.knowledge.findMany({ where: { userId } });
    const byCategory: Record<string, number> = {};
    let totalImportance = 0;

    for (const m of allMemories) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      totalImportance += m.relevance;
    }

    let vectorCount = 0;
    try { vectorCount = await this.vectorStore.count(); } catch { /* ignore */ }

    return {
      totalMemories: allMemories.length,
      byCategory,
      averageImportance: allMemories.length > 0 ? totalImportance / allMemories.length : 0,
      vectorStoreType: this.vectorStore.adapterType,
      vectorCount,
    };
  }

  /**
   * Résumé automatique des vieilles mémoires (nettoie l'espace)
   */
  async summarizeOldMemories(userId: string, olderThanDays = 30): Promise<{ summarized: number; deleted: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const oldEntries = await db.knowledge.findMany({
      where: { userId, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    if (oldEntries.length < 5) return { summarized: 0, deleted: 0 };

    const contents = oldEntries.map(e => `- ${e.content.substring(0, 300)}`).join('\n');

    try {
      const result = await generateText([
        { role: 'system', content: 'Condense les entrées suivantes en UN résumé qui préserve les informations clés. Réponds avec le texte uniquement.' },
        { role: 'user', content: `Entrées à résumer:\n${contents}` },
      ]);

      await this.store({
        content: result.content,
        category: 'summarized',
        tags: ['summarized', `from:${oldEntries.length}_entries`],
        source: 'summarization',
        relevance: 0.5,
        userId,
      });

      let deleted = 0;
      for (const entry of oldEntries) {
        await this.delete(entry.id);
        deleted++;
      }

      return { summarized: 1, deleted };
    } catch {
      return { summarized: 0, deleted: 0 };
    }
  }
}
