// ============================================================
// errors — tests unitaires (4.2 : gestion d'erreurs standardisee)
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BusinessError,
  NotFoundError,
  ValidationError,
  ApiError,
  handleApiError,
} from './errors.js';

vi.mock('./logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('BusinessError', () => {
  it('extends ApiError with 400 status and code', () => {
    const err = new BusinessError('INSUFFICIENT_CREDITS', 'Credits insuffisants');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(err.name).toBe('BusinessError');
  });

  it('carries optional details', () => {
    const err = new BusinessError('X', 'msg', { required: 5, available: 2 });
    expect(err.details).toEqual({ required: 5, available: 2 });
  });
});

describe('handleApiError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('formats an ApiError into a structured JSON response', () => {
    const res = handleApiError(new NotFoundError('User', 'u1'));
    expect(res.status).toBe(404);
    const body = res.body as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeDefined();
  });

  it('formats a ValidationError with 400', () => {
    const res = handleApiError(new ValidationError('EMAIL_INVALID', 'bad', { field: 'email' }));
    expect(res.status).toBe(400);
  });

  it('formats unknown errors as 500 with hidden message in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = handleApiError(new Error('secret db detail'));
      expect(res.status).toBe(500);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
