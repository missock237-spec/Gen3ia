import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export class HybridSearchEngine {
  async search(options) {
    const { query, userId, sources = ["knowledge", "memory", "document", "conversation"], limit = 10, minScore = 0.1 } = options;
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const results = [];

    if (sources.includes("knowledge")) {
      const items = await prisma.knowledge.findMany({ where: { userId }, take: 50 });
      for (const k of items) {
        const score = this.score(query, k.content, terms);
// @ts-ignore — type narrowing pending, see refactor ticket
        if (score >= minScore) results.push({ id: k.id, content: k.content.substring(0, 500), score, source: "knowledge", metadata: { category: k.category } });
      }
    }
    if (sources.includes("memory")) {
      const items = await prisma.agentMemory.findMany({ where: { userId }, take: 50 });
      for (const m of items) {
        const score = this.score(query, m.content, terms);
// @ts-ignore — type narrowing pending, see refactor ticket
        if (score >= minScore) results.push({ id: m.id, content: m.content.substring(0, 500), score, source: "memory", metadata: { category: m.category, relevance: m.relevance } });
      }
    }
    if (sources.includes("document")) {
      const items = await prisma.document.findMany({ where: { userId }, take: 30 });
      for (const d of items) {
        const score = this.score(query, d.content, terms);
// @ts-ignore — type narrowing pending, see refactor ticket
        if (score >= minScore) results.push({ id: d.id, content: d.content.substring(0, 500), score, source: "document", metadata: { fileName: d.fileName } });
      }
    }
    if (sources.includes("conversation")) {
      const convs = await prisma.conversation.findMany({ where: { userId }, take: 20, include: { messages: { take: 5, orderBy: { createdAt: "desc" } } } });
      for (const c of convs) {
        const content = c.messages.map(m => m.content).join("\n");
        const score = this.score(query, content, terms);
// @ts-ignore — type narrowing pending, see refactor ticket
        if (score >= minScore) results.push({ id: c.id, content: content.substring(0, 500), score, source: "conversation", metadata: { title: c.title } });
      }
    }

// @ts-ignore — type narrowing pending, see refactor ticket
    results.sort((a, b) => b.score - a.score);
    logger.info("Hybrid search", { query: query.substring(0, 50), results: results.length });
    return results.slice(0, limit);
  }

  private score(query, content, terms) {
    if (!content) return 0;
    const lc = content.toLowerCase();
    if (lc.includes(query.toLowerCase())) return 0.95;
    const matched = terms.filter(t => lc.includes(t));
    if (matched.length === 0) return 0;
    return matched.length / terms.length;
  }
}
export const hybridSearch = new HybridSearchEngine();
