import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export class FeedbackLoop {
  async submit(input) {
    const { agentId, executionId, userId, rating, comment } = input;
    await prisma.agentActionLog.create({
      data: { agentId, action: "feedback_" + (rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral"), details: JSON.stringify({ rating, comment, executionId }), status: "completed", result: "rating:" + rating, userId, resolvedAt: new Date() },
    });
    if (rating >= 4) {
      const mems = await prisma.agentMemory.findMany({ where: { agentId, userId }, take: 10, orderBy: { lastAccessedAt: "desc" } });
      for (const m of mems) await prisma.agentMemory.update({ where: { id: m.id }, data: { relevance: Math.min(1, m.relevance + 0.05) } });
    } else if (rating <= 2) {
      const mems = await prisma.agentMemory.findMany({ where: { agentId, userId }, take: 10, orderBy: { lastAccessedAt: "desc" } });
      for (const m of mems) await prisma.agentMemory.update({ where: { id: m.id }, data: { relevance: Math.max(0, m.relevance - 0.05) } });
    }
    if (comment && comment.length > 10) {
      await prisma.knowledge.create({ data: { content: "Feedback: " + comment, category: "feedback", source: "user", relevance: 0.5, userId } }).catch(() => {});
    }
    return { score: rating, adjustment: rating >= 4 ? 0.1 : rating <= 2 ? -0.1 : 0 };
  }

  async getAgentStats(agentId) {
    const logs = await prisma.agentActionLog.findMany({ where: { agentId, action: { startsWith: "feedback_" } }, select: { details: true }, take: 100 });
    const ratings = [];
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const l of logs) { try { const d = JSON.parse(l.details); if (d.rating) { ratings.push(d.rating); dist[d.rating]++; } } catch {} }
    return { average: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0, count: ratings.length, distribution: dist };
  }
}
export const feedbackLoop = new FeedbackLoop();
