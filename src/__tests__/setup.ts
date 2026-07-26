import { beforeAll, afterAll, vi } from 'vitest';

// ============================================================
// Global test configuration
// ============================================================

beforeAll(() => {
  // Mock environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/genova_test';
  process.env.SKIP_AUTH = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-not-for-production';
});

// ============================================================
// Global mocks
// ============================================================

// Mock fetch globally to prevent accidental real API calls in tests
if (!process.env.ALLOW_REAL_FETCH) {
  global.fetch = vi.fn().mockImplementation(() =>
    Promise.reject(new Error('fetch() is mocked. If you need real fetch, set ALLOW_REAL_FETCH=true'))
  );
}

// Mock crypto for deterministic tests
vi.mock('node:crypto', async () => {
  const actual = await vi.importActual('node:crypto');
  return {
    ...(actual as object),
    randomBytes: (size: number) => {
      // Use a predictable but unique-enough pattern for tests
      const buffer = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = (i + Date.now() % 255) & 0xff;
      }
      return buffer;
    },
  };
});

// ============================================================
// Test utilities
// ============================================================

export function createMockRequest(method: string = 'GET', body?: unknown, headers?: Record<string, string>): Request {
  const req = new Request('http://localhost:3000', {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'test-user-id',
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return req;
}

export function createMockFormData(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) {
      fd.append(key, value);
    } else {
      fd.append(key, value);
    }
  }
  return fd;
}

export function expectSuccessResponse(response: Response): Promise<any> {
  expect(response.status).toBeLessThan(400);
  return response.json();
}

export function expectErrorResponse(response: Response, expectedStatus: number = 400): Promise<any> {
  expect(response.status).toBe(expectedStatus);
  return response.json();
}
