/**
 * Logger structure — Logging avec niveaux, couleurs et contexte
 * Remplacant de console.log dans tout le projet
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';
export type LogContext = 'system' | 'sandbox' | 'realtime' | 'generator' | 'deployer' | 'agents' | 'orchestrator' | 'gateway' | 'persistence' | 'auth' | 'api';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: LogContext;
  message: string;
  data?: unknown;
  duration?: number;
  sessionId?: string;
  userId?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  success: 2,
  warn: 3,
  error: 4,
};

const CONSOLE_STYLES: Record<LogLevel, string[]> = {
  debug: ['color: #6c7086', 'background: #31324422'],
  info: ['color: #89b4fa', 'background: #89b4fa22'],
  success: ['color: #a6e3a1', 'background: #a6e3a122'],
  warn: ['color: #f9e2af', 'background: #f9e2af22'],
  error: ['color: #f38ba8', 'background: #f38ba822'],
};

const EMOJIS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '❌',
};

class Logger {
  private history: LogEntry[] = [];
  private maxHistory = 1000;
  private minLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private log(level: LogLevel, context: LogContext, message: string, data?: unknown, extra?: Partial<LogEntry>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data,
      ...extra,
    };

    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();

    const styles = CONSOLE_STYLES[level];
    const emoji = EMOJIS[level];
    const prefix = `[${entry.timestamp.slice(11, 19)}][${context}]`;

    switch (level) {
      case 'error':
        console.error(`%c${emoji} ${prefix} ${message}`, styles[0], styles[1], data || '');
        break;
      case 'warn':
        console.warn(`%c${emoji} ${prefix} ${message}`, styles[0], data || '');
        break;
      default:
        if (data) {
          console.log(`%c${emoji} ${prefix} ${message}`, styles[0], data);
        } else {
          console.log(`%c${emoji} ${prefix} ${message}`, styles[0]);
        }
    }
  }

  debug(context: LogContext, message: string, data?: unknown): void {
    this.log('debug', context, message, data);
  }

  info(context: LogContext, message: string, data?: unknown): void {
    this.log('info', context, message, data);
  }

  success(context: LogContext, message: string, data?: unknown): void {
    this.log('success', context, message, data);
  }

  warn(context: LogContext, message: string, data?: unknown): void {
    this.log('warn', context, message, data);
  }

  error(context: LogContext, message: string, data?: unknown, error?: Error): void {
    this.log('error', context, message, {
      ...(data as object || {}),
      error: error?.message,
      stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
    });
  }

  /**
   * Mesure le temps d'execution d'une fonction
   */
  async timed<T>(context: LogContext, operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.success(context, operation + ' (' + duration + 'ms)');
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(context, operation + ' a echoue (' + duration + 'ms)', {}, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Recupere l'historique des logs
   */
  getHistory(level?: LogLevel, context?: LogContext, limit = 100): LogEntry[] {
    let entries = this.history;
    if (level) entries = entries.filter(e => e.level === level);
    if (context) entries = entries.filter(e => e.context === context);
    return entries.slice(-limit);
  }

  /**
   * Configure le niveau minimum de log
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Stats des logs
   */
  stats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.history.forEach(e => {
      stats[e.level] = (stats[e.level] || 0) + 1;
      stats[e.context] = (stats[e.context] || 0) + 1;
    });
    return stats;
  }

  /**
   * Cree un logger avec un contexte fixe
   */
  forContext(context: LogContext) {
    return {
      debug: (msg: string, data?: unknown) => this.debug(context, msg, data),
      info: (msg: string, data?: unknown) => this.info(context, msg, data),
      success: (msg: string, data?: unknown) => this.success(context, msg, data),
      warn: (msg: string, data?: unknown) => this.warn(context, msg, data),
      error: (msg: string, data?: unknown, err?: Error) => this.error(context, msg, data, err),
      timed: <T>(op: string, fn: () => Promise<T>) => this.timed(context, op, fn),
    };
  }
}

export const logger = new Logger();

// Loggers pre-configures par contexte
export const log = {
  system: logger.forContext('system'),
  sandbox: logger.forContext('sandbox'),
  realtime: logger.forContext('realtime'),
  generator: logger.forContext('generator'),
  deployer: logger.forContext('deployer'),
  agents: logger.forContext('agents'),
  orchestrator: logger.forContext('orchestrator'),
  gateway: logger.forContext('gateway'),
  persistence: logger.forContext('persistence'),
  auth: logger.forContext('auth'),
  api: logger.forContext('api'),
};