import { describe, it, expect } from "vitest";
import { rateLimit } from "../rate-limit";

describe("rateLimit (mémoire)", () => {
  it("autorise jusqu'au max", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await rateLimit({ key: "u1", windowSec: 60, max: 5 });
      expect(r.ok).toBe(true);
    }
  });

  it("bloque au-delà du max", async () => {
    const mk = `u-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 3; i++) await rateLimit({ key: mk, windowSec: 60, max: 3 });
    const r = await rateLimit({ key: mk, windowSec: 60, max: 3 });
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("bypass ignore la limite", async () => {
    const r = await rateLimit({ key: "bypass-user", windowSec: 10, max: 1, bypass: true });
    expect(r.ok).toBe(true);
  });

  it("dissocie les clés différentes", async () => {
    await rateLimit({ key: "a", windowSec: 60, max: 1 });
    const r = await rateLimit({ key: "b", windowSec: 60, max: 1 });
    expect(r.ok).toBe(true);
  });
});
