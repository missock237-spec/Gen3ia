// ============================================================
// Tests unitaires — Rate Limiter
// ============================================================
import { describe, it, expect, beforeAll } from "vitest";

describe("RateLimiter", () => {
  let rateLimiter: any;

  beforeAll(async () => {
    const mod = await import("@/lib/rate-limiter");
    rateLimiter = mod.rateLimiter;
  });

  it("devrait autoriser une requête normale", async () => {
    const result = await rateLimiter.check("127.0.0.1", "/api/agents");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
    expect(result.category).toBe("agent_crud");
  });

  it("devrait retourner la catégorie auth pour /api/auth/login", async () => {
    const result = await rateLimiter.check("127.0.0.1", "/api/auth/login");
    expect(result.category).toBe("auth");
    expect(result.limit).toBe(10);
  });

  it("devrait retourner agent_execute pour /api/agents/run", async () => {
    const result = await rateLimiter.check("127.0.0.1", "/api/agents/run");
    expect(result.category).toBe("agent_execute");
    expect(result.limit).toBe(20);
  });

  it("devrait retourner read pour /api/health", async () => {
    const result = await rateLimiter.check("127.0.0.1", "/api/health");
    expect(result.category).toBe("read");
    expect(result.limit).toBe(200);
  });

  it("devrait limiter après trop de requêtes sur auth", async () => {
    const results = [];
    for (let i = 0; i < 15; i++) {
      results.push(await rateLimiter.check("attacker-ip", "/api/auth/login"));
    }
    const blocked = results.filter((r: any) => !r.allowed);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it("devrait utiliser default pour les routes inconnues", async () => {
    const result = await rateLimiter.check("127.0.0.1", "/api/inconnu");
    expect(result.category).toBe("default");
    expect(result.limit).toBe(60);
  });
});