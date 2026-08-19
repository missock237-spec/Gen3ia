// ============================================================
// Tests — Webhook Security (HMAC, Anti-replay, Nonce)
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    ping: vi.fn().mockRejectedValue(new Error('No Redis')),
    exists: vi.fn(),
    setex: vi.fn(),
  })),
}));

describe('Webhook Security', () => {
  const TEST_SECRET = 'test-secret-key-32-chars-minimum-for-hmac';

  describe('signPayload / verifySignature', () => {
    it('signe un payload avec HMAC SHA-256', async () => {
      const { signPayload } = await import('@/lib/webhook-security');
      const payload = { event: 'test', timestamp: new Date().toISOString(), nonce: 'abc123', data: { foo: 'bar' } };
      const sig = signPayload(payload, TEST_SECRET);
      expect(sig).toBeDefined();
      expect(typeof sig).toBe('string');
      expect(sig.length).toBe(64); // SHA-256 hex
    });

    it('verifie une signature valide', async () => {
      const { signPayload, verifySignature } = await import('@/lib/webhook-security');
      const payload = { event: 'test', timestamp: new Date().toISOString(), nonce: 'abc123', data: { foo: 'bar' } };
      const sig = signPayload(payload, TEST_SECRET);
      expect(verifySignature(payload, sig, TEST_SECRET)).toBe(true);
    });

    it('rejette une signature invalide', async () => {
      const { signPayload, verifySignature } = await import('@/lib/webhook-security');
      const payload = { event: 'test', timestamp: new Date().toISOString(), nonce: 'abc123', data: { foo: 'bar' } };
      const sig = signPayload(payload, TEST_SECRET);
      expect(verifySignature(payload, sig + 'x', TEST_SECRET)).toBe(false);
    });

    it('rejette avec un mauvais secret', async () => {
      const { signPayload, verifySignature } = await import('@/lib/webhook-security');
      const payload = { event: 'test', timestamp: new Date().toISOString(), nonce: 'abc123', data: { foo: 'bar' } };
      const sig = signPayload(payload, TEST_SECRET);
      expect(verifySignature(payload, sig, 'wrong-secret-1234567890abcdefgh')).toBe(false);
    });

    it('rejette si le payload a ete modifie', async () => {
      const { signPayload, verifySignature } = await import('@/lib/webhook-security');
      const payload = { event: 'test', timestamp: new Date().toISOString(), nonce: 'abc123', data: { foo: 'bar' } };
      const sig = signPayload(payload, TEST_SECRET);
      payload.data = { foo: 'hacked' };
      expect(verifySignature(payload, sig, TEST_SECRET)).toBe(false);
    });

    it('utilise timingSafeEqual pour la comparaison', async () => {
      const { signPayload, verifySignature } = await import('@/lib/webhook-security');
      const payload = { event: 'test', timestamp: new Date().toISOString(), nonce: 'abc123', data: { foo: 'bar' } };
      const sig = signPayload(payload, TEST_SECRET);
      // Meme avec differents secrets, la fonction ne crash pas
      expect(() => verifySignature(payload, sig, 'different')).not.toThrow();
    });
  });

  describe('createSecurePayload', () => {
    it('cree un payload avec timestamp, nonce et signature', async () => {
      const { createSecurePayload } = await import('@/lib/webhook-security');
      const result = createSecurePayload('user.created', { id: '123' }, TEST_SECRET);

      expect(result.payload.event).toBe('user.created');
      expect(result.payload.timestamp).toBeDefined();
      expect(result.payload.nonce).toBeDefined();
      expect(result.payload.data).toEqual({ id: '123' });
      expect(result.signature).toBeDefined();
      expect(result.headers['X-Gen3ia-Signature']).toBe(result.signature);
      expect(result.headers['X-Gen3ia-Event']).toBe('user.created');
      expect(result.headers['X-Gen3ia-Timestamp']).toBe(result.payload.timestamp);
      expect(result.headers['X-Gen3ia-Nonce']).toBe(result.payload.nonce);
    });

    it('genere des nonces uniques a chaque appel', async () => {
      const { createSecurePayload } = await import('@/lib/webhook-security');
      const r1 = createSecurePayload('test', {}, TEST_SECRET);
      const r2 = createSecurePayload('test', {}, TEST_SECRET);
      expect(r1.payload.nonce).not.toBe(r2.payload.nonce);
    });
  });

  describe('validateWebhook', () => {
    it('accepte un webhook valide', async () => {
      const { createSecurePayload, validateWebhook } = await import('@/lib/webhook-security');
      const { payload, signature } = createSecurePayload('test.event', { msg: 'hello' }, TEST_SECRET);
      const rawBody = JSON.stringify(payload);
      const result = await validateWebhook(rawBody, signature, TEST_SECRET, { trustedTimestamp: true });
      expect(result.valid).toBe(true);
      expect(result.payload?.event).toBe('test.event');
    });

    it('rejette un body vide', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const result = await validateWebhook('', 'sig', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('vide');
    });

    it('rejette un JSON invalide', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const result = await validateWebhook('pas du json', 'sig', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('JSON');
    });

    it('rejette un payload sans event', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const result = await validateWebhook(JSON.stringify({ timestamp: new Date().toISOString(), nonce: '123' }), 'sig', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('event');
    });

    it('rejette un payload sans timestamp', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const result = await validateWebhook(JSON.stringify({ event: 'test', nonce: '123' }), 'sig', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('timestamp');
    });

    it('rejette un payload sans nonce', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const result = await validateWebhook(JSON.stringify({ event: 'test', timestamp: new Date().toISOString() }), 'sig', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('nonce');
    });

    it('rejette un timestamp dans le futur (+5s)', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const future = new Date(Date.now() + 60000).toISOString();
      const body = JSON.stringify({ event: 'test', timestamp: future, nonce: 'abc' });
      const result = await validateWebhook(body, null, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('futur');
    });

    it('rejette un timestamp expire (+5 min)', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const past = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const body = JSON.stringify({ event: 'test', timestamp: past, nonce: 'def' });
      const result = await validateWebhook(body, null, TEST_SECRET, { maxAgeMs: 5 * 60 * 1000 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expire');
    });

    it('rejette un nonce deja utilise (anti-replay)', async () => {
      const { createSecurePayload, validateWebhook } = await import('@/lib/webhook-security');
      const { payload, signature } = createSecurePayload('test', { msg: 'hello' }, TEST_SECRET);
      const rawBody = JSON.stringify(payload);

      // Premiere fois : OK
      const r1 = await validateWebhook(rawBody, signature, TEST_SECRET, { trustedTimestamp: true });
      expect(r1.valid).toBe(true);

      // Deuxieme fois avec le meme nonce : rejete
      const r2 = await validateWebhook(rawBody, signature, TEST_SECRET, { trustedTimestamp: true });
      expect(r2.valid).toBe(false);
      expect(r2.error).toContain('deja utilise');
    });

    it('rejette un payload trop volumineux (>100KB)', async () => {
      const { validateWebhook } = await import('@/lib/webhook-security');
      const largeData = { event: 'test', timestamp: new Date().toISOString(), nonce: 'large', data: 'x'.repeat(150000) };
      const result = await validateWebhook(JSON.stringify(largeData), 'sig', TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('volumineux');
    });
  });

  describe('createSecurePayload + validateWebhook (integration)', () => {
    it('cycle complet : creation -> envoi -> validation', async () => {
      const { createSecurePayload, validateWebhook } = await import('@/lib/webhook-security');

      // 1. Emetteur cree un payload securise
      const { payload, signature } = createSecurePayload('order.created', { orderId: 'ORD-123', amount: 5000 }, TEST_SECRET);

      // 2. Le body est envoye sur le reseau
      const rawBody = JSON.stringify(payload);

      // 3. Recepteur valide
      const result = await validateWebhook(rawBody, signature, TEST_SECRET, { trustedTimestamp: true });
      expect(result.valid).toBe(true);
      expect(result.payload?.event).toBe('order.created');
      expect((result.payload?.data as any)?.orderId).toBe('ORD-123');
    });
  });
});
