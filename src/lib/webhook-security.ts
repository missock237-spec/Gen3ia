// ============================================================
// Webhook Security — Anti-replay, HMAC, Nonce, Timestamp
// ============================================================
// Protège contre :
// - Replay attacks (nonce + timestamp)
// - Tampering (HMAC SHA-256)
// - Timing attacks (constant-time compare)
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MAX_PAYLOAD_SIZE = 1024 * 100; // 100 KB

// Stockage des nonces avec fallback mémoire
class NonceStore {
  private store = new Map<string, number>();
  private lastCleanup = Date.now();
  private redisAvailable = false;

  constructor() {
    this.checkRedis();
  }

  private async checkRedis() {
    try {
      const Redis = (await import('ioredis')).default;
      const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });
      await redis.connect();
      await redis.ping();
      this.redisAvailable = true;
      redis.disconnect();
    } catch {
      this.redisAvailable = false;
    }
  }

  async has(nonce: string): Promise<boolean> {
    if (this.redisAvailable) {
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
        });
        await redis.connect();
        const exists = await redis.exists(`webhook:nonce:${nonce}`);
        redis.disconnect();
        return exists === 1;
      } catch {
        // Fallback mémoire
      }
    }
    return this.store.has(nonce);
  }

  async add(nonce: string, ttlMs: number = REPLAY_WINDOW_MS * 2): Promise<void> {
    if (this.redisAvailable) {
      try {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
        });
        await redis.connect();
        await redis.setex(`webhook:nonce:${nonce}`, Math.ceil(ttlMs / 1000), '1');
        redis.disconnect();
        return;
      } catch {
        // Fallback mémoire
      }
    }
    this.store.set(nonce, Date.now() + ttlMs);
    this.cleanup();
  }

  private cleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < NONCE_CLEANUP_INTERVAL) return;
    this.lastCleanup = now;
    for (const [key, expires] of this.store) {
      if (now > expires) this.store.delete(key);
    }
  }
}

const nonceStore = new NonceStore();

// ============================================================
// Types
// ============================================================

export interface WebhookPayload {
  event: string;
  timestamp: string;  // ISO 8601
  nonce: string;
  data: unknown;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  payload?: WebhookPayload;
}

// ============================================================
// Signature
// ============================================================

export function signPayload(payload: WebhookPayload, secret: string): string {
  const data = JSON.stringify(payload);
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function verifySignature(payload: WebhookPayload, signature: string, secret: string): boolean {
  try {
    const expected = signPayload(payload, secret);
    const expectedBuf = Buffer.from(expected, 'utf-8');
    const signatureBuf = Buffer.from(signature, 'utf-8');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

// ============================================================
// Validation complète anti-replay
// ============================================================

export async function validateWebhook(
  rawBody: string,
  signature: string | null,
  secret: string,
  options?: {
    maxAgeMs?: number;
    trustedTimestamp?: boolean;
  }
): Promise<ValidationResult> {
  // 1. Vérifier que le body n'est pas vide
  if (!rawBody || rawBody.length === 0) {
    return { valid: false, error: 'Body vide' };
  }

  // 2. Vérifier la taille max
  if (rawBody.length > MAX_PAYLOAD_SIZE) {
    return { valid: false, error: 'Payload trop volumineux' };
  }

  // 3. Parser le payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { valid: false, error: 'Payload JSON invalide' };
  }

  // 4. Vérifier les champs requis
  if (!payload.event) {
    return { valid: false, error: 'Champ event manquant' };
  }
  if (!payload.timestamp) {
    return { valid: false, error: 'Champ timestamp manquant' };
  }
  if (!payload.nonce) {
    return { valid: false, error: 'Champ nonce manquant (anti-replay)' };
  }

  // 5. Vérifier la signature HMAC
  if (signature) {
    if (!verifySignature(payload, signature, secret)) {
      return { valid: false, error: 'Signature HMAC invalide' };
    }
  }

  // 6. Vérifier le timestamp (anti-replay temporel)
  const maxAge = options?.maxAgeMs ?? REPLAY_WINDOW_MS;
  const payloadTime = new Date(payload.timestamp).getTime();
  const now = Date.now();

  if (isNaN(payloadTime)) {
    return { valid: false, error: 'Timestamp invalide' };
  }

  if (!options?.trustedTimestamp) {
    if (payloadTime > now + 5000) {
      return { valid: false, error: "Timestamp dans le futur (horloge décalée ou attaque)" };
    }
    if (now - payloadTime > maxAge) {
      return { valid: false, error: `Timestamp expiré (plus de ${Math.round(maxAge / 60000)} minutes)` };
    }
  }

  // 7. Vérifier le nonce (anti-replay par déduplication)
  if (await nonceStore.has(payload.nonce)) {
    return { valid: false, error: 'Nonce déjà utilisé (attaque par replay détectée)' };
  }

  // 8. Marquer le nonce comme utilisé
  await nonceStore.add(payload.nonce, maxAge * 2);

  return { valid: true, payload };
}

// ============================================================
// Génération de payload sécurisé (côté émetteur)
// ============================================================

export function createSecurePayload(
  event: string,
  data: unknown,
  secret: string,
  additionalFields?: Record<string, unknown>
): { payload: WebhookPayload; signature: string; headers: Record<string, string> } {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    data,
    ...additionalFields,
  };

  const signature = signPayload(payload, secret);

  return {
    payload,
    signature,
    headers: {
      'Content-Type': 'application/json',
      'X-Gen3ia-Signature': signature,
      'X-Gen3ia-Event': event,
      'X-Gen3ia-Timestamp': payload.timestamp,
      'X-Gen3ia-Nonce': payload.nonce,
    },
  };
}

// ============================================================
// Middleware Express-like pour Next.js App Router
// ============================================================

export function webhookSecurityMiddleware(secret: string) {
  return async (
    request: Request,
    handler: (payload: WebhookPayload) => Promise<Response>
  ): Promise<Response> => {
    try {
      const rawBody = await request.text();
      const signature = request.headers.get('x-gen3ia-signature');
      const result = await validateWebhook(rawBody, signature, secret);

      if (!result.valid) {
        return new Response(
          JSON.stringify({ success: false, error: result.error }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'X-Gen3ia-Security': 'rejected',
            },
          }
        );
      }

      return handler(result.payload!);
    } catch (_err) {
      return new Response(
        JSON.stringify({ success: false, error: 'Erreur de validation du webhook' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}
