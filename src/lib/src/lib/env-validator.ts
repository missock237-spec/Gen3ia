import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL requise"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire 32+ caractères"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET doit faire 32+ caractères"),
  REDIS_URL: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  VERCEL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  OTEL_ENABLED: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let parsedEnv: Env | null = null;

export function getEnv(): Env {
  if (!parsedEnv) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const missing = result.error.errors
        .filter((e) => e.message.includes("requise"))
        .map((e) => e.path.join("."));
      if (missing.length > 0) {
        console.warn(`⚠️ Variables manquantes: ${missing.join(", ")}`);
      }
      parsedEnv = result.data as Env;
    } else {
      parsedEnv = result.data;
    }
  }
  return parsedEnv!;
}

export const env = getEnv();
