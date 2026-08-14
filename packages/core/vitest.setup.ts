// Mock next/server pour permettre l'import de errors.ts (NextResponse)
// en environnement node de test (packages/core est une lib Node).
import { vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      body,
      json: async () => body,
    }),
  },
}));
