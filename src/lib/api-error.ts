// ============================================================
// API Error — Format standardisé des réponses d'erreur API
// Toutes les routes doivent utiliser ce format
// ============================================================

import { NextResponse } from 'next/server';

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Codes d'erreur standardisés
 */
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Retourne une réponse d'erreur standardisée
 */
export function errorResponse(
  error: string,
  code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
  status: number = 500,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

/**
 * Retourne une réponse de succès standardisée
 */
export function successResponse<T>(
  data: T,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

/**
 * Erreur API avec code
 */
export class ApiError extends Error {
  public code: ErrorCodeType;
  public statusCode: number;
  public details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toResponse(): NextResponse<ApiErrorResponse> {
    return errorResponse(this.message, this.code, this.statusCode, this.details);
  }
}

/**
 * Wrapper pour handler les erreurs dans les routes API
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  if (error instanceof ApiError) {
    return error.toResponse();
  }

  if (error instanceof Error) {
    // Erreurs Firestore / Firebase Admin SDK
    if (
      error.name === 'FirebaseError' ||
      error.name === 'FirestoreError' ||
      error.message?.includes('firestore') ||
      error.message?.includes('firebase')
    ) {
      return errorResponse(
        'Erreur de base de données',
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }

    return errorResponse(
      error.message,
      ErrorCode.INTERNAL_ERROR,
      500
    );
  }

  return errorResponse(
    'Erreur interne du serveur',
    ErrorCode.INTERNAL_ERROR,
    500
  );
}
