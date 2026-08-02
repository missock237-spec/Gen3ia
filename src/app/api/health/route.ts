import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { getEnv } from '@/lib/env-validation';

interface HealthComponent {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'configured' | 'not_configured';
  responseTime?: number;
  error?: string;
  [key: string]: unknown;
}

/**
 * Check database connectivity with timeout
 */
async function checkDatabase(): Promise<{ ok: boolean; responseTime: number; error?: string }> {
  const start = performance.now();
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 5000)),
    ]);
    return { ok: true, responseTime: performance.now() - start };
  } catch (error) {
    return { ok: false, responseTime: performance.now() - start, error: String(error) };
  }
}

/**
 * Check Redis connectivity if configured
 */
async function checkRedis(): Promise<{ ok: boolean; responseTime: number; error?: string }> {
  const env = getEnv();
  if (!env.REDIS_URL) {
    return { ok: true, responseTime: 0 };
  }

  const start = performance.now();
  try {
    // Lazy import to avoid errors if redis is not installed
    const { createClient } = await import('redis');
    const client = createClient({ url: env.REDIS_URL });
    
    await Promise.race([
      (async () => {
        await client.connect();
        await client.ping();
        await client.disconnect();
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000)),
    ]);
    
    return { ok: true, responseTime: performance.now() - start };
  } catch (error) {
    return { ok: false, responseTime: performance.now() - start, error: String(error) };
  }
}

/**
 * Get comprehensive health report for admins
 */
async function getDetailedReport(): Promise<Record<string, HealthComponent>> {
  const components: Record<string, HealthComponent> = {};
  const env = getEnv();

  // Database
  const dbCheck = await checkDatabase();
  components.database = {
    status: dbCheck.ok ? 'healthy' : 'unhealthy',
    responseTime: dbCheck.responseTime,
    ...(dbCheck.error && { error: dbCheck.error }),
  };

  // Redis
  const redisCheck = await checkRedis();
  components.redis = {
    status: env.REDIS_URL ? (redisCheck.ok ? 'healthy' : 'unhealthy') : 'not_configured',
    responseTime: redisCheck.responseTime,
    ...(redisCheck.error && { error: redisCheck.error }),
  };

  // Memory
  const mem = process.memoryUsage();
  components.memory = {
    status: 'healthy',
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    external: `${Math.round(mem.external / 1024 / 1024)}MB`,
  };

  // System
  components.system = {
    status: 'healthy',
    uptime: `${Math.floor(process.uptime())}s`,
    node: process.version,
    env: process.env.NODE_ENV,
    pid: process.pid,
  };

  // LLM Providers
  const providers = [
    { key: 'OPENAI_API_KEY', label: 'openai' },
    { key: 'ANTHROPIC_API_KEY', label: 'anthropic' },
    { key: 'GROQ_API_KEY', label: 'groq' },
    { key: 'HUGGINGFACE_TOKEN', label: 'huggingface' },
  ];
  for (const p of providers) {
    components[p.label] = { status: env[p.key as keyof typeof env] ? 'configured' : 'not_configured' };
  }

  // Payment & Services
  const services = [
    { key: 'STRIPE_SECRET_KEY', label: 'stripe' },
    { key: 'SENTRY_DSN', label: 'sentry' },
    { key: 'TWILIO_ACCOUNT_SID', label: 'twilio' },
  ];
  for (const s of services) {
    components[s.label] = { status: env[s.key as keyof typeof env] ? 'configured' : 'not_configured' };
  }

  return components;
}

/**
 * Determine overall health status
 */
function getOverallStatus(components: Record<string, HealthComponent>): 'healthy' | 'degraded' | 'unhealthy' {
  const criticalServices = ['database'];
  const degradedServices = ['redis', 'sentry'];

  // Critical: if database is down
  if (components.database?.status === 'unhealthy') {
    return 'unhealthy';
  }

  // Degraded: if optional services are down
  const hasUnhealthy = Object.entries(components)
    .filter(([key]) => degradedServices.includes(key))
    .some(([, comp]) => comp.status === 'unhealthy');

  return hasUnhealthy ? 'degraded' : 'healthy';
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const detailed = url.searchParams.get('detailed') === 'true';
  const timestamp = new Date().toISOString();

  // Quick health check
  const dbCheck = await checkDatabase();
  
  if (detailed) {
    // Detailed mode: require admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized - admin access required' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const components = await getDetailedReport();
    const overallStatus = getOverallStatus(components);

    return NextResponse.json(
      {
        status: overallStatus,
        timestamp,
        components,
        version: process.env.npm_package_version || 'unknown',
      },
      {
        status: overallStatus === 'unhealthy' ? 503 : 200,
        headers: {
          'Cache-Control': 'no-store',
          'X-Health-Status': overallStatus,
        },
      },
    );
  }

  // Public health check: just database status
  const status = dbCheck.ok ? 'healthy' : 'unhealthy';
  return NextResponse.json(
    { status, timestamp },
    {
      status: dbCheck.ok ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Health-Status': status,
      },
    },
  );
}
