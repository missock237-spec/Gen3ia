import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentService } from "@/lib/services/agent-service";

vi.mock("@/lib/db", () => ({
  prisma: {
    agent: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/db";

describe("AgentService", () => {
  let service: AgentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentService();
  });

  const validAgent = {
    id: "agent_1", name: "Assistant", type: "chat", description: "Agent assistant",
    config: "{}", status: "active", avatar: null, userId: "user_1",
    createdAt: new Date(), updatedAt: new Date(), permissions: [],
  };

  describe("create", () => {
    it("should create an agent", async () => {
      vi.mocked(prisma.agent.create).mockResolvedValue(validAgent);
      const result = await service.create({ name: "Assistant", type: "chat", description: "Agent assistant", userId: "user_1" });
      expect(result).toBeDefined();
      expect(result.name).toBe("Assistant");
    });

    it("should reject empty name", async () => {
      await expect(service.create({ name: "", type: "chat", description: "test", userId: "user_1" })).rejects.toThrow();
    });
  });

  describe("getById", () => {
    it("should return agent when found", async () => {
      vi.mocked(prisma.agent.findUnique).mockResolvedValue({ ...validAgent, memories: [], executions: [] });
      const result = await service.getById("agent_1");
      expect(result).toBeDefined();
      expect(result.id).toBe("agent_1");
    });

    it("should throw when agent not found", async () => {
      vi.mocked(prisma.agent.findUnique).mockResolvedValue(null);
      await expect(service.getById("invalid")).rejects.toThrow("Agent non trouvé");
    });
  });
});
