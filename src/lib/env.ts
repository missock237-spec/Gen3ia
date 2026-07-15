import { z } from "zod";

// =============================================
// Genova — Validated Environment Variables
// =============================================
// All env vars are validated at first access (lazy).
// Missing required vars crash with a clear message.
// Optional vars default to safe values.

const envSchema = z.object({
  // ── Database ──
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GENOVA_DATABASE_URL: z.string().optional(),
  POSTGRES_USER: z.string().optional().default("genova"),
  POSTGRES_PASSWORD: z.string().optional(),
  POSTGRES_DB: z.string().optional().default("genova"),

  // ── Redis ──
  REDIS_URL: z.string().optional().default("redis://localhost:6379"),

  // ── AI Providers ──
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_GEMINI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // ── Image & Video ──
  HUGGINGFACE_API_KEY: z.string().optional(),
  HF_API_KEY: z.string().optional(),
  REPLICATE_API_TOKEN: z.string().optional(),

  // ── Auth Security ──
  AUTH_SALT: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),

  // ── Email ──
  RESEND_API_KEY: z.string().optional(),

  // ── Stripe ──
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_STARTER_PRICE_ID: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_100_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_500_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_2000_PRICE_ID: z.string().optional(),
  STRIPE_CREDITS_5000_PRICE_ID: z.string().optional(),

  // ── AdSense ──
  NEXT_PUBLIC_ADSENSE_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_ADSENSE_AD_SLOT: z.string().optional(),

  // ── WhatsApp ──
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),

  // ── GPU / Services ──
  COMFYUI_API_URL: z.string().optional().default("http://gpu-server:8188"),
  SPEECHBRAIN_API_URL: z.string().optional().default("http://gpu-server:8187"),
  VIDEO_API_URL: z.string().optional().default("http://gpu-server:8189"),
  RUFLO_MCP_URL: z.string().optional().default("http://localhost:8190"),
  POCKETBASE_URL: z.string().optional().default("http://localhost:8090"),
  BAILEYS_API_URL: z.string().optional().default("http://localhost:8186"),

  // ── Qdrant ──
  QDRANT_URL: z.string().optional().default("http://localhost:6333"),
  QDRANT_API_KEY: z.string().optional(),
  VECTOR_STORE_TYPE: z.string().optional().default("qdrant"),

  // ── Monitoring ──
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional().default("genova-backend"),
  OTEL_TRACING_ENABLED: z.string().optional().default("false"),
  ALERT_WEBHOOK_URL: z.string().optional(),

  // ── AI Security Limits ──
  MAX_IMAGES_PER_HOUR: z.coerce.number().optional().default(10),
  MAX_VIDEOS_PER_HOUR: z.coerce.number().optional().default(5),
  MAX_AI_CHAT_PER_MINUTE: z.coerce.number().optional().default(60),
  MAX_AI_CODE_PER_MINUTE: z.coerce.number().optional().default(30),
  MAX_FILE_UPLOAD_SIZE_MB: z.coerce.number().optional().default(50),

  // ── App Settings ──
  NEXT_PUBLIC_APP_URL: z.string().optional().default("http://localhost:3000"),
  NODE_ENV: z.string().optional().default("development"),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .default("http://localhost:3000"),
  TRUST_PROXY: z.string().optional().default("false"),
  LOG_LEVEL: z.string().optional().default("info"),

  // ── Cookies ──
  COOKIE_SECURE: z.string().optional().default("false"),
  SESSION_COOKIE_SAMESITE: z.string().optional().default("lax"),

  // ── Grafana ──
  GRAFANA_ADMIN_USER: z.string().optional().default("admin"),
  GRAFANA_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _parsed: Env | null = null;

function getEnv(): Env {
  if (!_parsed) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(
        `❌ Invalid environment variables:\n${errors}\n\nCheck your .env file or environment configuration.`
      );
    }
    _parsed = result.data;
  }
  return _parsed;
}

// =============================================
// Safe access — lazy getters
// =============================================
// Getters ensure env vars are only read at access time, not at module import.
// This prevents crashes during build or on routes that don't need all vars.

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});

// Explicit getter for DATABASE_URL (most critical)
export function getDatabaseUrl(): string {
  return getEnv().DATABASE_URL;
}

// Validate at startup (call in server entry if you want early crash)
export function validateEnv(): Env {
  return getEnv();
}
