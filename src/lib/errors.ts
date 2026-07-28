// ============================================================
// GESTION CENTRALISEE DES ERREURS API
// ============================================================
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super("NOT_FOUND", `${resource}${id ? ` (${id})` : ""} introuvable`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Non authentifie") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acces refuse") {
    super("FORBIDDEN", message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super("RATE_LIMIT_EXCEEDED", `Trop de requetes. Reessayez dans ${retryAfter}s.`, 429, { retryAfter });
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(required: number, available: number) {
    super("INSUFFICIENT_CREDITS", `Credits insuffisants. Requis: ${required}, Disponible: ${available}`, 402, { required, available });
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super("TIMEOUT", `Operation "${operation}" expiree apres ${timeoutMs}ms`, 408, { operation, timeoutMs });
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, status: number, message: string) {
    super("EXTERNAL_SERVICE_ERROR", `Service externe "${service}" indisponible (${status}): ${message}`, 502, { service, status });
  }
}

// ============================================================
// Types de reponse standardises
// ============================================================

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    duration?: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================
// Handler centralise
// ============================================================

let requestCounter = 0;

export function handleApiError(error: unknown): NextResponse {
  const requestId = `err_${Date.now()}_${++requestCounter}`;

  if (error instanceof AppError) {
    const level = error.statusCode >= 500 ? 'error' : 'warn';
    logger[level]('api_error', { requestId, code: error.code, message: error.message, status: error.statusCode });
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message, details: error.details, requestId } } satisfies ApiErrorResponse,
      { status: error.statusCode },
    );
  }

  if (error instanceof ZodError) {
    const details = error.errors.reduce((acc, e) => {
      const path = e.path.join('.');
      if (!acc[path]) acc[path] = [];
      acc[path].push(e.message);
      return acc;
    }, {} as Record<string, string[]>);
    logger.warn('validation_error', { requestId, details });
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Donnees invalides', details: { fields: details }, requestId } } satisfies ApiErrorResponse,
      { status: 400 },
    );
  }

  if (error instanceof SyntaxError) {
    logger.warn('syntax_error', { requestId, message: error.message });
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_JSON', message: 'Format JSON invalide', requestId } } satisfies ApiErrorResponse,
      { status: 400 },
    );
  }

  if (error instanceof TypeError) {
    logger.error('type_error', { requestId, message: error.message, stack: error.stack });
    return NextResponse.json(
      { success: false, error: { code: 'TYPE_ERROR', message: 'Erreur de type interne', requestId } } satisfies ApiErrorResponse,
      { status: 500 },
    );
  }

  const message = error instanceof Error ? error.message : 'Erreur interne du serveur';
  logger.error('unhandled_error', { requestId, error: message, stack: error instanceof Error ? error.stack : undefined });

  try {
    const Sentry = require('@sentry/nextjs');
    if (error instanceof Error) Sentry.captureException(error, { tags: { requestId } });
  } catch {}

  if (process.env.NODE_ENV === 'development') {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message, requestId } } satisfies ApiErrorResponse,
      { status: 500 },
    );
  }

  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue', requestId } } satisfies ApiErrorResponse,
    { status: 500 },
  );
}

// ============================================================
// Wrapper apiHandler — try/catch automatique pour routes API
// ============================================================

type RouteHandler = (
  request: Request,
  ...args: unknown[]
) => Promise<NextResponse> | NextResponse;

export function apiHandler(handler: RouteHandler): RouteHandler {
  return async (request: Request, ...args: unknown[]): Promise<NextResponse> => {
    const startTime = Date.now();
    try {
      const response = await handler(request, ...args);

      // Ajouter header de duree si NextResponse
      if (response instanceof NextResponse) {
        response.headers.set('X-Duration-Ms', String(Date.now() - startTime));
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const result = handleApiError(error);
      result.headers.set('X-Duration-Ms', String(duration));
      return result;
    }
  };
}

// ============================================================
// Succes helper
// ============================================================

export function apiSuccess<T>(data: T, meta?: ApiSuccessResponse['meta'], status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data, ...(meta ? { meta } : {}) } satisfies ApiSuccessResponse<T>,
    { status },
  );
}
