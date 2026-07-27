import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: vi.fn(), update: vi.fn() }, imageGeneration: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock('@/lib/security', () => ({ applySecurity: vi.fn(() => ({ auth: { userId: 'user_1', role: 'user' }, error: null })), secureResponse: vi.fn((r) => r) }));
vi.mock('@/lib/huggingface', () => ({ queryHF: vi.fn(), bufferToBase64: vi.fn(() => 'base64data') }));
vi.mock('@/lib/logger', () => ({ createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })) }));
describe('POST /api/images/generate', () => {
  it('rejette si prompt manquant', async () => {
    const { POST } = await import('@/app/api/images/generate/route');
    const req = new Request('http://localhost/api/images/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
  it('rejette si modele invalide', async () => {
    const { POST } = await import('@/app/api/images/generate/route');
    const req = new Request('http://localhost/api/images/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'test', model: 'inexistant' }) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
  it('rejette si prompt trop long', async () => {
    const { POST } = await import('@/app/api/images/generate/route');
    const req = new Request('http://localhost/api/images/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'x'.repeat(2500) }) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
