import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getN8nClient } from '@/lib/integrations/n8n-client';
import { getAdEngine } from '@/lib/advertising/ad-engine';

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

  // 1. Base de données
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
      message: 'n8n non configuré ou inaccessible',
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

  // 4. Système de fichiers / mémoire
  const memoryUsage = process.memoryUsage();
  components.memory = {
    status: memoryUsage.heapUsed < 500 * 1024 * 1024 ? 'healthy' : 'degraded',
    message: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB utilisés`,
  };

  // Statut global
  const allHealthy = Object.values(components).every(c => c.status === 'healthy');
  const anyUnhealthy = Object.values(components).some(c => c.status === 'unhealthy');

  const status: HealthReport['status'] = allHealthy ? 'healthy' : anyUnhealthy ? 'unhealthy' : 'degraded';

  const report: HealthReport = {
    status,
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    uptime: Math.floor(process.uptime()),
    components,
  };

  const httpStatus = status === 'unhealthy' ? 503 : status === 'degraded' ? 200 : 200;

  return NextResponse.json(report, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
