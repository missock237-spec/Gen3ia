import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';

async function checkDatabase(): Promise<boolean> {
  try { await db.$queryRaw`SELECT 1`; return true; } catch { return false; }
}

interface HealthComponent {
  status: string;
  heapUsed?: string;
  heapTotal?: string;
  uptime?: string;
  node?: string;
  env?: string;
  [key: string]: unknown;
}

async function getDetailedReport(): Promise<Record<string, HealthComponent>> {
  const components: Record<string, HealthComponent> = {};
  const dbOk = await checkDatabase();
  components.database = { status: dbOk ? 'healthy' : 'unhealthy' };
  const mem = process.memoryUsage();
  components.memory = { status: 'ok', heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`, heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB` };
  components.uptime = { status: 'ok', uptime: `${Math.floor(process.uptime())}s` };
  components.node = { status: 'ok', node: process.version };
  components.env = { status: 'ok', env: process.env.NODE_ENV };
  const providers: Array<{ key: string; label: string }> = [
    { key: 'OPENAI_API_KEY', label: 'openai' },
    { key: 'ANTHROPIC_API_KEY', label: 'anthropic' },
    { key: 'HUGGINGFACE_TOKEN', label: 'huggingface' },
    { key: 'STRIPE_SECRET_KEY', label: 'stripe' },
    { key: 'REDIS_URL', label: 'redis' },
  ];
  for (const p of providers) {
    components[p.label] = { status: process.env[p.key] ? 'configured' : 'not_configured' };
  }
  return components;
}

export async function GET(request: NextRequest) {
  const dbOk = await checkDatabase();
  const status = dbOk ? 'healthy' : 'unhealthy';

  // Mode detaille : reserve aux admins authentifies
  const url = new URL(request.url);
  if (url.searchParams.get('detailed') === 'true') {
    const session = await getServerSession(authOptions);
    if (session?.user?.role === 'admin') {
      const components = await getDetailedReport();
      return NextResponse.json({ status, timestamp: new Date().toISOString(), components });
    }
    return NextResponse.json({ error: 'Non autorise' }, { status: 403 });
  }

  // Mode public : retourne uniquement le statut
  return NextResponse.json(
    { status },
    {
      status: status === 'unhealthy' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store', 'X-Health-Status': status },
    },
  );
}
