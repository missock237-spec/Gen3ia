// ============================================================
// Gen3ia — Health check (Firestore + Redis + Qdrant + providers)
// ------------------------------------------------------------
// Public mode  : GET /api/health              -> { status: 'healthy'|'unhealthy' }
// Detailed mode: GET /api/health?detailed=true -> admin-only full report
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firestore';
import { getServerSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const QDRANT_URL = process.env.QDRANT_URL || '';

// ------------------------------------------------------------
// Lightweight DB ping — the only critical dependency for LB.
// ------------------------------------------------------------
async function checkDatabase(): Promise<boolean> {
  try {
// @ts-ignore
    await db.collection('_health').doc('ping').set({ timestamp: Date.now() }, { merge: true });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Detailed components — admin only
// ------------------------------------------------------------

async function checkRedis(): Promise<{ ok: boolean; detail?: string }> {
  if (!REDIS_URL) return { ok: false, detail: 'not_configured' };
  try {
    // Use fetch for Upstash REST, or fall back to a TCP-less check.
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
        cache: 'no-store',
      });
      return { ok: res.ok, detail: res.ok ? 'PONG' : 'error' };
    }
    return { ok: false, detail: 'requires_upstash_rest' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

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
  components.memory = {
    status: 'ok',
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
  };
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

// ------------------------------------------------------------
// GET /api/health
// ------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Public mode : DB is the critical dependency for LB/Vercel.
  // Redis/Qdrant are "degradable" and don't trigger a 503 alone.
  const dbOk = await checkDatabase();
  const status = dbOk ? 'healthy' : 'unhealthy';

  const url = new URL(request.url);
  if (url.searchParams.get('detailed') === 'true') {
    try {
      const session = await getServerSession();
      if (session?.user?.role === 'admin') {
        const components = await getDetailedReport();
        return NextResponse.json({ status, timestamp: new Date().toISOString(), components });
      }
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    } catch {
      // If auth server is unavailable, fall through to public mode.
    }
  }

  return NextResponse.json(
    { status, timestamp: new Date().toISOString() },
    {
      status: status === 'unhealthy' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store', 'X-Health-Status': status },
    },
  );
}
