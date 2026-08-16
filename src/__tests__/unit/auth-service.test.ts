import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserService } from "@/lib/services/user-service";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed_password"),
  verifyPassword: vi.fn(),
  signToken: vi.fn().mockReturnValue("mock_token"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/db";

describe("UserService", () => {
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserService();
  });

  describe("create", () => {
    const validInput = {
      name: "Test User",
      email: "test@example.com",
      password: "StrongP@ss1",
    };

    it("should create a user successfully", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "user_1",
        name: "Test User",
        email: "test@example.com",
        role: "user",
        plan: "free",
        createdAt: new Date(),
      });

      const result = await service.create(validInput);
      expect(result).toBeDefined();
      expect(result.email).toBe("test@example.com");
    });

    it("should reject duplicate email", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing", email: "test@example.com" } as any);
      await expect(service.create(validInput)).rejects.toThrow("Email déjà utilisé");
    });

    it("should reject empty name", async () => {
      await expect(service.create({ ...validInput, name: "" })).rejects.toThrow();
    });
  });

  describe("authenticate", () => {
    it("should authenticate valid credentials", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1", email: "test@example.com", name: "Test", passwordHash: "hashed", role: "user", plan: "free" } as any);
      const { verifyPassword } = await import("@/lib/auth/auth");
      vi.mocked(verifyPassword).mockResolvedValue(true);
      const result = await service.authenticate("test@example.com", "password");
      expect(result.token).toBe("mock_token");
    });

    it("should reject invalid password", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1", email: "test@example.com", passwordHash: "hashed" } as any);
      const { verifyPassword } = await import("@/lib/auth/auth");
      vi.mocked(verifyPassword).mockResolvedValue(false);
      await expect(service.authenticate("test@example.com", "wrong")).rejects.toThrow("Identifiants invalides");
    });
  });
});
