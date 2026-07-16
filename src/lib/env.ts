/**
 * Genova - Centralized Environment Variables
 *
 * Maps all environment variables to a typed object.
 * Supports legacy naming (from GitHub Secrets) with fallbacks.
 */

export const env = {
  // =============================================
  // Database
  // =============================================
  databaseUrl: process.env.DATABASE_URL || "",
  genovaDatabaseUrl: process.env.GENOVA_DATABASE_URL || "",
  postgresUser: process.env.POSTGRES_USER || "",
  postgresPassword: process.env.POSTGRES_PASSWORD || "",
  postgresDb: process.env.POSTGRES_DB || "",

  // =============================================
  // Redis
  // =============================================
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",

  // =============================================
  // Supabase
  // =============================================
  supabaseUrl:
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.URL_ANON_SUPABASE ||
    "",
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.CL_SECRET_SUPABASE ||
    "",

  // =============================================
  // AI Providers (priorité : Groq → Gemini → OpenRouter)
  // =============================================
  groqApiKey: process.env.GROQ_API_KEY || "",
  geminiApiKey:
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",

  // =============================================
  // Image & Video Generation
  // =============================================
  huggingFaceApiKey:
    process.env.HUGGINGFACE_API_KEY ||
    process.env.HF_API_KEY ||
    process.env.HUGGING_FACE ||
    "",
  replicateApiToken: process.env.REPLICATE_API_TOKEN || "",

  // =============================================
  // Web Search
  // =============================================
  serpApiKey: process.env.SERPAPI_KEY || "",

  // =============================================
  // Audio Transcription
  // =============================================
  assemblyAiApiKey: process.env.ASSEMBLYAI_API_KEY || "",

  // =============================================
  // Financial Data
  // =============================================
  alphaVantageKey: process.env.ALPHA_VANTAGE_KEY || "",

  // =============================================
  // PDF / Document Generation
  // =============================================
  apiTemplateKey: process.env.APITEMPLATE_API_KEY || "",

  // =============================================
  // Auth Security
  // =============================================
  authSalt: process.env.AUTH_SALT || "",
  jwtSecret: process.env.JWT_SECRET || "",
  sessionSecret: process.env.SESSION_SECRET || "",

  // =============================================
  // Email
  // =============================================
  resendApiKey: process.env.RESEND_API_KEY || "",

  // =============================================
  // Stripe
  // =============================================
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  stripeStarterPriceId: process.env.STRIPE_STARTER_PRICE_ID || "",
  stripeProPriceId: process.env.STRIPE_PRO_PRICE_ID || "",
  stripeEnterprisePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
  stripeCredits100PriceId: process.env.STRIPE_CREDITS_100_PRICE_ID || "",
  stripeCredits500PriceId: process.env.STRIPE_CREDITS_500_PRICE_ID || "",
  stripeCredits2000PriceId: process.env.STRIPE_CREDITS_2000_PRICE_ID || "",
  stripeCredits5000PriceId: process.env.STRIPE_CREDITS_5000_PRICE_ID || "",

  // =============================================
  // AdSense
  // =============================================
  adsenseClientId: process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || "",
  adsenseAdSlot: process.env.NEXT_PUBLIC_ADSENSE_AD_SLOT || "",

  // =============================================
  // WhatsApp
  // =============================================
  whatsappApiToken: process.env.WHATSAPP_API_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",

  // =============================================
  // GPU / Services
  // =============================================
  comfyUiApiUrl: process.env.COMFYUI_API_URL || "http://gpu-server:8188",
  speechBrainApiUrl: process.env.SPEECHBRAIN_API_URL || "http://gpu-server:8187",
  videoApiUrl: process.env.VIDEO_API_URL || "http://gpu-server:8189",
  rufloMcpUrl: process.env.RUFLO_MCP_URL || "http://localhost:8190",
  pocketbaseUrl: process.env.POCKETBASE_URL || "http://localhost:8090",
  baileysApiUrl: process.env.BAILEYS_API_URL || "http://localhost:8186",

  // =============================================
  // Qdrant
  // =============================================
  qdrantUrl: process.env.QDRANT_URL || "http://localhost:6333",
  qdrantApiKey: process.env.QDRANT_API_KEY || "",
  vectorStoreType: process.env.VECTOR_STORE_TYPE || "qdrant",

  // =============================================
  // Monitoring
  // =============================================
  otelExporterEndpoint:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318",
  otelServiceName: process.env.OTEL_SERVICE_NAME || "genova-backend",
  otelTracingEnabled: process.env.OTEL_TRACING_ENABLED === "true",
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || "",

  // =============================================
  // Grafana
  // =============================================
  grafanaAdminUser: process.env.GRAFANA_ADMIN_USER || "admin",
  grafanaAdminPassword: process.env.GRAFANA_ADMIN_PASSWORD || "change_me",

  // =============================================
  // AI Security Limits
  // =============================================
  maxImagesPerHour: parseInt(process.env.MAX_IMAGES_PER_HOUR || "10", 10),
  maxVideosPerHour: parseInt(process.env.MAX_VIDEOS_PER_HOUR || "5", 10),
  maxAiChatPerMinute: parseInt(process.env.MAX_AI_CHAT_PER_MINUTE || "60", 10),
  maxAiCodePerMinute: parseInt(process.env.MAX_AI_CODE_PER_MINUTE || "30", 10),
  maxFileUploadSizeMb: parseInt(
    process.env.MAX_FILE_UPLOAD_SIZE_MB || "50",
    10
  ),

  // =============================================
  // App Settings
  // =============================================
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV || "development",
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000",
  trustProxy: process.env.TRUST_PROXY !== "false",
  logLevel: process.env.LOG_LEVEL || "debug",

  // =============================================
  // Cookies
  // =============================================
  cookieSecure: process.env.COOKIE_SECURE === "true",
  sessionCookieSameSite:
    (process.env.SESSION_COOKIE_SAMESITE as "lax" | "strict" | "none") ||
    "lax",

  // =============================================
  // Docker
  // =============================================
  postgresImageTag: process.env.POSTGRES_IMAGE_TAG || "16-alpine",
  redisImageTag: process.env.REDIS_IMAGE_TAG || "7-alpine",
  qdrantImageTag: process.env.QDRANT_IMAGE_TAG || "1.9.5",
  pocketbaseImageTag: process.env.POCKETBASE_IMAGE_TAG || "latest",
  prometheusImageTag: process.env.PROMETHEUS_IMAGE_TAG || "latest",
  grafanaImageTag: process.env.GRAFANA_IMAGE_TAG || "latest",
} as const;

/**
 * Check if a specific key is configured (not empty)
 */
export function isKeyConfigured(key: keyof typeof env): boolean {
  const value = env[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return value !== "" && value !== "change_me";
}

/**
 * Check if all required keys for AI features are configured
 */
export function isAiReady(): boolean {
  return isKeyConfigured("groqApiKey") || isKeyConfigured("geminiApiKey");
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseReady(): boolean {
  return (
    isKeyConfigured("supabaseUrl") && isKeyConfigured("supabaseAnonKey")
  );
}

/**
 * Check if Qdrant is configured
 */
export function isQdrantReady(): boolean {
  return isKeyConfigured("qdrantUrl");
}

/**
 * Check if web search is available
 */
export function isSerpApiReady(): boolean {
  return isKeyConfigured("serpApiKey");
}

/**
 * Returns a list of missing required keys
 */
export function getMissingKeys(): string[] {
  const required: (keyof typeof env)[] = [
    "databaseUrl",
    "authSalt",
  ];
  return required.filter((key) => !isKeyConfigured(key));
}
