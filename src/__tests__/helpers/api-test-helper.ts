// ============================================================
// API Test Helper — Utilitaire pour tester les routes API Next.js
// ============================================================

import { NextRequest } from 'next/server';

/**
 * Crée une requete NextRequest factice pour tester les routes API
 */
export function createRequest({
  method = 'GET',
  url = 'http://localhost:3000/api/test',
  body,
  headers = {},
  cookies = {},
}: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}): NextRequest {
  const req = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // Ajouter les cookies
  for (const [key, value] of Object.entries(cookies)) {
    req.cookies.set(key, value);
  }

  return req;
}

/**
 * Crée une requete authentifiee (simule un token JWT)
 */
export function createAuthenticatedRequest(
  overrides: Parameters<typeof createRequest>[0] = {}
): NextRequest {
  return createRequest({
    ...overrides,
    headers: {
      ...overrides.headers,
      Authorization: 'Bearer test-jwt-token-for-testing',
    },
  });
}

/**
 * Crée une requete admin (simule un token admin)
 */
export function createAdminRequest(
  overrides: Parameters<typeof createRequest>[0] = {}
): NextRequest {
  return createRequest({
    ...overrides,
    headers: {
      ...overrides.headers,
      Authorization: 'Bearer test-jwt-admin-token-for-testing',
    },
  });
}

/**
 * Parse la reponse JSON d'une route API
 */
export async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { raw: await response.text() };
  }
}

/**
 * Verifie qu'une reponse est un succes
 */
export function expectSuccess(data: any): void {
  expect(data).not.toHaveProperty('error');
}

/**
 * Verifie qu'une reponse est une erreur
 */
export function expectError(data: any, _status?: number): void {
  expect(data).toHaveProperty('error');
}
