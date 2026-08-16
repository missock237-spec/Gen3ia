import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

const HF_API_URL = 'https://api-inference.huggingface.co/models';
const HF_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const THRESHOLD = 0.75;
const CACHE_TTL_MS = 300_000; // 5 minutes

interface CacheEntry {
  vector: number[];
  timestamp: number;
}

function getApiKey(): string {
  return process.env.HUGGINGFACE_API_KEY || process.env.NEXT_PUBLIC_HUGGINGFACE_API_KEY || '';
}

export class EmbeddingService {
  private cache = new Map<string, CacheEntry>();
  private modelLoaded = false;

  /**
   * Génère un vecteur d'embedding via Hugging Face Inference API
   */
  async embed(text: string): Promise<number[]> {
    // Cache check
    const cacheKey = text.toLowerCase().trim().slice(0, 200);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.vector;
    }

    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const response = await fetch(`${HF_API_URL}/${HF_MODEL}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inputs: text.slice(0, 512) }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'unknown');
        if (response.status === 503) {
          logger.warn('HF embedding model loading, fallback to cosine', { error: errText.slice(0, 100) });
          if (!this.modelLoaded) {
            this.modelLoaded = true;
            setTimeout(() => { this.modelLoaded = false; }, 30000);
          }
          return this.fallbackEmbed(text);
        }
        throw new Error(`HF embedding error (${response.status}): ${errText.slice(0, 200)}`);
      }

      const result = await response.json();
      let vector: number[];

      if (Array.isArray(result) && result.length > 0) {
        // HF returns [[0.01, 0.02, ...]] for a single input
        vector = Array.isArray(result[0]) ? result[0] : result;
      } else if (Array.isArray(result) && typeof result[0] === 'number') {
        vector = result;
      } else {
        throw new Error('Unexpected embedding format');
      }

      // Mettre en cache
      this.cache.set(cacheKey, { vector, timestamp: Date.now() });

      return vector;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn('HF embedding failed, fallback to cosine', { error: msg });
      return this.fallbackEmbed(text);
    }
  }

  /**
   * Recherche les contenus similaires dans la mémoire
   */
  async searchSimilar(query: string, userId: string, limit = 5): Promise<Array<{ content: string; score: number; source: string; memoryId?: string }>> {
    const memories = await prisma.agentMemory.findMany({
      where: { userId },
      orderBy: { relevance: 'desc' },
      take: 100,
      select: { id: true, content: true, source: true, embedding: true },
    });

    if (!query || memories.length === 0) return [];

    try {
      const queryVector = await this.embed(query);
      const scored = memories.map(m => {
        let memVector: number[] | null = null;
        if (m.embedding) {
          try {
            memVector = typeof m.embedding === 'string' ? JSON.parse(m.embedding) : m.embedding;
          } catch { memVector = null; }
        }

        const score = memVector
          ? this.cosineSimilarity(queryVector, memVector)
          : this.fallbackSimilarity(query.toLowerCase(), m.content.toLowerCase());

        return { content: m.content, score, source: m.source, memoryId: m.id };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.filter(r => r.score >= THRESHOLD).slice(0, limit).map(r => ({
        content: r.content.substring(0, 500),
        score: Math.round(r.score * 100) / 100,
        source: r.source,
        memoryId: r.memoryId,
      }));
    } catch (error) {
      logger.error('Embedding search failed', { error: String(error) });
      return [];
    }
  }

  /**
   * Calcule le cosinus entre deux vecteurs
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const norm = Math.sqrt(na) * Math.sqrt(nb);
    return norm === 0 ? 0 : dot / norm;
  }

  /**
   * Fallback TF-IDF-like cosine similarity (quand HF est indisponible)
   */
  private fallbackSimilarity(a: string, b: string): number {
    const wa = a.split(/\s+/).filter(Boolean);
    const wb = b.split(/\s+/).filter(Boolean);
    const all = new Set([...wa, ...wb]);
    const va = [...all].map(w => wa.filter(x => x === w).length);
    const vb = [...all].map(w => wb.filter(x => x === w).length);
    const dot = va.reduce((s, v, i) => s + v * vb[i], 0);
    const na = Math.sqrt(va.reduce((s, v) => s + v * v, 0));
    const nb = Math.sqrt(vb.reduce((s, v) => s + v * v, 0));
    return na === 0 || nb === 0 ? 0 : dot / (na * nb);
  }

  /**
   * Fallback embedding basique (distribution de caractères)
   */
  private fallbackEmbed(text: string): number[] {
    const dims = 128;
    const vec = new Array(dims).fill(0);
    const chars = text.toLowerCase().split('');
    for (let i = 0; i < chars.length; i++) {
      vec[chars[i].charCodeAt(0) % dims] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm === 0 ? vec : vec.map(v => v / norm);
  }
}

export const embeddingService = new EmbeddingService();