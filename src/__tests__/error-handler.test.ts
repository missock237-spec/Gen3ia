// ============================================================
// Tests — Gestion centralisee des erreurs (API + ErrorBoundary)
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
}));

describe('API Error Handler (errors.ts)', () => {
  describe('AppError classes', () => {
    it('AppError basique', async () => {
      const { AppError } = await import('@/lib/errors');
      const err = new AppError('TEST_ERROR', 'Message test', 418, { detail: 'value' });
      expect(err.code).toBe('TEST_ERROR');
      expect(err.message).toBe('Message test');
      expect(err.statusCode).toBe(418);
      expect(err.details).toEqual({ detail: 'value' });
      expect(err.name).toBe('AppError');
    });

    it('NotFoundError', async () => {
      const { NotFoundError } = await import('@/lib/errors');
      const err = new NotFoundError('Agent', 'agent_123');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toContain('Agent');
      expect(err.message).toContain('agent_123');
      expect(err.statusCode).toBe(404);
    });

    it('UnauthorizedError', async () => {
      const { UnauthorizedError } = await import('@/lib/errors');
      const err = new UnauthorizedError();
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.statusCode).toBe(401);
    });

    it('ForbiddenError', async () => {
      const { ForbiddenError } = await import('@/lib/errors');
      const err = new ForbiddenError('Acces interdit');
      expect(err.code).toBe('FORBIDDEN');
      expect(err.statusCode).toBe(403);
    });

    it('ValidationError', async () => {
      const { ValidationError } = await import('@/lib/errors');
      const err = new ValidationError('Champ requis', { field: 'email' });
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.statusCode).toBe(400);
    });

    it('RateLimitError', async () => {
      const { RateLimitError } = await import('@/lib/errors');
      const err = new RateLimitError(30);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(err.statusCode).toBe(429);
      expect(err.details?.retryAfter).toBe(30);
    });

    it('InsufficientCreditsError', async () => {
      const { InsufficientCreditsError } = await import('@/lib/errors');
      const err = new InsufficientCreditsError(5, 2);
      expect(err.code).toBe('INSUFFICIENT_CREDITS');
      expect(err.statusCode).toBe(402);
      expect(err.details?.required).toBe(5);
      expect(err.details?.available).toBe(2);
    });

    it('TimeoutError', async () => {
      const { TimeoutError } = await import('@/lib/errors');
      const err = new TimeoutError('LLM call', 30000);
      expect(err.code).toBe('TIMEOUT');
      expect(err.statusCode).toBe(408);
    });

    it('ExternalServiceError', async () => {
      const { ExternalServiceError } = await import('@/lib/errors');
      const err = new ExternalServiceError('OpenAI', 503, 'Service overloaded');
      expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(err.statusCode).toBe(502);
      expect(err.details?.service).toBe('OpenAI');
    });
  });

  describe('handleApiError', () => {
    it('retourne 400 pour ValidationError', async () => {
      const { handleApiError, ValidationError } = await import('@/lib/errors');
      const res = handleApiError(new ValidationError('test'));
      expect(res.status).toBe(400);
      const data = JSON.parse(await res.text());
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('retourne 404 pour NotFoundError', async () => {
      const { handleApiError, NotFoundError } = await import('@/lib/errors');
      const res = handleApiError(new NotFoundError('Resource'));
      expect(res.status).toBe(404);
    });

    it('retourne 401 pour UnauthorizedError', async () => {
      const { handleApiError, UnauthorizedError } = await import('@/lib/errors');
      const res = handleApiError(new UnauthorizedError());
      expect(res.status).toBe(401);
    });

    it('retourne 429 pour RateLimitError', async () => {
      const { handleApiError, RateLimitError } = await import('@/lib/errors');
      const res = handleApiError(new RateLimitError(60));
      expect(res.status).toBe(429);
    });

    it('retourne 402 pour InsufficientCreditsError', async () => {
      const { handleApiError, InsufficientCreditsError } = await import('@/lib/errors');
      const res = handleApiError(new InsufficientCreditsError(10, 0));
      expect(res.status).toBe(402);
    });

    it('retourne 500 pour les erreurs generiques', async () => {
      const { handleApiError } = await import('@/lib/errors');
      const res = handleApiError(new Error('Something went wrong'));
      expect(res.status).toBe(500);
    });

    it('retourne 500 pour les string throw', async () => {
      const { handleApiError } = await import('@/lib/errors');
      const res = handleApiError('crash');
      expect(res.status).toBe(500);
    });

    it('ajoute un requestId a chaque reponse', async () => {
      const { handleApiError, ValidationError } = await import('@/lib/errors');
      const res = handleApiError(new ValidationError('test'));
      const data = JSON.parse(await res.text());
      expect(data.error.requestId).toBeDefined();
      expect(data.error.requestId).toMatch(/^err_/);
    });
  });

  describe('apiHandler wrapper', () => {
    it('attrape les erreurs et retourne JSON', async () => {
      const { apiHandler } = await import('@/lib/errors');
      const handler = apiHandler(async () => {
        throw new Error('Crash');
      });
      const res = await handler(new Request('http://localhost/test'));
      expect(res.status).toBe(500);
      expect(res.headers.get('X-Duration-Ms')).toBeDefined();
      const data = JSON.parse(await res.text());
      expect(data.success).toBe(false);
    });

    it('passe les reponses normales', async () => {
      const { apiHandler } = await import('@/lib/errors');
      const handler = apiHandler(async () => {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });
      const res = await handler(new Request('http://localhost/test'));
      expect(res.status).toBe(200);
    });

    it('attrape les AppError avec le bon code', async () => {
      const { apiHandler, NotFoundError } = await import('@/lib/errors');
      const handler = apiHandler(async () => {
        throw new NotFoundError('Agent');
      });
      const res = await handler(new Request('http://localhost/test'));
      expect(res.status).toBe(404);
    });
  });

  describe('apiSuccess helper', () => {
    it('cree une reponse de succes', async () => {
      const { apiSuccess } = await import('@/lib/errors');
      const res = apiSuccess({ id: '123', name: 'test' });
      expect(res.status).toBe(200);
      const data = JSON.parse(await res.text());
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('123');
    });

    it('accepte un meta optionnel', async () => {
      const { apiSuccess } = await import('@/lib/errors');
      const res = apiSuccess([], { page: 1, limit: 20, total: 0, totalPages: 0 });
      const data = JSON.parse(await res.text());
      expect(data.meta.page).toBe(1);
      expect(data.meta.total).toBe(0);
    });

    it('permet de specifier un status code', async () => {
      const { apiSuccess } = await import('@/lib/errors');
      const res = apiSuccess({ id: 'new' }, undefined, 201);
      expect(res.status).toBe(201);
    });
  });

  describe('ErrorBoundary component', () => {
    it('exporte ErrorBoundary et ErrorProvider', async () => {
      const mod = await import('@/components/error-boundary');
      expect(mod.ErrorBoundary).toBeDefined();
      expect(mod.ErrorProvider).toBeDefined();
      expect(mod.useErrorHandler).toBeDefined();
    });

    it('ErrorProvider a les bonnes methodes', async () => {
      const mod = await import('@/components/error-boundary');
      // Les methodes sont accessibles via le contexte
      expect(typeof mod.useErrorHandler).toBe('function');
    });
  });
});
