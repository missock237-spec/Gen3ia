import { z } from 'zod';

/**
 * Centralized environment variable validation schema
 * Ensures all required variables are present and valid at startup
 * 
 * CRITICAL: This runs during instrumentation.ts (before any requests)
 * If validation fails, the application will not start
 */

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL: z.string().optional(),
  
  // Authentication & Security
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters (use `openssl rand -base64 32`)'),
  AUTH_TRUST_HOST: z.string().default('true'),
  JWT_EXPIRATION: z.string().default('30d'),
  
  // Database
  DATABASE_URL: z.string().url('Invalid DATABASE_URL format'),
  DATABASE_POOL_SIZE: z.string().default('10').transform(Number),
  DATABASE_TIMEOUT: z.string().default('5000').transform(Number),
  
  // Redis (optional but recommended)
  REDIS_URL: z.string().url().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.enum(['true', 'false']).optional(),
  
  // LLM Providers (at least one required)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  HUGGINGFACE_TOKEN: z.string().optional(),
  
  // Payment Processing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  SEBPAY_SECRET_KEY: z.string().optional(),
  
  // Email Service (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().transform(v => v ? Number(v) : undefined),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  
  // Analytics & Monitoring
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  LOKI_URL: z.string().url().optional(),
  PROMETHEUS_PUSHGATEWAY_URL: z.string().url().optional(),
  
  // Third-party Services
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  
  // Feature Flags
  FEATURE_RATE_LIMITING: z.enum(['true', 'false']).default('true'),
  FEATURE_AUDIT_TRAIL: z.enum(['true', 'false']).default('true'),
  FEATURE_CIRCUIT_BREAKER: z.enum(['true', 'false']).default('true'),
  
  // Performance
  CACHE_TTL_SHORT: z.string().default('300').transform(Number), // 5 min
  CACHE_TTL_MEDIUM: z.string().default('1800').transform(Number), // 30 min
  CACHE_TTL_LONG: z.string().default('3600').transform(Number), // 1 hour
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number), // 1 min
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  RATE_LIMIT_PER_USER: z.string().default('1000').transform(Number),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default(process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
});

type EnvType = z.infer<typeof envSchema>;

let validatedEnv: EnvType | null = null;

/**
 * Validate environment variables at startup
 * Throws error if validation fails (prevents app from starting)
 */
export function validateEnv(): EnvType {
  if (validatedEnv) return validatedEnv;

  console.log('[ENV] Validating environment variables...');

  try {
    validatedEnv = envSchema.parse(process.env);
    
    // Warn if critical services are missing
    if (!validatedEnv.REDIS_URL && process.env.NODE_ENV === 'production') {
      console.warn('[ENV] ⚠️  REDIS_URL not configured - caching disabled in production');
    }
    
    if (!validatedEnv.OPENAI_API_KEY && !validatedEnv.ANTHROPIC_API_KEY && !validatedEnv.GROQ_API_KEY) {
      throw new Error('At least one LLM provider API key is required (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY)');
    }

    console.log('[ENV] ✓ All environment variables validated successfully');
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('\n');
      
      throw new Error(`Environment validation failed:\n${missingVars}`);
    }
    throw error;
  }
}

/**
 * Get typed environment variables
 * Safe to call after validateEnv()
 */
export function getEnv(): EnvType {
  if (!validatedEnv) {
    validateEnv();
  }
  return validatedEnv!;
}

/**
 * Get a specific environment variable
 */
export function getEnvVar<K extends keyof EnvType>(key: K): EnvType[K] {
  const env = getEnv();
  return env[key];
}

// Export for use in condition checks
export const env = new Proxy({} as EnvType, {
  get: (target, prop: string | symbol) => {
    if (typeof prop === 'string') {
      return getEnvVar(prop as keyof EnvType);
    }
    return undefined;
  },
});

export default envSchema;
