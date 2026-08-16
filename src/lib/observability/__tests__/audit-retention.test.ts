import { describe, it, expect } from "vitest";
import { buildAuditEntry, computeExpiry, isExpired } from "../audit-retention";

describe("rétention des logs d'audit", () => {
  const now = new Date("2026-08-12T00:00:00Z");

  it("calcule expiresAt selon la politique credits (24 mois)", () => {
    expect(computeExpiry(now, "credits")).toBe("2028-08-12T00:00:00.000Z");
  });

  it("calcul auth (12 mois)", () => {
    expect(computeExpiry(now, "auth")).toBe("2027-08-12T00:00:00.000Z");
  });

  it("buildAuditEntry remplit id et expiresAt", () => {
    const e = buildAuditEntry({ category: "auth", actor: "user-1", action: "auth.login", ts: now.toISOString() });
    expect(e.expiresAt).toBe("2027-08-12T00:00:00.000Z");
    expect(e.id).toBeTruthy();
  });

  it("isExpired détecte l'expiration", () => {
    expect(isExpired({ expiresAt: "2025-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isExpired({ expiresAt: "2027-01-01T00:00:00Z" }, now)).toBe(false);
  });
});
