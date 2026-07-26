import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
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

async function testProviderConfig(provider: string, envKey: string): Promise<HealthComponent> {
  const start = Date.now();
  const key = process.env[envKey];
  if (!key) {
    return { status: 'degraded', message: `${provider} non configuré (clé manquante)`, latency: Date.now() - start };
  }
  if (key.length < 10) {
    return { status: 'degraded', message: `${provider}: clé trop courte (invalide)` };
  }
  return { status: 'healthy', message: `${provider} configuré`, latency: Date.now() - start };
}

export async function GET() {
  const start = Date.now();
  const components: Record<string, HealthComponent> = {};
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    components.database = { status: 'healthy', latency: Date.now() - dbStart };
  } catch (err) {
    components.database = { status: 'unhealthy', message: err instanceof Error ? err.message : 'Connexion BDD impossible' };
  }
  const providerConfigs = [
    { name: 'OpenAI', key: 'OPENAI_API_KEY' },
    { name: 'Anthropic', key: 'ANTHROPIC_API_KEY' },
    { name: 'Groq', key: 'GROQ_API_KEY' },
    { name: 'OpenRouter', key: 'OPENROUTER_API_KEY' },
    { name: 'Hugging Face', key: 'HUGGINGFACE_TOKEN' },
  ];
  for (const provider of providerConfigs) {
    components[`provider_${provider.name.toLowerCase().replace(/\s+/g, '_')}`] = await testProviderConfig(provider.name, provider.key);
  }
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const heapThresholdMB = parseInt(process.env.HEAP_THRESHOLD_MB || '500', 10);
  components.memory = {
    status: memoryUsage.heapUsed < heapThresholdMB * 1024 * 1024 ? 'healthy' : 'degraded',
    message: `${heapUsedMB}MB / ${heapTotalMB}MB utilisés (seuil: ${heapThresholdMB}MB)`,
  };
  if (process.env.REDIS_URL) {
    try {
      const { default: Redis } = await import('ioredis');
      const redisStart = Date.now();
      const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      components.redis = { status: 'healthy', latency: Date.now() - redisStart };
    } catch { components.redis = { status: 'degraded', message: 'Redis inaccessible' }; }
  } else { components.redis = { status: 'degraded', message: 'REDIS_URL non configuré' }; }
  try {
    const { getN8nClient } = await import('@/lib/integrations/n8n-client');
    const n8nStart = Date.now();
    const n8n = getN8nClient();
    const health = await n8n.healthCheck();
    components.n8n = { status: health.status === 'ok' ? 'healthy' : 'degraded', message: health.version ? `Version ${health.version}` : undefined, latency: Date.now() - n8nStart };
  } catch { components.n8n = { status: 'degraded', message: 'n8n non configuré ou inaccessible' }; }
  try {
    const { getAdEngine } = await import('@/lib/advertising/ad-engine');
    const adStart = Date.now();
    const campaigns = await getAdEngine().getActiveCampaigns();
    components.advertising = { status: 'healthy', message: `${campaigns.length} campagne(s) active(s)`, latency: Date.now() - adStart };
  } catch { components.advertising = { status: 'degraded' }; }
  components.sentry = process.env.SENTRY_DSN ? { status: 'healthy', message: 'Sentry configuré' } : { status: 'degraded', message: 'Sentry non configuré' };
  const allHealthy = Object.values(components).every(c => c.status === 'healthy');
  const anyUnhealthy = Object.values(components).some(c => c.status === 'unhealthy');
  const status: HealthReport['status'] = allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded';
  const report: HealthReport = { status, timestamp: new Date().toISOString(), version: pkg.version || '0.1.0', uptime: Math.floor(process.uptime()), components };
  log.info('Healthcheck completed', { status, componentCount: Object.keys(components).length, durationMs: Date.now() - start });
  return NextResponse.json(report, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Health-Status': status, 'X-Health-Version': pkg.version || '0.1.0', 'X-Health-Duration': `${Date.now() - start}ms` },
  });
}
