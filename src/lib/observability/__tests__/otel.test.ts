import { describe, it, expect } from "vitest";
import { withSpan } from "../trace";
import { initTelemetry } from "../otel-config";

describe("OpenTelemetry helpers", () => {
  it("initialise (ou revient à no-op) sans crasher", () => {
    expect([null, expect.anything()]).toContain(initTelemetry());
  });

  it("withSpan retourne la valeur du callback", async () => {
    const r = await withSpan("t1", () => 42);
    expect(r).toBe(42);
  });

  it("withSpan propage l'erreur", async () => {
    await expect(withSpan("t2", () => { throw new Error("boom"); }))
      .rejects.toThrow("boom");
  });
});
