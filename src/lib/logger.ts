/**
 * Logger structuré avec niveaux et contexte.
 * Compatible avec les services cloud (Vercel, Datadog, etc.)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

class Logger {
  private isProd = process.env.NODE_ENV === "production";
  private isTest = process.env.NODE_ENV === "test";

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.isTest) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (this.isProd) {
      console[level](JSON.stringify(entry));
    } else {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
      const suffix = context ? ` ${JSON.stringify(context)}` : "";
      console[level](`${prefix} ${message}${suffix}`);
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context?.error instanceof Error) {
      const { error, ...rest } = context;
      this.log("error", message, {
        ...rest,
        errorMessage: error.message,
        stack: error.stack,
      });
    } else {
      this.log("error", message, context);
    }
  }
}

export const logger = new Logger();
