// ============================================================
// GESTION CENTRALISÉE DES ERREURS
// ============================================================
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";
import { formatZodErrors } from "./validation";

// ============================================================
// CLASSES D'ERREURS
// ============================================================

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
  constructor(message = "Non authentifié") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Accès refusé") {
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
    super("RATE_LIMIT_EXCEEDED", `Trop de requêtes. Réessayez dans ${retryAfter}s.`, 429, { retryAfter });
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(required: number, available: number) {
    super("INSUFFICIENT_CREDITS", `Crédits insuffisants. Requis: ${required}, Disponible: ${available}`, 402, { required, available });
  }
}

// ============================================================
// HANDLER API — Transforme toute erreur en réponse JSON
// ============================================================

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function handleApiError(error: unknown): NextResponse {
  // Erreurs AppError connues
  if (error instanceof AppError) {
    logger.warn("api_error", { code: error.code, message: error.message, statusCode: error.statusCode });
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message, details: error.details } } as ApiErrorResponse,
      { status: error.statusCode },
    );
  }

  // Erreurs Zod (validation)
  if (error instanceof ZodError) {
    const details = formatZodErrors(error);
    logger.warn("validation_error", { details });
    return NextResponse.json(
      { success: false, error: { code: "VALIDATION_ERROR", message: "Données invalides", details } } as ApiErrorResponse,
      { status: 400 },
    );
  }

  // Erreurs inconnues
  const message = error instanceof Error ? error.message : "Erreur interne du serveur";
  logger.error("unhandled_error", { error: message, stack: error instanceof Error ? error.stack : undefined });

  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Une erreur interne est survenue" } } as ApiErrorResponse,
    { status: 500 },
  );
}

// ============================================================
// WRAPPER — Pour les routes API (try/catch automatique)
// ============================================================

export function apiHandler(handler: (request: Request, ...args: unknown[]) => Promise<NextResponse>) {
  return async (request: Request, ...args: unknown[]): Promise<NextResponse> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}