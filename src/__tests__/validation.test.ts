// ============================================================
// Tests unitaires — Validation Zod
// ============================================================
import { describe, it, expect } from "vitest";
import { executeAgentSchema, subscribeSchema, formatZodErrors } from "@/lib/validation";

describe("Validation Agents", () => {
  it("devrait accepter une exécution valide", () => {
    const result = executeAgentSchema.parse({
      agentId: "abc123",
      input: "Bonjour, peux-tu m'aider ?",
    });
    expect(result.agentId).toBe("abc123");
    expect(result.input).toBe("Bonjour, peux-tu m'aider ?");
    expect(result.resume).toBe(false);
  });

  it("devrait rejeter un agentId vide", () => {
    expect(() => executeAgentSchema.parse({ agentId: "", input: "test" })).toThrow();
  });

  it("devrait rejeter un input vide", () => {
    expect(() => executeAgentSchema.parse({ agentId: "abc", input: "" })).toThrow();
  });

  it("devrait accepter l'option resume", () => {
    const result = executeAgentSchema.parse({
      agentId: "abc",
      input: "continue",
      resume: true,
    });
    expect(result.resume).toBe(true);
  });
});

describe("Validation Paiements", () => {
  it("devrait accepter un abonnement valide", () => {
    const result = subscribeSchema.parse({
      planId: "pro",
      phone: "+237691234567",
      operator: "mtn",
      userId: "user_123",
    });
    expect(result.planId).toBe("pro");
    expect(result.operator).toBe("mtn");
  });

  it("devrait rejeter un plan invalide", () => {
    expect(() =>
      subscribeSchema.parse({ planId: "ultra", phone: "+237691234567", operator: "mtn", userId: "u1" })
    ).toThrow();
  });

  it("devrait rejeter un téléphone invalide", () => {
    expect(() =>
      subscribeSchema.parse({ planId: "pro", phone: "123", operator: "mtn", userId: "u1" })
    ).toThrow();
  });

  it("devrait rejeter un opérateur inconnu", () => {
    expect(() =>
      subscribeSchema.parse({ planId: "pro", phone: "+237691234567", operator: "tigo", userId: "u1" })
    ).toThrow();
  });
});

describe("formatZodErrors", () => {
  it("devrait formater les erreurs", () => {
    try {
      executeAgentSchema.parse({ agentId: "", input: "" });
    } catch (error: any) {
      const formatted = formatZodErrors(error);
      expect(formatted["agentId"]).toBeDefined();
      expect(formatted["input"]).toBeDefined();
    }
  });
});