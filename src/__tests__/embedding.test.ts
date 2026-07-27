import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: { agentMemory: { findMany: vi.fn() } } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
describe('EmbeddingService', () => {
  describe('fallbackEmbed', () => {
    it('produit un vecteur 128 dims', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      const vec = (embeddingService as any).fallbackEmbed('test');
      expect(vec).toHaveLength(128);
      expect(vec.every((v: number) => typeof v === 'number')).toBe(true);
    });
    it('vecteur normalise', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      const vec = (embeddingService as any).fallbackEmbed('hello world');
      const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
      expect(Math.abs(norm - 1)).toBeLessThan(0.01);
    });
    it('vecteur zero pour texte vide', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      const vec = (embeddingService as any).fallbackEmbed('');
      expect(vec.every((v: number) => v === 0)).toBe(true);
    });
  });
  describe('cosineSimilarity', () => {
    it('retourne 1.0 pour identiques', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      expect((embeddingService as any).cosineSimilarity([1,0,0], [1,0,0])).toBeCloseTo(1.0);
    });
    it('retourne 0 pour orthogonaux', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      expect((embeddingService as any).cosineSimilarity([1,0], [0,1])).toBeCloseTo(0);
    });
    it('retourne -1 pour opposes', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      expect((embeddingService as any).cosineSimilarity([1,0], [-1,0])).toBeCloseTo(-1);
    });
    it('retourne 0 pour tailles differentes', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      expect((embeddingService as any).cosineSimilarity([1], [1,0])).toBe(0);
    });
  });
  describe('fallbackSimilarity', () => {
    it('1.0 pour identiques', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      expect((embeddingService as any).fallbackSimilarity('a b', 'a b')).toBeCloseTo(1.0);
    });
    it('score entre 0 et 1 pour partiellement similaires', async () => {
      const { embeddingService } = await import('@/lib/agent/embedding');
      const score = (embeddingService as any).fallbackSimilarity('ventes client', 'client ventes');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});
