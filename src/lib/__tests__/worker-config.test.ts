import { describe, it, expect } from "vitest";
import { desiredWorkers } from "../worker-dynamic-config";
import type { WorkerConfig } from "../worker-dynamic-config";

const cfg: WorkerConfig = { agentId: "a1", minWorkers: 1, maxWorkers: 4, concurrency: 2, queue: "q", active: true };

describe("workers dynamiques", () => {
  it("respecte le minimum même sans charge", () => {
    expect(desiredWorkers(cfg, 0)).toBe(1);
  });

  it("monte avec la charge (ceil(jobs/concurrency))", () => {
    expect(desiredWorkers(cfg, 6)).toBe(3);
    expect(desiredWorkers(cfg, 2)).toBe(1);
  });

  it("plafonne au maxWorkers", () => {
    expect(desiredWorkers(cfg, 100)).toBe(4);
  });

  it("désactive les workers si active=false", () => {
    expect(desiredWorkers({ ...cfg, active: false }, 50)).toBe(0);
  });
});
