import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleApiError(error: unknown, context?: string): NextResponse {
  if (error instanceof AppError) {
    logger.warn(`[${context || 'API'}] ${error.message}`, { code: error.code, statusCode: error.statusCode });
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  if (error instanceof Error) {
    logger.error(`[${context || 'API'}] ${error.message}`, { stack: error.stack?.substring(0, 500) });
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Erreur interne' : error.message }, { status: 500 });
  }
  return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
}
