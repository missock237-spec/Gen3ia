import { describe, it, expect, vi, beforeEach } from "vitest";
import { FeedbackLoop } from "@/lib/feedback";

vi.mock("@/lib/db", () => ({
  prisma: {
    agentActionLog: { create: vi.fn(), findMany: vi.fn() },
    agentMemory: { findMany: vi.fn(), update: vi.fn() },
    knowledge: { create: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/db";

describe("FeedbackLoop", () => {
  let feedback: FeedbackLoop;

  beforeEach(() => {
    vi.clearAllMocks();
    feedback = new FeedbackLoop();
  });

  describe("submit", () => {
    const validInput = { agentId: "agent_1", executionId: "exec_1", userId: "user_1", rating: 5, comment: "Excellent service!" };

    it("should submit positive feedback", async () => {
      vi.mocked(prisma.agentActionLog.create).mockResolvedValue({} as any);
      vi.mocked(prisma.agentMemory.findMany).mockResolvedValue([{ id: "mem_1", relevance: 0.5, lastAccessedAt: new Date() }] as any);
      vi.mocked(prisma.agentMemory.update).mockResolvedValue({} as any);
      vi.mocked(prisma.knowledge.create).mockResolvedValue({} as any);

      const result = await feedback.submit(validInput);
      expect(result.score).toBe(5);
      expect(result.adjustment).toBe(0.1);
    });

    it("should submit negative feedback with adjustment", async () => {
      vi.mocked(prisma.agentActionLog.create).mockResolvedValue({} as any);
      vi.mocked(prisma.agentMemory.findMany).mockResolvedValue([] as any);
      const result = await feedback.submit({ ...validInput, rating: 1 });
      expect(result.score).toBe(1);
      expect(result.adjustment).toBe(-0.1);
    });

    it("should handle rating 3 as neutral", async () => {
      vi.mocked(prisma.agentActionLog.create).mockResolvedValue({} as any);
      vi.mocked(prisma.agentMemory.findMany).mockResolvedValue([] as any);
      const result = await feedback.submit({ ...validInput, rating: 3 });
      expect(result.adjustment).toBe(0);
    });
  });

  describe("getAgentStats", () => {
    it("should return stats with ratings", async () => {
      vi.mocked(prisma.agentActionLog.findMany).mockResolvedValue([
        { details: JSON.stringify({ rating: 5 }) },
        { details: JSON.stringify({ rating: 4 }) },
        { details: JSON.stringify({ rating: 3 }) },
      ] as any);
      const stats = await feedback.getAgentStats("agent_1");
      expect(stats.count).toBe(3);
      expect(stats.average).toBeCloseTo(4, 0);
    });

    it("should handle no ratings", async () => {
      vi.mocked(prisma.agentActionLog.findMany).mockResolvedValue([] as any);
      const stats = await feedback.getAgentStats("agent_1");
      expect(stats.count).toBe(0);
      expect(stats.average).toBe(0);
    });
  });
});
