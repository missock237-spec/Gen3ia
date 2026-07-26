import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getN8nClient } from '@/lib/integrations/n8n-client';
import { getAdEngine } from '@/lib/advertising/ad-engine';
import { createLogger } from '@/lib/logger';
import pkg from '@/../package.json';

const log = createLogger('health');

interface HealthComponent {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  latency?: number;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  components: Record<string, HealthComponent>;
}

async function testProvider(provider: string, envKey: string, url: string, headers: Record<string, string>, body?: string): Promise<HealthComponent> {
  const start = Date.now();
  try {
    if (!process.env[envKey]) {
      return { status: 'degraded', message: `${provider} non configuré (clé manquante)`, latency: Date.now() - start };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
        signal: controller.signal,
      });
      return {
        status: res.ok ? 'healthy' : 'degraded',
        message: res.ok ? `${provider} accessible` : `${provider}: statut ${res.status}`,
        latency: Date.now() - start,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      status: 'degraded',
      message: `${provider}: ${err instanceof Error ? err.message : 'inaccessible'}`,
      latency: Date.now() - start,
    };
  }
}

export async function GET() {
  const start = Date.now();
  const components: Record<string, HealthComponent> = {};

  // 1. Base de donnees
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    components.database = {
      status: 'healthy',
      latency: Date.now() - dbStart,
    };
  } catch (err) {
    components.database = {
      status: 'unhealthy',
      message: err instanceof Error ? err.message : 'Connexion BDD impossible',
    };
  }

  // 2. n8n (optionnel)
  try {
    const n8nStart = Date.now();
    const n8n = getN8nClient();
    const health = await n8n.healthCheck();
    components.n8n = {
      status: health.status === 'ok' ? 'healthy' : 'degraded',
      message: health.version ? `Version ${health.version}` : undefined,
      latency: Date.now() - n8nStart,
    };
  } catch {
    components.n8n = {
      status: 'degraded',
      message: 'n8n non configure ou inaccessible',
    };
  }

  // 3. Advertising (optionnel)
  try {
    const adStart = Date.now();
    const campaigns = await getAdEngine().getActiveCampaigns();
    components.advertising = {
      status: 'healthy',
      message: `${campaigns.length} campagne(s) active(s)`,
      latency: Date.now() - adStart,
    };
  } catch {
    components.advertising = {
      status: 'degraded',
    };
  }

  // 4. Providers LLM
  // Tests rapides ping - pas d'envoi de tokens reels
  components.providers = { status: 'healthy', message: 'Tests providers LLM' };
  
  const providerTests = await Promise.allSettled([
    testProvider('OpenAI', 'OPENAI_API_KEY', 'https://api.openai.com/v1/models', { Authorization: 'Bearer test' }),
    testProvider('Anthropic', 'ANTHROPIC_API_KEY', 'https://api.anthropic.com/v1/messages', { 'x-api-key': 'test', 'anthropic-version': '2023-06-01' }),
    testProvider('Groq', 'GROQ_API_KEY', 'https://api.groq.com/openai/v1/models', { Authorization: 'Bearer test' }),
    testProvider('OpenRouter', 'OPENROUTER_API_KEY', 'https://openrouter.ai/api/v1/auth/key', { Authorization: 'Bearer test' }),
  ]);

  const providerLabels = ['OpenAI', 'Anthropic', 'Groq', 'OpenRouter'];
  providerTests.forEach((result, idx) => {
    const label = providerLabels[idx];
    if (result.status === 'fulfilled') {
      components[`provider_${label.toLowerCase()}`] = result.value;
      if (result.value.status !== 'healthy') {
        components.providers.status = 'degraded';
      }
    }
  });

  // 5. Memoire / Heap
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  components.memory = {
    status: memoryUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'degraded',
    message: `${heapUsedMB}MB / ${heapTotalMB}MB utilises`,
  };

  // 6. Redis (si configure)
  try {
    const { default: Redis } = await import('ioredis');
    if (process.env.REDIS_URL) {
      const redisStart = Date.now();
      const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      components.redis = {
        status: 'healthy',
        latency: Date.now() - redisStart,
      };
    } else {
      components.redis = { status: 'degraded', message: 'REDIS_URL non configure' };
    }
  } catch {
    components.redis = { status: 'degraded', message: 'Redis inaccessible' };
  }

  // Statut global
  const allHealthy = Object.values(components).every(c => c.status === 'healthy');
  const anyUnhealthy = Object.values(components).some(c => c.status === 'unhealthy');
  const status: HealthReport['status'] = allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded';

  const report: HealthReport = {
    status,
    timestamp: new Date().toISOString(),
    version: pkg.version || '0.1.0',
    uptime: Math.floor(process.uptime()),
    components,
  };

  log.info('Healthcheck complete', { status, componentCount: Object.keys(components).length });

  const httpStatus = status === 'unhealthy' ? 503 : 200;

  return NextResponse.json(report, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Status': status,
      'X-Health-Version': pkg.version || '0.1.0',
    },
  });
}
