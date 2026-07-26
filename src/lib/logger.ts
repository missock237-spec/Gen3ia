type LogLevel = 'debug' | 'info' | 'warn' | 'error';
interface LogEntry { timestamp: string; level: LogLevel; message: string; context?: Record<string, unknown>; error?: Error; service: string; }

class Logger {
  private service: string;
  private isProd = process.env.NODE_ENV === 'production';
  private isTest = process.env.NODE_ENV === 'test';

  constructor(service: string = 'genova') {
    this.service = service;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.isTest) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level, message, service: this.service, context };
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

  child(service: string): Logger { return new Logger(service); }
}

export function createLogger(service: string): Logger { return new Logger(service); }
export const logger = new Logger();