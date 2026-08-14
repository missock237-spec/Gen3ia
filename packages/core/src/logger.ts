// ============================================================
// Core Logger — Logger simple pour packages/core
// ============================================================

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const CURRENT_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

class Logger {
  constructor(private service: string) {}

  private log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LEVEL]) return;
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level, service: this.service, message, ...context,
    });
    console[level](entry);
  }

  debug = (msg: string, ctx?: Record<string, unknown>) => this.log('debug', msg, ctx);
  info = (msg: string, ctx?: Record<string, unknown>) => this.log('info', msg, ctx);
  warn = (msg: string, ctx?: Record<string, unknown>) => this.log('warn', msg, ctx);
  error = (msg: string, ctx?: Record<string, unknown>) => this.log('error', msg, ctx);
}

export function createLogger(service: string): Logger {
  return new Logger(service);
}

export const logger = createLogger('gen3ia-core');
