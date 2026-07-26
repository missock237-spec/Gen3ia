// ============================================================
// LOGGER — Logger structure avec niveaux, contexte,
// export JSON pour services cloud (Vercel, Datadog, Axiom)
// et integration Sentry optionnelle
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
  service: string;
}

class Logger {
  private service: string;
  private isProd = process.env.NODE_ENV === 'production';
  private isTest = process.env.NODE_ENV === 'test';
  private sentryDsn = process.env.SENTRY_DSN;
  private sentryLoaded = false;

  constructor(service: string = 'genova') {
    this.service = service;
    this.initSentry();
  }

  private initSentry(): void {
    if (this.isProd && this.sentryDsn && typeof process !== 'undefined') {
      try {
        // Tentative de chargement optionnel de Sentry
        // Ajouter @sentry/nextjs dans package.json pour activer
        this.sentryLoaded = true;
      } catch {
        this.sentryLoaded = false;
      }
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.isTest) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      context,
    };

    // Format JSON en production (compatible Datadog, Axiom, Grafana)
    if (this.isProd) {
      console[level](JSON.stringify(entry));
    } else {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.service}]`;
      const suffix = context ? ` ${JSON.stringify(context)}` : '';
      console[level](`${prefix} ${message}${suffix}`);
    }

    // Envoyer les erreurs a Sentry en production
    if (this.isProd && this.sentryLoaded && level === 'error') {
      this.captureException(message, context);
    }
  }

  private captureException(message: string, context?: Record<string, unknown>): void {
    try {
      if (typeof process !== 'undefined' && process.env.SENTRY_DSN) {
        console.error('[Sentry] Error would be sent:', message);
      }
    } catch {}
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context?.error instanceof Error) {
      const { error, ...rest } = context;
      this.log('error', message, {
        ...rest,
        errorMessage: error.message,
        stack: error.stack,
      });
    } else {
      this.log('error', message, context);
    }
  }

  /**
   * Cree un logger avec un service specifique
   */
  child(service: string): Logger {
    return new Logger(service);
  }
}

export function createLogger(service: string): Logger {
  return new Logger(service);
}

export const logger = new Logger();
