// ============================================================
// Gen3ia Evolution Engine — Tests: config
// ============================================================
// Pure-function tests (no DB, no LLM, no git).
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  isProtectedPath,
  inferSafetyLevel,
  PROTECTED_PATHS,
  SAFETY_LEVELS,
  EvolutionEnvSchema,
} from '../config';

describe('Evolution config — isProtectedPath', () => {
  it('flags auth.ts as protected', () => {
    expect(isProtectedPath('src/lib/firebase/auth.ts')).toBe(true);
  });
  it('flags middleware.ts as protected', () => {
    expect(isProtectedPath('src/middleware.ts')).toBe(true);
  });
  it('flags .env files as protected', () => {
    expect(isProtectedPath('.env')).toBe(true);
    expect(isProtectedPath('.env.local')).toBe(true);
    expect(isProtectedPath('.env.production')).toBe(true);
  });
  it('flags vercel.json as protected', () => {
    expect(isProtectedPath('vercel.json')).toBe(true);
  });
  it('flags .github/workflows/*.yml as protected', () => {
    expect(isProtectedPath('.github/workflows/ci.yml')).toBe(true);
    expect(isProtectedPath('.github/workflows/security.yml')).toBe(true);
  });
  it('flags firestore.rules as protected', () => {
    expect(isProtectedPath('firestore.rules')).toBe(true);
    expect(isProtectedPath('storage.rules')).toBe(true);
  });
  it('flags evolution engine itself as protected', () => {
    expect(isProtectedPath('src/lib/evolution/orchestrator.ts')).toBe(true);
    expect(isProtectedPath('src/lib/evolution/config.ts')).toBe(true);
  });
  it('allows non-protected paths', () => {
    expect(isProtectedPath('src/lib/foo.ts')).toBe(false);
    expect(isProtectedPath('src/app/api/agents/route.ts')).toBe(false);
    expect(isProtectedPath('docs/evolution-engine.md')).toBe(false);
  });
  it('has a non-empty PROTECTED_PATHS list', () => {
    expect(PROTECTED_PATHS.length).toBeGreaterThan(0);
  });
});

describe('Evolution config — inferSafetyLevel', () => {
  it('infers L1 for test files', () => {
    expect(inferSafetyLevel('src/lib/foo.test.ts', 'modification')).toBe(1);
    expect(inferSafetyLevel('src/lib/foo.spec.ts', 'modification')).toBe(1);
  });
  it('infers L1 for docs', () => {
    expect(inferSafetyLevel('docs/foo.md', 'modification')).toBe(1);
    expect(inferSafetyLevel('README.md', 'modification')).toBe(1);
  });
  it('infers L3 for protected paths', () => {
    expect(inferSafetyLevel('src/lib/firebase/auth.ts', 'modification')).toBe(3);
    expect(inferSafetyLevel('src/middleware.ts', 'modification')).toBe(3);
    expect(inferSafetyLevel('.env', 'modification')).toBe(3);
  });
  it('infers L3 for DB schema', () => {
    expect(inferSafetyLevel('prisma/schema.prisma', 'modification')).toBe(3);
  });
  it('infers L3 for firebase infra', () => {
    expect(inferSafetyLevel('src/lib/firebase/firestore.ts', 'modification')).toBe(3);
  });
  it('infers L3 for billing infra', () => {
    expect(inferSafetyLevel('src/lib/billing/credit-engine.ts', 'modification')).toBe(3);
  });
  it('infers L3 for security primitives', () => {
    expect(inferSafetyLevel('src/lib/security/vault.ts', 'modification')).toBe(3);
  });
  it('infers L2 for prompts/templates', () => {
    expect(inferSafetyLevel('src/lib/prompts/foo.ts', 'modification')).toBe(2);
    expect(inferSafetyLevel('src/lib/templates/foo.ts', 'modification')).toBe(2);
  });
  it('infers L2 by default for regular source files', () => {
    expect(inferSafetyLevel('src/app/api/agents/route.ts', 'modification')).toBe(2);
  });
  it('infers L3 for deployment phase regardless of file', () => {
    expect(inferSafetyLevel('src/app/foo.ts', 'deployment')).toBe(3);
  });
});

describe('Evolution config — SAFETY_LEVELS', () => {
  it('exports L1=1, L2=2, L3=3', () => {
    expect(SAFETY_LEVELS.L1).toBe(1);
    expect(SAFETY_LEVELS.L2).toBe(2);
    expect(SAFETY_LEVELS.L3).toBe(3);
  });
});

describe('Evolution config — EvolutionEnvSchema', () => {
  it('parses a full env', () => {
    const env = EvolutionEnvSchema.parse({
      EVOLUTION_ENABLED: 'true',
      EVOLUTION_MAX_COST_USD: '10',
      EVOLUTION_MAX_TOKENS: '500000',
      EVOLUTION_MAX_DURATION_MS: '1800000',
      EVOLUTION_GITHUB_TOKEN: 'ghp_xxx',
      EVOLUTION_GITHUB_OWNER: 'missock237-spec',
      EVOLUTION_GITHUB_REPO: 'Gen3ia',
      EVOLUTION_TARGET_BRANCH: 'main',
      EVOLUTION_MAX_CONCURRENT: '2',
      EVOLUTION_DRY_RUN: '0',
    });
    expect(env.EVOLUTION_ENABLED).toBe(true);
    expect(env.EVOLUTION_MAX_COST_USD).toBe(10);
    expect(env.EVOLUTION_MAX_TOKENS).toBe(500000);
    expect(env.EVOLUTION_GITHUB_TOKEN).toBe('ghp_xxx');
    expect(env.EVOLUTION_DRY_RUN).toBe(false);
  });
  it('defaults EVOLUTION_TARGET_BRANCH to main', () => {
    const env = EvolutionEnvSchema.parse({});
    expect(env.EVOLUTION_TARGET_BRANCH).toBe('main');
  });
  it('defaults EVOLUTION_MAX_CONCURRENT to 1', () => {
    const env = EvolutionEnvSchema.parse({});
    expect(env.EVOLUTION_MAX_CONCURRENT).toBe(1);
  });
  it('treats EVOLUTION_ENABLED missing as enabled', () => {
    const env = EvolutionEnvSchema.parse({});
    expect(env.EVOLUTION_ENABLED).toBe(true);
  });
  it('treats EVOLUTION_ENABLED=0 as disabled', () => {
    const env = EvolutionEnvSchema.parse({ EVOLUTION_ENABLED: '0' });
    expect(env.EVOLUTION_ENABLED).toBe(false);
  });
  it('treats EVOLUTION_DRY_RUN=1 as true', () => {
    const env = EvolutionEnvSchema.parse({ EVOLUTION_DRY_RUN: '1' });
    expect(env.EVOLUTION_DRY_RUN).toBe(true);
  });
});
