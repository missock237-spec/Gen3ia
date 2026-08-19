// ============================================================
// Gen3ia Evolution Engine — Configuration
// ============================================================
// Single source of truth for runtime configuration.
// All values can be overridden via env vars (no hardcode of secrets).
// ============================================================

import { z } from 'zod';

// ----- Safety levels -----

export const SAFETY_LEVELS = {
  L1: 1, // Auto-OK (low-risk: comments, prompts, tests)
  L2: 2, // Enhanced validation (medium-risk: bug fixes, perf)
  L3: 3, // Human approval required (auth, DB schema, infra, secrets)
} as const;

// Files / patterns the engine is **never** allowed to modify.
export const PROTECTED_PATHS: readonly RegExp[] = [
  // Authentication & session
  /^src\/lib\/firebase\/auth\.ts$/,
  /^src\/lib\/firebase\/admin\.ts$/,
  /^src\/lib\/session\.ts$/,
  /^src\/middleware\.ts$/,
  // Secrets / env
  /^\.env(\..*)?$/,
  /^src\/lib\/env-validation\.ts$/,
  /^src\/lib\/env\.ts$/,
  // CI / deployment
  /^\.github\/workflows\//,
  /^vercel\.json$/,
  /^firebase\.json$/,
  /^firestore\.rules$/,
  /^storage\.rules$/,
  /^firestore\.indexes\.json$/,
  // Rollback / audit / evolution engine itself
  /^src\/lib\/evolution\//,
  /^src\/lib\/security\/audit-trail\.ts$/,
  /^src\/lib\/security\/vault\.ts$/,
  /^src\/lib\/security\/key-rotation\.ts$/,
];

// Phases that **require** L3 human approval, regardless of target file.
export const L3_PHASES: ReadonlySet<string> = new Set([
  'deployment', // prod deploy
]);

// File patterns that imply L3 risk regardless of declared phase.
export const L3_PATH_PATTERNS: readonly RegExp[] = [
  /^prisma\/schema\.prisma$/, // DB schema
  /^src\/lib\/firebase\//, // Firebase infra
  /^src\/lib\/billing\//, // payments / credits
  /^src\/lib\/security\//, // security primitives
];

// ----- Budget & cost limits -----

export const BUDGET_DEFAULTS = {
  maxCostPerEvolutionUsd: 5, // hard ceiling per evolution run
  maxTokensPerEvolution: 250_000,
  maxDurationMs: 30 * 60 * 1000, // 30 min wall clock
  maxLLMRetries: 3,
  llmRetryBackoffMs: 1500,
} as const;

// ----- Retry & timeout -----

export const RETRY_DEFAULTS = {
  maxRetries: 2, // orchestrator-level retries on transient failures
  backoffMs: 3000,
} as const;

export const SANDBOX_DEFAULTS = {
  timeoutMs: 5 * 60 * 1000, // 5 min hard ceiling for any sandboxed command
  maxStdoutBytes: 4 * 1024 * 1024, // 4 MiB
  maxStderrBytes: 4 * 1024 * 1024, // 4 MiB
  /** Env var names that are FORBIDDEN inside the sandbox. */
  forbiddenEnvSubstrings: [
    'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_PRIVATE_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GROQ_API_KEY',
    'HUGGINGFACE',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'CHARIOW',
    'CAMPAY',
    'TWILIO',
    'WHATSAPP',
    'AUTH_SECRET',
    'VAULT_MASTER_KEY',
    'SNYK_TOKEN',
    'INTERNAL_SERVICE_SECRET',
    'CRON_SECRET',
    'OTP_HASH_SECRET',
    'UPSTASH_REDIS_REST_TOKEN',
    'SENTRY_DSN',
    'LOKI_PASSWORD',
    'GRAFANA_LOKI_TOKEN',
  ],
} as const;

// ----- Validation pipeline -----

export const VALIDATION_PIPELINE = [
  'install',
  'typecheck',
  'lint',
  'unit',
  'build',
  'security',
] as const;

// ----- Zod schema for env validation (extend at app startup) -----

export const EvolutionEnvSchema = z.object({
  EVOLUTION_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== '0' && v !== 'false' && v !== undefined ? true : v === undefined ? true : false),
  EVOLUTION_MAX_COST_USD: z.coerce.number().positive().default(BUDGET_DEFAULTS.maxCostPerEvolutionUsd),
  EVOLUTION_MAX_TOKENS: z.coerce.number().positive().default(BUDGET_DEFAULTS.maxTokensPerEvolution),
  EVOLUTION_MAX_DURATION_MS: z.coerce.number().positive().default(BUDGET_DEFAULTS.maxDurationMs),
  EVOLUTION_GITHUB_TOKEN: z.string().optional(),
  EVOLUTION_GITHUB_OWNER: z.string().optional(),
  EVOLUTION_GITHUB_REPO: z.string().optional(),
  EVOLUTION_TARGET_BRANCH: z.string().default('main'),
  EVOLUTION_MAX_CONCURRENT: z.coerce.number().positive().default(1),
  EVOLUTION_DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export type EvolutionEnv = z.infer<typeof EvolutionEnvSchema>;

// NOTE: no caching — `EVOLUTION_DRY_RUN` and friends may change between
// test cases. Cheap to re-parse on every call.
export function getEvolutionEnv(): EvolutionEnv {
  const parsed = EvolutionEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail-safe defaults (engine will be disabled if EVOLUTION_ENABLED is 0).
    return EvolutionEnvSchema.parse({
      EVOLUTION_ENABLED: true,
      EVOLUTION_DRY_RUN: '1',
    });
  }
  return parsed.data;
}

// ----- Concurrency -----

export const LOCK_TTL_MS = 5 * 60 * 1000; // locks auto-expire after 5 min
export const LOCK_HEARTBEAT_MS = 30 * 1000; // heartbeat every 30s

// ----- Branch prefix -----

export const EVOLUTION_BRANCH_PREFIX = 'evolution/';

// ----- Helpers -----

export function isProtectedPath(filePath: string): boolean {
  return PROTECTED_PATHS.some((re) => re.test(filePath));
}

export function inferSafetyLevel(filePath: string, phase: string): 1 | 2 | 3 {
  if (L3_PHASES.has(phase)) return 3;
  if (L3_PATH_PATTERNS.some((re) => re.test(filePath))) return 3;
  if (isProtectedPath(filePath)) return 3;
  if (/\.(test|spec)\.(ts|tsx|js)$/.test(filePath)) return 1;
  if (/^docs\//.test(filePath)) return 1;
  if (/\.md$/.test(filePath)) return 1;
  if (/^src\/lib\/(prompts|templates)\//.test(filePath)) return 2;
  return 2;
}
