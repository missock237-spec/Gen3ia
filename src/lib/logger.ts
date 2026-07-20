// ============================================================
// LOGGER STRUCTURÉ — Remplace tous les console.log()
// ============================================================
// Format JSON : timestamp, level, service, operation
// Champs optionnels standardisés : agentId, sessionId, userId
// Niveaux : debug, info, warn, error, fatal
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation: string;
  agentId?: string;
  sessionId?: string;
  userId?: string;
  requestId?: string;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

class StructuredLogger {
  private service: string;
  private minLevel: number;

  constructor(service = "genova") {
    this.service = service;
    const envLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
    this.minLevel = LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
  }

  private baseEntry(level: LogLevel, operation: string, extras?: Partial<LogEntry>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      operation,
      ...extras,
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;
    const line = JSON.stringify(entry);
    switch (entry.level) {
      case "error":
      case "fatal":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      default:
        console.log(line);
        break;
    }
  }

  debug(operation: string, extras?: Partial<LogEntry>): void { this.output(this.baseEntry("debug", operation, extras)); }
  info(operation: string, extras?: Partial<LogEntry>): void { this.output(this.baseEntry("info", operation, extras)); }
  warn(operation: string, extras?: Partial<LogEntry>): void { this.output(this.baseEntry("warn", operation, extras)); }
  error(operation: string, extras?: Partial<LogEntry>): void { this.output(this.baseEntry("error", operation, extras)); }
  fatal(operation: string, extras?: Partial<LogEntry>): void { this.output(this.baseEntry("fatal", operation, extras)); }
}

export const logger = new StructuredLogger();
export default logger;