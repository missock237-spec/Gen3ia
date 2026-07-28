import { beforeAll, afterAll, vi } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/gen3ia_test';
  process.env.SKIP_AUTH = 'true';
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-key-not-for-production-32chars!!';
});

if (!process.env.ALLOW_REAL_FETCH) {
  global.fetch = vi.fn().mockImplementation(() =>
    Promise.reject(new Error('fetch() is mocked. Set ALLOW_REAL_FETCH=true for real calls'))
  );
}

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual('node:crypto');
  return {
    ...(actual as object),
    randomBytes: (size: number) => {
      const buffer = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = (i + Date.now() % 255) & 0xff;
      }
      return buffer;
    },
  };
});

export function createMockRequest(method: string = 'GET', body?: unknown, headers?: Record<string, string>): Request {
  return new Request('http://localhost:3000', {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user-id': 'test-user-id', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export function createMockFormData(fields: Record<string, string | Blob>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

export async function expectSuccessResponse(response: Response): Promise<any> {
  expect(response.status).toBeLessThan(400);
  return response.json();
}

export async function expectErrorResponse(response: Response, expectedStatus: number = 400): Promise<any> {
  expect(response.status).toBe(expectedStatus);
  return response.json();
}
