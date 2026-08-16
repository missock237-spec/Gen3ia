import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface FeedbackInput {
  agentId: string;
  executionId: string;
  userId: string;
  rating: number;
  comment?: string;
}

interface FeedbackResult {
  score: number;
  adjustment: number;
}

interface AgentStats {
  average: number;
  count: number;
  distribution: Record<number, number>;
}

export class FeedbackLoop {
  async submit(input: FeedbackInput): Promise<FeedbackResult> {
    const { agentId, executionId, userId, rating, comment } = input;
    const action = rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";

    await prisma.agentActionLog.create({
      data: {
        agentId, userId,
        action: `feedback_${action}`,
        details: JSON.stringify({ rating, comment, executionId }),
        status: "completed",
        result: `rating:${rating}`,
        resolvedAt: new Date(),
      },
    });

    const recentMemories = await prisma.agentMemory.findMany({
      where: { agentId, userId },
      take: 10,
      orderBy: { lastAccessedAt: "desc" },
    });

    for (const memory of recentMemories) {
      const delta = rating >= 4 ? 0.05 : rating <= 2 ? -0.05 : 0;
      await prisma.agentMemory.update({
        where: { id: memory.id },
        data: { relevance: Math.max(0, Math.min(1, memory.relevance + delta)) },
      });
    }

    if (comment && comment.length > 10) {
      await prisma.knowledge.create({
        data: { content: `Feedback: ${comment}`, category: "feedback", source: "user", relevance: 0.5, userId },
      }).catch((err) => logger.warn("Failed to store feedback knowledge", { error: err }));
    }

    const adjustment = rating >= 4 ? 0.1 : rating <= 2 ? -0.1 : 0;
    logger.info("Feedback submitted", { agentId, userId, rating, adjustment });
    return { score: rating, adjustment };
  }

  async getAgentStats(agentId: string): Promise<AgentStats> {
    const logs = await prisma.agentActionLog.findMany({
      where: { agentId, action: { startsWith: "feedback_" } },
      select: { details: true },
      take: 100,
    });

    const ratings: number[] = [];
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const log of logs) {
      try {
        const details = JSON.parse(log.details);
        if (typeof details.rating === "number" && details.rating >= 1 && details.rating <= 5) {
          ratings.push(details.rating);
          distribution[details.rating]++;
        }
      } catch {}
    }

    const average = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    return { average, count: ratings.length, distribution };
  }
}

export const feedbackLoop = new FeedbackLoop();
