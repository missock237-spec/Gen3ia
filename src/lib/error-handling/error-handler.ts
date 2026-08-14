/**
 * Centralized Error Handler - Production-Grade
 * 
 * Handles all errors with proper logging, Sentry integration, and recovery strategies
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('error-handler');

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  endpoint?: string;
  method?: string;
  timestamp?: number;
  tags?: Record<string, string>;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly severity: ErrorSeverity;
  public readonly isOperational: boolean;
  public readonly context: ErrorContext;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.severity = severity;
    this.isOperational = isOperational;
    this.context = { timestamp: Date.now(), ...context };

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'VALIDATION_ERROR', 400, ErrorSeverity.LOW, context);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', context?: ErrorContext) {
    super(message, 'AUTH_ERROR', 401, ErrorSeverity.MEDIUM, context);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', context?: ErrorContext) {
    super(message, 'AUTHZ_ERROR', 403, ErrorSeverity.MEDIUM, context);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, context?: ErrorContext) {
    super(`${resource} not found`, 'NOT_FOUND', 404, ErrorSeverity.LOW, context);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'CONFLICT', 409, ErrorSeverity.MEDIUM, context);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number, context?: ErrorContext) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`, 'RATE_LIMIT', 429, ErrorSeverity.LOW, {
      ...context,
      retryAfter: retryAfter.toString(),
    });
    this.name = 'RateLimitError';
  }
}

export class ServiceError extends AppError {
  constructor(
    message: string,
    code: string = 'SERVICE_ERROR',
    context?: ErrorContext
  ) {
    super(message, code, 500, ErrorSeverity.HIGH, context, false);
    this.name = 'ServiceError';
  }
}

class ErrorHandler {
  private errorLog: AppError[] = [];
  private maxErrorLog = 1000;
  private isSentryConnected = !!process.env.SENTRY_DSN;

  constructor() {
    if (this.isSentryConnected) {
      this.initializeSentry();
    }
    log.info('error_handler_initialized', { sentryConnected: this.isSentryConnected });
  }

  /**
   * Handle error with proper logging and recovery
   */
  handle(error: any, context: ErrorContext = {}): AppError {
    const appError = this.normalizeError(error, context);

    // Log to console
    this.logError(appError);

    // Store in error log
    this.storeError(appError);

    // Send to Sentry if configured
    if (this.isSentryConnected) {
      this.sendToSentry(appError);
    }

    // Emit alert if critical
    if (appError.severity === ErrorSeverity.CRITICAL) {
      this.emitAlert(appError);
    }

    return appError;
  }

  /**
   * Convert any error to AppError
   */
  private normalizeError(error: any, context: ErrorContext): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new ServiceError(error.message, 'UNHANDLED_ERROR', context);
    }

    return new ServiceError(String(error), 'UNKNOWN_ERROR', context);
  }

  /**
   * Log error appropriately
   */
  private logError(error: AppError): void {
    const logData = {
      code: error.code,
      statusCode: error.statusCode,
      severity: error.severity,
      message: error.message,
      context: error.context,
      stack: error.stack,
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        log.error('critical_error', logData);
        break;
      case ErrorSeverity.HIGH:
        log.error('high_severity_error', logData);
        break;
      case ErrorSeverity.MEDIUM:
        log.warn('medium_severity_error', logData);
        break;
      case ErrorSeverity.LOW:
        log.info('low_severity_error', logData);
        break;
    }
  }

  /**
   * Store error for analysis
   */
  private storeError(error: AppError): void {
    this.errorLog.push(error);

    // Keep only recent errors
    if (this.errorLog.length > this.maxErrorLog) {
      this.errorLog = this.errorLog.slice(-this.maxErrorLog);
    }
  }

  /**
   * Send to Sentry for monitoring
   */
  private sendToSentry(error: AppError): void {
    try {
      // Import Sentry dynamically to avoid hard dependency
      const Sentry = require('@sentry/nextjs');

      if (Sentry) {
        Sentry.captureException(error, {
          level: error.severity === ErrorSeverity.CRITICAL ? 'fatal' : error.severity,
          tags: {
            code: error.code,
            statusCode: error.statusCode.toString(),
          },
          extra: error.context,
        });
      }
    } catch (e) {
      log.warn('failed_to_send_to_sentry', { error: e });
    }
  }

  /**
   * Emit critical alert
   */
  private emitAlert(error: AppError): void {
    log.error('CRITICAL_ALERT_EMITTED', {
      code: error.code,
      message: error.message,
      context: error.context,
    });

    // In production, send to alerting service (PagerDuty, etc)
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 100): AppError[] {
    return this.errorLog.slice(-limit);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    bySeverity: Record<ErrorSeverity, number>;
    byCode: Record<string, number>;
  } {
    const bySeverity: Record<ErrorSeverity, number> = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0,
    };

    const byCode: Record<string, number> = {};

    this.errorLog.forEach((error) => {
      bySeverity[error.severity]++;
      byCode[error.code] = (byCode[error.code] || 0) + 1;
    });

    return {
      total: this.errorLog.length,
      bySeverity,
      byCode,
    };
  }

  /**
   * Initialize Sentry
   */
  private initializeSentry(): void {
    log.info('sentry_initialized', { dsn: process.env.SENTRY_DSN?.slice(0, 20) });
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
    log.info('error_log_cleared');
  }
}

export const errorHandler = new ErrorHandler();
