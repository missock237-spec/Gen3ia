// ============================================================
// E2E — API Health & Plans (endpoints publics)
// ============================================================

import { test, expect } from '@playwright/test';

/** Sous-ensemble des champs de plan exposés par GET /api/payments/plans */
interface PlanSummary {
  id: string;
  name: string;
  price: number;
  priceUSD: number;
  credits: number;
  popular?: boolean;
}

/** Réponse typée de GET /api/payments/plans */
interface PlansResponse {
  success: boolean;
  data: PlanSummary[];
}

test.describe('🌐 API endpoints', () => {

  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThan(0);
    expect(body.version).toBeDefined();
  });

  test('GET /api/payments/plans returns 4 plans', async ({ request }) => {
    const res = await request.get('/api/payments/plans');
    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as PlansResponse;
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(4);

    const free = body.data.find((p) => p.id === 'free');
    expect(free).toBeDefined();
    expect(free!.price).toBe(0);
    expect(free!.credits).toBe(10);

    const pro = body.data.find((p) => p.id === 'pro');
    expect(pro).toBeDefined();
    expect(pro!.price).toBe(15000);
    expect(pro!.credits).toBe(5000);
  });

  test('GET /api/docs/openapi returns Swagger spec', async ({ request }) => {
    const res = await request.get('/api/docs/openapi');
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.info.title).toContain('Gen3ia');
    expect(body.paths).toBeDefined();

    // Should have auth routes
    expect(Object.keys(body.paths)).toContain('/api/auth/login');
    expect(Object.keys(body.paths)).toContain('/api/agents/run');
  });

  test('POST /api/auth/login with bad credentials returns 401', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: {
        email: 'nonexistent@test.com',
        password: 'wrongpassword123!',
      },
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('POST /api/auth/register with weak password returns 400', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: {
        email: 'test@test.com',
        password: '123',
        name: 'Test User',
      },
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.error || body.details).toBeDefined();
  });

  test('GET /api/metrics returns Prometheus format', async ({ request }) => {
    const res = await request.get('/api/metrics');
    expect(res.ok()).toBeTruthy();

    const text = await res.text();
    expect(text).toContain('gen3ia');
    expect(text).toContain('# HELP');
    expect(text).toContain('# TYPE');
  });
});
