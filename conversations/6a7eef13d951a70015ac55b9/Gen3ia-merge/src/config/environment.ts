/**
 * Environment Configuration - Multi-Environment Setup
 * 
 * Centralized configuration with validation and environment-specific settings
 */

import { z } from 'zod';
import { createLogger } from '@/lib/logger';

const log = createLogger('environment');

// Environment schema validation
const EnvironmentSchema = z.object({
  // App Config
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.string().default('20'),
  DATABASE_POOL_TIMEOUT: z.string().default('5000'),

  // Redis
  REDIS_URL: z.string().url().optional(),
  REDIS_PASSWORD: z.string().optional(),

  // Security
  LICENSE_PUBLIC_KEY: z.string(),
  LICENSE_PRIVATE_KEY: z.string(),
  JWT_SECRET: z.string().min(32),
  API_KEY_ENCRYPTION_KEY: z.string().min(32),

  // Monitoring & Observability
  SENTRY_DSN: z.string().url().optional(),
  DATADOG_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Third-party APIs
  GITHUB_PAT: z.string().optional(),
  GITHUB_PAT_2: z.string().optional(),

  // Feature Flags
  ENABLE_HYPERAGENT: z.string().default('true'),
  ENABLE_CACHING: z.string().default('true'),
  ENABLE_COMPRESSION: z.string().default('true'),

  // Performance
  MAX_REQUEST_SIZE: z.string().default('10485760'), // 10MB
  REQUEST_TIMEOUT: z.string().default('30000'),
  CACHE_TTL: z.string().default('3600000'), // 1 hour

  // Deployment
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  VERCEL_PROJECT_ID: z.string().optional(),

  // Email (for transactional emails)
  RESEND_API_KEY: z.string().optional(),

  // Analytics
  NEXT_PUBLIC_ANALYTICS_ID: z.string().optional(),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

class EnvironmentConfig {
  private config: Environment;
  private isValidated = false;

  constructor() {
    this.config = this.loadAndValidate();
    this.isValidated = true;
  }

  /**
   * Load and validate environment variables
   */
  private loadAndValidate(): Environment {
    try {
      const env = EnvironmentSchema.parse(process.env);
      log.info('environment_loaded_and_validated', { env: env.NODE_ENV });
      return env;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missingVars = error.issues.map((e) => e.path.join('.')).join(', ');
        log.error('environment_validation_failed', { missingVars });
        throw new Error(`Missing or invalid environment variables: ${missingVars}`);
      }
      throw error;
    }
  }

  /**
   * Get config value
   */
  get<K extends keyof Environment>(key: K): Environment[K] {
    if (!this.isValidated) {
      throw new Error('Environment not validated');
    }
    return this.config[key];
  }

  /**
   * Get all config
   */
  getAll(): Environment {
    return { ...this.config };
  }

  /**
   * Check if in production
   */
  isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  /**
   * Check if in development
   */
  isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development';
  }

  /**
   * Check if in staging
   */
  isStaging(): boolean {
    return this.config.NODE_ENV === 'staging';
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature: 'HYPERAGENT' | 'CACHING' | 'COMPRESSION'): boolean {
    const key = `ENABLE_${feature}` as keyof Environment;
    return this.config[key] === 'true';
  }

  /**
   * Get feature flags
   */
  getFeatureFlags() {
    return {
      hyperagent: this.isFeatureEnabled('HYPERAGENT'),
      caching: this.isFeatureEnabled('CACHING'),
      compression: this.isFeatureEnabled('COMPRESSION'),
    };
  }

  /**
   * Get numeric config
   */
  getNumber(key: string): number {
    const value = (this.config as any)[key];
    return parseInt(value, 10) || 0;
  }

  /**
   * Validate config health
   */
  validateHealth(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check critical configs
    if (!this.config.DATABASE_URL) {
      issues.push('DATABASE_URL not configured');
    }

    if (!this.config.JWT_SECRET) {
      issues.push('JWT_SECRET not configured');
    }

    if (this.isProduction()) {
      if (!this.config.SENTRY_DSN) {
        issues.push('SENTRY_DSN not configured in production');
      }

      if (this.config.LOG_LEVEL === 'debug') {
        issues.push('Log level is debug in production');
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Get database config
   */
  getDatabaseConfig() {
    return {
      url: this.config.DATABASE_URL,
      poolSize: this.getNumber('DATABASE_POOL_SIZE'),
      poolTimeout: this.getNumber('DATABASE_POOL_TIMEOUT'),
    };
  }

  /**
   * Get cache config
   */
  getCacheConfig() {
    return {
      ttl: this.getNumber('CACHE_TTL'),
      redisUrl: this.config.REDIS_URL,
      enabled: this.isFeatureEnabled('CACHING'),
    };
  }

  /**
   * Get security config
   */
  getSecurityConfig() {
    return {
      jwtSecret: this.config.JWT_SECRET,
      licensePublicKey: this.config.LICENSE_PUBLIC_KEY,
      licensePrivateKey: this.config.LICENSE_PRIVATE_KEY,
      apiKeyEncryptionKey: this.config.API_KEY_ENCRYPTION_KEY,
    };
  }

  /**
   * Log all config (sanitized for security)
   */
  logConfig(): void {
    const sanitized = {
      NODE_ENV: this.config.NODE_ENV,
      APP_URL: this.config.APP_URL,
      DATABASE_URL: '***',
      REDIS_URL: this.config.REDIS_URL ? '***' : 'not configured',
      SENTRY_DSN: this.config.SENTRY_DSN ? '***' : 'not configured',
      LOG_LEVEL: this.config.LOG_LEVEL,
      FEATURES: this.getFeatureFlags(),
    };

    log.info('active_configuration', sanitized);
  }
}

export const environmentConfig = new EnvironmentConfig();
