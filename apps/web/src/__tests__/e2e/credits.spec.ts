// ============================================================
// E2E — Credits & Subscription flows
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

test.describe('💰 Credits & Plans', () => {

  test('should display free plan with 10 credits', async ({ request }) => {
    const res = await request.get('/api/payments/plans');
    expect(res.ok()).toBeTruthy();

    const body = (await res.json()) as PlansResponse;
    const free = body.data.find((p) => p.id === 'free');
    expect(free).toBeDefined();
    expect(free!.credits).toBe(10);
    expect(free!.price).toBe(0);
  });

  test('should display pro plan as popular', async ({ request }) => {
    const res = await request.get('/api/payments/plans');
    const body = (await res.json()) as PlansResponse;

    const pro = body.data.find((p) => p.id === 'pro');
    expect(pro).toBeDefined();
    expect(pro!.popular).toBe(true);
    expect(pro!.credits).toBe(5000);
    expect(pro!.price).toBe(15000);
  });

  test('should reject checkout without auth', async ({ request }) => {
    const res = await request.post('/api/payments/checkout', {
      data: { type: 'credits', id: 'small' },
    });
    expect(res.status()).toBe(401);
  });

  test('should reject invalid plan ID', async ({ request }) => {
    const res = await request.post('/api/payments/checkout', {
      headers: {
        Authorization: 'Bearer mock-token-for-test',
      },
      data: { type: 'plan', id: 'ultra-premium' },
    });
    // Should fail with 400 or 401 (since token is mock)
    expect([400, 401]).toContain(res.status());
  });
});
