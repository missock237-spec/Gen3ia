import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Redis } from 'ioredis';
import { getServerSession } from '@/lib/auth';



// ============================================================
// Phase 1.3 — Route de santé renforcée
// Vérifie : DB (query), Redis (ping), Qdrant (si configuré), Sentry (statut env)
// Répond 200 si tout OK → 503 si une dépendance critique échoue.
// ============================================================



export const dynamic = "force-dynamic";
const REDIS_URL = process.env.REDIS_URL || '';
const QDRANT_URL = process.env.QDRANT_URL || '';

async function checkDatabase(): Promise<boolean> {
  try {
    // Firestore : on effectue un simple list collections pour vérifier la connexion
    const { getAdminDb } = await import('@/lib/firebase/admin');
    await getAdminDb().listCollections();
    return true;
  } catch { return false; }
}

/** Ping Redis avec un timeout court (ne bloque pas le healthcheck). */
async function checkRedis(): Promise<{ ok: boolean; detail?: string }> {
  if (!REDIS_URL) return { ok: false, detail: 'not_configured' };
  const client = new Redis(REDIS_URL, {
    connectTimeout: 2000,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // pas de retry : fail rapide
  });
  try {
    const pong = await Promise.race([
      client.ping(),
      new Promise<string>((_, rej) =>
        setTimeout(() => rej(new Error('ping timeout')), 2000),
      ),
    ]);
    return { ok: pong === 'PONG', detail: pong };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  } finally {
    try { client.disconnect(); } catch { /* noop */ }
  }
}

/** Qdrant : simple vérification de l'URL /readiness si configuré. */
async function checkQdrant(): Promise<{ status: string }> {
  if (!QDRANT_URL) return { status: 'not_configured' };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${QDRANT_URL.replace(/\/$/, '')}/readiness`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    clearTimeout(t);
    return { status: res.ok ? 'healthy' : 'unhealthy' };
  } catch {
    return { status: 'unhealthy' };
  }
}

interface HealthComponent {
  status: string;
  detail?: string;
  heapUsed?: string;
  heapTotal?: string;
  uptime?: string;
  node?: string;
  env?: string;
  [key: string]: unknown;
}

async function getDetailedReport(): Promise<Record<string, HealthComponent>> {
  const components: Record<string, HealthComponent> = {};

  const [dbOk, redis, qdrant] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQdrant(),
  ]);

  components.database = { status: dbOk ? 'healthy' : 'unhealthy' };
  components.redis = {
    status: redis.ok ? 'healthy' : redis.detail === 'not_configured' ? 'not_configured' : 'unhealthy',
    detail: redis.detail,
  };
  components.qdrant = { status: qdrant.status };
  components.sentry = {
    status: process.env.SENTRY_DSN ? 'configured' : 'not_configured',
  };

  const mem = process.memoryUsage();
  components.memory = { status: 'ok', heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`, heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB` };
  components.uptime = { status: 'ok', uptime: `${Math.floor(process.uptime())}s` };
  components.node = { status: 'ok', node: process.version };
  components.env = { status: 'ok', env: process.env.NODE_ENV };

  const providers: Array<{ key: string; label: string }> = [
    { key: 'OPENAI_API_KEY', label: 'openai' },
    { key: 'ANTHROPIC_API_KEY', label: 'anthropic' },
    { key: 'HUGGINGFACE_TOKEN', label: 'huggingface' },
    { key: 'GROQ_API_KEY', label: 'groq' },
    { key: 'STRIPE_SECRET_KEY', label: 'stripe' },
    { key: 'SEBPAY_API_KEY', label: 'sebpay' },
    { key: 'UPSTASH_REDIS_REST_URL', label: 'upstash' },
  ];
  for (const p of providers) {
    components[p.label] = { status: process.env[p.key] ? 'configured' : 'not_configured' };
  }
  return components;
}

export async function GET(request: NextRequest) {
  // En mode public (par défaut) : DB est la dépendance critique pour LB/Vercel.
  // Redis/Qdrant sont « dégradables » et donc signalés mais ne font pas passer l'app en 503 seul.
  const dbOk = await checkDatabase();
  const status = dbOk ? 'healthy' : 'unhealthy';

  // Mode detaille : reserve aux admins authentifies
  const url = new URL(request.url);
  if (url.searchParams.get('detailed') === 'true') {
    const session = await getServerSession();
    if (session?.user?.role === 'admin') {
      const components = await getDetailedReport();
      return NextResponse.json({ status, timestamp: new Date().toISOString(), components });
    }
    return NextResponse.json({ error: 'Non autorise' }, { status: 403 });
  }

  // Mode public : retourne uniquement le statut
  return NextResponse.json(
    { status, timestamp: new Date().toISOString() },
    {
      status: status === 'unhealthy' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store', 'X-Health-Status': status },
    },
  );
}
