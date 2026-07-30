import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { getEnvStatus, assertEnv } from '../../../../packages/core/src/env-validator';
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

export async function GET() {
  const start = Date.now();
  const components: Record<string, HealthComponent> = {};

  // Environnement
  const envStatus = getEnvStatus();
  components.environment = {
    status: envStatus.status === 'healthy' ? 'healthy' : 'degraded',
    message: `${envStatus.required.filter(r => r.set).length}/${envStatus.required.length} variables requises configurees`,
  };

  // Base de donnees
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    components.database = { status: 'healthy', latency: Date.now() - dbStart };
  } catch (err) {
    components.database = { status: 'unhealthy', message: err instanceof Error ? err.message : 'Connexion BDD impossible' };
  }

  // Memoire
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapThreshold = parseInt(process.env.HEAP_THRESHOLD_MB || '500', 10);
  components.memory = {
    status: heapUsedMB < heapThreshold ? 'healthy' : 'degraded',
    message: `${heapUsedMB}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB (seuil: ${heapThreshold}MB)`,
  };

  // Uptime
  components.uptime = { status: 'healthy', message: `${Math.floor(process.uptime())}s` };

  // Providers IA (check rapide)
  const providers = [
    { key: 'OPENAI_API_KEY', label: 'OpenAI' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic' },
    { key: 'HUGGINGFACE_API_KEY', label: 'Hugging Face' },
    { key: 'STRIPE_SECRET_KEY', label: 'Stripe' },
  ];
  for (const p of providers) {
    const startP = Date.now();
    const val = process.env[p.key];
    components[`provider_${p.label.toLowerCase().replace(/\s+/g, '_')}`] = {
      status: val && val.length >= 10 ? 'healthy' : 'degraded',
      message: val ? 'Configure' : 'Non configure',
      latency: Date.now() - startP,
    };
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

  log.info('Healthcheck', { status, components: Object.keys(components).length, duration: Date.now() - start });

  return NextResponse.json(report, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
      'X-Health-Status': status,
      'X-Health-Version': pkg.version || '0.1.0',
      'X-Health-Duration': `${Date.now() - start}ms`,
    },
  });
}
