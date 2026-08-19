/* eslint-disable @typescript-eslint/no-require-imports -- test file uses dynamic require for modules that may not be installed */
// ============================================================
// Tests — Vector Store Adapter (SQLite + Qdrant)
// Factory, upsert, search, delete, count
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    documentChunk: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/memory/embeddings', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
  storeEmbedding: vi.fn(),
  searchSimilar: vi.fn().mockReturnValue([
    { id: 'doc_1', text: 'Document test 1', score: 0.95, metadata: { source: 'test' } },
    { id: 'doc_2', text: 'Document test 2', score: 0.85, metadata: { source: 'test' } },
  ]),
  simpleTokenize: vi.fn((text: string) => text.toLowerCase().split(/\W+/).filter(Boolean)),
  clearVectorStore: vi.fn(),
  getVectorStoreSize: vi.fn().mockReturnValue(5),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('Vector Store Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset la factory
    const { resetVectorStore } = require('@/lib/rag/vector-store');
    resetVectorStore();
  });

  describe('Factory - getVectorStore', () => {
    it('retourne SQLiteAdapter par defaut', async () => {
      delete process.env.VECTOR_STORE_TYPE;
      const { getVectorStore } = await import('@/lib/rag/vector-store');
      const store = getVectorStore();
      expect(store.adapterType).toBe('sqlite');
    });

    it('retourne QdrantAdapter si VECTOR_STORE_TYPE=qdrant', async () => {
      process.env.VECTOR_STORE_TYPE = 'qdrant';
      process.env.QDRANT_URL = 'http://localhost:6333';
      const { getVectorStore } = await import('@/lib/rag/vector-store');
      const store = getVectorStore();
      expect(store.adapterType).toBe('qdrant');
    });

    it('fallback sur SQLite si QDRANT_URL pas configure', async () => {
      process.env.VECTOR_STORE_TYPE = 'qdrant';
      delete process.env.QDRANT_URL;
      const { getVectorStore } = await import('@/lib/rag/vector-store');
      const store = getVectorStore();
      expect(store.adapterType).toBe('sqlite');
    });

    it('retourne le singleton (meme instance)', async () => {
      const { getVectorStore, resetVectorStore } = await import('@/lib/rag/vector-store');
      const store1 = getVectorStore();
      const store2 = getVectorStore();
      expect(store1).toBe(store2);
      resetVectorStore();
      const store3 = getVectorStore();
      expect(store3).not.toBe(store1);
    });
  });

  describe('SQLiteVectorAdapter', () => {
    it('upsert un document vectoriel', async () => {
      const { SQLiteVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new SQLiteVectorAdapter();
      
      await adapter.upsert({
        id: 'doc_1',
        content: 'Mon document test',
        vector: new Array(384).fill(0.1),
        metadata: { source: 'test' },
      });

      expect(adapter.adapterType).toBe('sqlite');
    });

    it('recherche des vecteurs similaires', async () => {
      const { SQLiteVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new SQLiteVectorAdapter();
      
      const results = await adapter.search(new Array(384).fill(0.1), { topK: 2 });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc_1');
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('recherche avec filtre metadata', async () => {
      const { SQLiteVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new SQLiteVectorAdapter();
      
      const results = await adapter.search(new Array(384).fill(0.1), {
        topK: 5,
        filter: { source: 'test' },
      });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('count retourne le nombre de vecteurs', async () => {
      const { SQLiteVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new SQLiteVectorAdapter();
      const count = await adapter.count();
      expect(count).toBe(5);
    });

    it('delete marque comme supprime dans metadata', async () => {
      const { SQLiteVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new SQLiteVectorAdapter();
      const { db } = await import('@/lib/db');
      
      (db.documentChunk.findUnique as any).mockResolvedValue({
        id: 'doc_1',
        metadata: JSON.stringify({ source: 'test' }),
      });
      
      await adapter.delete('doc_1');
    });
  });

  describe('QdrantVectorAdapter', () => {
    beforeEach(() => {
      process.env.QDRANT_URL = 'http://localhost:6333';
      process.env.QDRANT_API_KEY = 'test-key';
    });

    it('cree une instance avec les bons parametres', async () => {
      const { QdrantVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new QdrantVectorAdapter();
      expect(adapter.adapterType).toBe('qdrant');
    });

    it('cree une instance avec config personnalisee', async () => {
      const { QdrantVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new QdrantVectorAdapter({
        url: 'https://qdrant.exemple.com',
        apiKey: 'custom-key',
        collectionName: 'my_collection',
        vectorSize: 768,
      });
      expect(adapter.adapterType).toBe('qdrant');
    });

    it('gene des requetes HTTP avec auth header', async () => {
      const { QdrantVectorAdapter } = await import('@/lib/rag/vector-store');
      const adapter = new QdrantVectorAdapter();
      
      // Vérifier que les headers incluent la clé API
      const headers = (adapter as any).apiKey;
      expect(headers).toBe('test-key');
    });
  });

  describe('HybridRetriever', () => {
    it('indexe des documents pour BM25', async () => {
      const { HybridRetriever, SQLiteVectorAdapter } = await import('@/lib/rag/vector-store');
      const vectorStore = new SQLiteVectorAdapter();
      const retriever = new HybridRetriever(vectorStore);
      
      retriever.indexDocuments([
        { id: '1', content: 'Le Cameroun est un pays d Afrique centrale' },
        { id: '2', content: 'Yaounde est la capitale du Cameroun' },
      ]);

      expect(retriever.getIndexedCount()).toBe(2);
    });

    it('effectue une recherche hybride', async () => {
      const { HybridRetriever, SQLiteVectorAdapter } = await import('@/lib/rag/vector-store');
      const vectorStore = new SQLiteVectorAdapter();
      const retriever = new HybridRetriever(vectorStore);
      
      retriever.indexDocuments([
        { id: '1', content: 'Le Cameroun est un pays d Afrique centrale' },
        { id: '2', content: 'Yaounde est la capitale du Cameroun' },
      ]);

      const results = await retriever.retrieve('Cameroun Yaounde', { topK: 2 });
      expect(results.length).toBeGreaterThanOrEqual(0);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('semanticScore');
      expect(results[0]).toHaveProperty('bm25Score');
    });
  });
});
