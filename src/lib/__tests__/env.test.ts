import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// =============================================
// Tests for env validation (src/lib/env.ts)
// =============================================
// These tests verify that the Zod schema correctly validates
// required and optional environment variables.

describe("env validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should accept valid environment with required DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

    // Re-import to get fresh module
    vi.resetModules();
    const { validateEnv } = require("../env");

    const env = validateEnv();
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/db");
  });

  it("should apply defaults for optional vars", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    delete process.env.REDIS_URL;
    delete process.env.QDRANT_URL;
    delete process.env.NODE_ENV;

    vi.resetModules();
    const { validateEnv } = require("../env");

    const env = validateEnv();
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.QDRANT_URL).toBe("http://localhost:6333");
    expect(env.NODE_ENV).toBe("development");
  });

  it("should coerce numeric string limits to numbers", () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
    process.env.MAX_IMAGES_PER_HOUR = "25";
    process.env.MAX_AI_CHAT_PER_MINUTE = "100";

    vi.resetModules();
    const { validateEnv } = require("../env");

    const env = validateEnv();
    expect(env.MAX_IMAGES_PER_HOUR).toBe(25);
    expect(typeof env.MAX_IMAGES_PER_HOUR).toBe("number");
    expect(env.MAX_AI_CHAT_PER_MINUTE).toBe(100);
  });

  it("should throw clear error when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;

    vi.resetModules();
    const { validateEnv } = require("../env");

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });

  it("should throw clear error when DATABASE_URL is empty", () => {
    process.env.DATABASE_URL = "   ";

    vi.resetModules();
    const { validateEnv } = require("../env");

    expect(() => validateEnv()).toThrow(/DATABASE_URL/);
  });
});
