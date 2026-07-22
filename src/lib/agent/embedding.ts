import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

const THRESHOLD = 0.85;

export class EmbeddingService {
  async searchSimilar(query, userId, limit = 5) {
    const memories = await prisma.agentMemory.findMany({ where: { userId }, orderBy: { relevance: "desc" }, take: 50 });
    const q = query.toLowerCase();
    const scored = memories.map(m => ({ content: m.content, score: this.similarity(q, m.content.toLowerCase()), source: m.source }));
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(r => r.score >= THRESHOLD).slice(0, limit).map(r => ({ content: r.content.substring(0, 500), score: r.score, source: r.source }));
  }

  private similarity(a, b) {
    const wa = a.split(/\s+/), wb = b.split(/\s+/);
    const all = new Set([...wa, ...wb]);
    const va = [...all].map(w => wa.filter(x => x === w).length);
    const vb = [...all].map(w => wb.filter(x => x === w).length);
    const dot = va.reduce((s, v, i) => s + v * vb[i], 0);
    const na = Math.sqrt(va.reduce((s, v) => s + v * v, 0));
    const nb = Math.sqrt(vb.reduce((s, v) => s + v * v, 0));
    return na === 0 || nb === 0 ? 0 : dot / (na * nb);
  }
}

export const embeddingService = new EmbeddingService();
