// ============================================================
// ENVIRONNEMENT — Validation des variables d'environnement
// ============================================================

import { z } from "zod";

const envSchema = z.object({
  // === APPLICATION ===
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // === DATABASE ===
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),

  // === AUTH ===
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères"),

  // === REDIS (optionnel) ===
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // === PAIEMENTS ===
  PAYMENT_PROVIDER: z.enum(["stripe", "sebpay"]).default("stripe"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // === EMAIL ===
  EMAIL_PROVIDER: z.enum(["resend", "nodemailer"]).default("nodemailer"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default("noreply@genova.ai"),

  // === IA ===
  AI_PROVIDER: z.enum(["openai", "openrouter", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // === STOCKAGE ===
  STORAGE_PROVIDER: z.enum(["local", "s3", "supabase"]).default("local"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Variables d'environnement invalides:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }

    if (process.env.NODE_ENV === "production") {
      throw new Error("Variables d'environnement invalides");
    }

    // En dev, on utilise des valeurs par défaut pour ne pas bloquer
    _env = {
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      LOG_LEVEL: "debug",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://localhost:5432/genova",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "dev-secret-key-32-characters-minimum!!",
      PAYMENT_PROVIDER: "stripe",
      EMAIL_PROVIDER: "nodemailer",
      EMAIL_FROM: "noreply@genova.ai",
      AI_PROVIDER: "openai",
      STORAGE_PROVIDER: "local",
    } as Env;
    return _env;
  }

  _env = result.data;
  return _env;
}

// Initialisation rapide
export const env = getEnv();