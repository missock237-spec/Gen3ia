// ============================================================
// MÉMOIRE VECTORIELLE — RAG intégré au moteur ReAct
// ============================================================
// Permet aux agents de stocker et rappeler des informations
// via une recherche vectorielle sur les embeddings.
// Utilise Qdrant comme backend vectoriel avec fallback mémoire.
// ============================================================

import { logger } from "./logger";

export interface MemoryDocument {
  id: string;
  userId: string;
  agentId: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  score: number;
  timestamp: number;
}

export interface SearchResult {
  documents: MemoryDocument[];
  query: string;
  timeMs: number;
}

// ============================================================
// GÉNÉRATION D'EMBEDDING
// ============================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY ?? "";

  if (!apiKey) {
    // Fallback hash vector
    const str = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const words = str.split(" ").slice(0, 200);
    const vector = new Array(384).fill(0);
    for (let i = 0; i < words.length; i++) {
      const hash = words[i]!.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
      vector[hash % 384] = (vector[hash % 384] ?? 0) + 1;
    }
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vector.map((v) => v / norm) : vector;
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8192),
    }),
  });

  if (!response.ok) throw new Error(`Embedding API error: ${response.status}`);
  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0]!.embedding;
}

// ============================================================
// SIMILARITÉ COSINUS
// ============================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// VECTOR MEMORY STORE
// ============================================================

class VectorMemoryStore {
  private documents: MemoryDocument[] = [];
  private useQdrant = false;

  constructor() {
    if (process.env.QDRANT_URL && process.env.QDRANT_API_KEY) {
      this.useQdrant = true;
      logger.info("vector_memory_qdrant_enabled");
    } else {
      logger.info("vector_memory_fallback_enabled");
    }
  }

  /**
   */
  async store(params: {
    userId: string;
    agentId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const start = Date.now();
    const embedding = await generateEmbedding(params.content);

    const doc: MemoryDocument = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: params.userId,
      agentId: params.agentId,
      content: params.content,
      metadata: params.metadata ?? {},
      embedding,
      score: 1.0,
      timestamp: Date.now(),
    };

    if (this.useQdrant) {
      try {
        await this.storeInQdrant(doc);
      } catch (error) {
        logger.error("vector_memory_qdrant_store_failed", { error: String(error) });
        this.documents.push(doc);
      }
    } else {
      this.documents.push(doc);
    }

    logger.info("vector_memory_stored", {
      docId: doc.id.slice(0, 12),
      contentLength: params.content.length,
      store: this.useQdrant ? "qdrant" : "memory",
      durationMs: Date.now() - start,
    });

    return doc.id;
  }

  /**
   */
  async search(params: {
    query: string;
    userId?: string;
    agentId?: string;
    limit?: number;
    minScore?: number;
  }): Promise<SearchResult> {
    const start = Date.now();
    const limit = params.limit ?? 5;
    const minScore = params.minScore ?? 0.6;

    const queryEmbedding = await generateEmbedding(params.query);

    if (this.useQdrant) {
      try {
        return await this.searchInQdrant(params.query, queryEmbedding, params.userId, params.agentId, limit, minScore);
      } catch (error) {
        logger.error("vector_memory_qdrant_search_failed", { error: String(error) });
        // Fallback mémoire
      }
    }

    // Recherche en mémoire avec filtres
    const results = this.documents.filter((doc) => {
      if (params.userId && doc.userId !== params.userId) return false;
      if (params.agentId && doc.agentId !== params.agentId) return false;
      return true;
    });

    const scored = results
      .map((doc) => ({
        ...doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .filter((doc) => doc.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    logger.info("vector_memory_searched", {
      queryLength: params.query.length,
      resultsCount: scored.length,
      totalCandidates: results.length,
      store: "memory",
      durationMs: Date.now() - start,
    });

    return { documents: scored, query: params.query, timeMs: Date.now() - start };
  }

  /**
   */
  async delete(docId: string): Promise<boolean> {
    const before = this.documents.length;
    this.documents = this.documents.filter((d) => d.id !== docId);
    return this.documents.length < before;
  }

  /**
   */
  getStats() {
    return {
      totalDocuments: this.documents.length,
      useQdrant: this.useQdrant,
      averageContentLength: this.documents.length > 0
        ? Math.round(this.documents.reduce((s, d) => s + d.content.length, 0) / this.documents.length)
        : 0,
    };
  }

  private async storeInQdrant(doc: MemoryDocument): Promise<void> {
    const qdrantUrl = process.env.QDRANT_URL!;
    const qdrantKey = process.env.QDRANT_API_KEY!;
    const collection = "genova_memories";

    await fetch(`${qdrantUrl}/collections/${collection}/points`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "api-key": qdrantKey,
      },
      body: JSON.stringify({
        points: [{
          id: doc.id,
          vector: doc.embedding,
          payload: {
            userId: doc.userId,
            agentId: doc.agentId,
            content: doc.content,
            metadata: doc.metadata,
            timestamp: doc.timestamp,
          },
        }],
      }),
    });
  }

  private async searchInQdrant(
    query: string,
    embedding: number[],
    userId?: string,
    agentId?: string,
    limit = 5,
    minScore = 0.6,
  ): Promise<SearchResult> {
    const qdrantUrl = process.env.QDRANT_URL!;
    const qdrantKey = process.env.QDRANT_API_KEY!;
    const collection = "genova_memories";

    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;
    if (agentId) filter.agentId = agentId;

    const response = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": qdrantKey,
      },
      body: JSON.stringify({
        vector: embedding,
        limit,
        score_threshold: minScore,
        filter: Object.keys(filter).length > 0 ? { must: Object.entries(filter).map(([key, value]) => ({ key, match: { value } })) } : undefined,
      }),
    });

    if (!response.ok) throw new Error(`Qdrant search error: ${response.status}`);
    const data = await response.json() as { result: Array<{ id: string; score: number; payload: { userId: string; agentId: string; content: string; metadata: Record<string, unknown>; timestamp: number } }> };

    const documents: MemoryDocument[] = (data.result ?? []).map((r) => ({
      id: r.id,
      userId: r.payload.userId,
      agentId: r.payload.agentId,
      content: r.payload.content,
      metadata: r.payload.metadata,
      embedding: [],
      score: r.score,
      timestamp: r.payload.timestamp,
    }));

    return { documents, query, timeMs: 0 };
  }
}

export const vectorMemory = new VectorMemoryStore();
export default vectorMemory;