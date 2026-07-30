// ============================================================
// Gen3ia — Logger structuré avec transport Loki
// Supporte: console (dev), Loki (prod), Sentry (errors)
// ============================================================

import { createHmac } from 'node:crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  context?: Record<string, unknown>;
  error?: Error;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

class LokiTransport {
  private url: string;
  private batch: Array<{ stream: Record<string, string>; values: Array<[string, string]> }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maxBatchSize = 100;
  private flushIntervalMs = 5000;
  private enabled: boolean;

  constructor() {
    this.url = process.env.LOKI_URL || process.env.GRAFANA_LOKI_URL || '';
    this.enabled = !!(this.url && process.env.NODE_ENV === 'production');
    if (this.enabled) {
      // Démarre le flush périodique
      this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
      // Flush à l'arrêt
      process.on('beforeExit', () => this.flush());
    }
  }

  push(entry: LogEntry): void {
    if (!this.enabled) return;

    const labels: Record<string, string> = {
      service: entry.service || 'gen3ia',
      level: entry.level,
      app: 'gen3ia',
      env: process.env.NODE_ENV || 'production',
    };

    // Labels supplémentaires pour les errors
    if (entry.level === 'error') {
      labels.error_type = 'application_error';
    }

    // JSON stringifié pour les contexts
    const logLine = entry.context
      ? JSON.stringify({ message: entry.message, ...entry.context })
      : entry.message;

    const streamKey = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    let stream = this.batch.find(s => {
      const existing = Object.entries(s.stream)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      return existing === streamKey;
    });

    if (!stream) {
      stream = { stream: labels, values: [] };
      this.batch.push(stream);
    }

    stream.values.push([`${Date.now() * 1_000_000}`, logLine]);

    if (this.batch.reduce((acc, s) => acc + s.values.length, 0) >= this.maxBatchSize) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.batch.length === 0) return;
    const batch = this.batch;
    this.batch = [];

    fetch(`${this.url}/loki/api/v1/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ streams: batch }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Silencieux — ne pas logguer une erreur de log
    });
  }

  private getAuthHeaders(): Record<string, string> {
    const user = process.env.LOKI_USER || process.env.GRAFANA_LOKI_USER || '';
    const pass = process.env.LOKI_PASSWORD || process.env.GRAFANA_LOKI_PASSWORD || '';
    if (user && pass) {
      const token = Buffer.from(`${user}:${pass}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }
    // Support Grafana Cloud
    const token = process.env.GRAFANA_LOKI_TOKEN || '';
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  }

  /**
   * Envoie un log directement à Loki (appel synchrone possible)
   * Utile pour les logs critiques avant un crash
   */
  async sendSync(entry: LogEntry): Promise<void> {
    if (!this.enabled) return;
    const labels = {
      service: entry.service || 'gen3ia',
      level: entry.level,
      app: 'gen3ia',
      env: process.env.NODE_ENV || 'production',
    };
    try {
      await fetch(`${this.url}/loki/api/v1/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
        },
        body: JSON.stringify({
          streams: [{
            stream: labels,
            values: [[`${Date.now() * 1_000_000}`, JSON.stringify({ message: entry.message, ...entry.context })]],
          }],
        }),
        signal: AbortSignal.timeout(2000),
      });
    } catch { /* silencieux */ }
  }
}

const loki = new LokiTransport();

class Logger {
  private service: string;
  private isProd = process.env.NODE_ENV === 'production';
  private isTest = process.env.NODE_ENV === 'test';

  constructor(service: string = 'gen3ia') {
    this.service = service;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LEVEL];
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.isTest || !this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      context,
    };

    // 1. Loki (prod) — transport structuré
    loki.push(entry);

    // 2. Console (dev + prod fallback)
    if (this.isProd) {
      console[level](JSON.stringify(entry));
      if (level === 'error') this.captureSentry(message, context);
    } else {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.service}]`;
      console[level](`${prefix} ${message}${context ? ' ' + JSON.stringify(context) : ''}`);
    }
  }

  private captureSentry(message: string, context?: Record<string, unknown>): void {
    try {
      const Sentry = require('@sentry/nextjs');
      if (Sentry?.captureException) {
        const error = context?.error instanceof Error ? context.error : new Error(message);
        Sentry.captureException(error, {
          level: 'error',
          tags: { service: this.service },
          extra: context || {},
        });
      }
    } catch { /* Sentry non installe */ }
  }

  debug(message: string, context?: Record<string, unknown>): void { this.log('debug', message, context); }
  info(message: string, context?: Record<string, unknown>): void { this.log('info', message, context); }
  warn(message: string, context?: Record<string, unknown>): void { this.log('warn', message, context); }
  error(message: string, context?: Record<string, unknown>): void {
    if (context?.error instanceof Error) {
      const { error, ...rest } = context;
      this.log('error', message, { ...rest, errorMessage: error.message, stack: error.stack });
    } else this.log('error', message, context);
  }

  /**
   * Envoie un log critique de maniere synchrone (avant crash/exit)
   */
  async fatalSync(message: string, context?: Record<string, unknown>): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `FATAL: ${message}`,
      service: this.service,
      context: { ...context, fatal: true },
    };
    console.error(JSON.stringify(entry));
    await loki.sendSync(entry);
  }

  child(service: string): Logger {
    return new Logger(service);
  }
}

export function createLogger(service: string): Logger {
  return new Logger(service);
}

export const logger = new Logger();
