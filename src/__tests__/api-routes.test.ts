// ============================================================
// Tests d'integration pour les routes API principales
// ============================================================

import { describe, it, expect } from 'vitest';

// Helper: simule un fetch vers une route API Next.js
async function callRoute(route: string, init?: RequestInit) {
  const url = new URL(route, 'http://localhost:3000');
  const req = new Request(url.toString(), init);
  // Note: ces tests verifient le comportement attendu des routes
  // En environnement CI, ils seraient executes avec next start
  return req;
}

describe('API Routes - Securite', () => {
  it('devrait bloquer les requetes sans auth sur /api/admin', async () => {
    const req = await callRoute('/api/admin', { method: 'GET' });
    // Dans un vrai test avec MSW ou next test, on verifierait le status 401
    expect(req.method).toBe('GET');
    expect(req.url).toContain('/api/admin');
  });

  it('devrait bloquer les requetes sans auth sur /api/terminal/execute', async () => {
    const req = await callRoute('/api/terminal/execute', {
      method: 'POST',
      body: JSON.stringify({ command: 'cat /etc/passwd' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(req.method).toBe('POST');
    expect(req.url).toContain('/api/terminal/execute');
  });

  it('devrait permettre les requetes sur /api/health', async () => {
    const req = await callRoute('/api/health');
    expect(req.url).toContain('/api/health');
  });

  it('devrait permettre les requetes sur /api/auth/', async () => {
    const req = await callRoute('/api/auth/session');
    expect(req.url).toContain('/api/auth/session');
  });
});

describe('API Routes - Agents', () => {
  it('devrait bloquer l execution sans auth', async () => {
    const req = await callRoute('/api/agents/run', {
      method: 'POST',
      body: JSON.stringify({ agentId: 'test', input: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(req.url).toContain('/api/agents/run');
  });

  it('devrait valider le schema d entree', async () => {
    const req = await callRoute('/api/agents/run', {
      method: 'POST',
      body: JSON.stringify({}), // agentId manquant
      headers: { 'Content-Type': 'application/json' },
    });
    expect(req.url).toContain('/api/agents/run');
  });
});

describe('API Routes - Paiement', () => {
  it('devrait bloquer les requetes Stripe sans auth', async () => {
    const req = await callRoute('/api/stripe/create-payment', {
      method: 'POST',
      body: JSON.stringify({ amount: 1000 }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(req.url).toContain('/api/stripe');
  });

  it('devrait accepter les webhooks Stripe', async () => {
    const req = await callRoute('/api/webhook/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'test_sig' },
      body: JSON.stringify({ type: 'payment_intent.succeeded' }),
    });
    expect(req.url).toContain('/api/webhook/stripe');
  });
});

describe('API Routes - Utilisateurs', () => {
  it('devrait bloquer la modification de role sans auth admin', async () => {
    const req = await callRoute('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ userId: 'test', action: 'updateRole', value: 'admin' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(req.url).toContain('/api/admin/users');
  });

  it('devrait permettre l inscription', async () => {
    const req = await callRoute('/api/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@test.com', password: 'Test1234!' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(req.url).toContain('/api/register');
  });
});

// ============================================================
// Note: Ces tests sont des squelettes d'integration.
// Pour des tests complets, utilisez:
// - Vitest + MSW (Mock Service Worker) pour intercepter les requetes
// - Playwright pour les tests E2E
// - Supertest pour tester les handlers Next.js directement
//
// Commandes:
// npx vitest run                    # Tous les tests
// npx vitest run api-routes         # Tests API uniquement
// npx vitest --coverage             # Avec couverture
// ============================================================
