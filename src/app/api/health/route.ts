import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';

async function checkDatabase(): Promise<boolean> {
  try { await db.$queryRaw`SELECT 1`; return true; } catch { return false; }
}

async function getDetailedReport() {
  const components: Record<string, any> = {};
  const dbOk = await checkDatabase();
  components.database = { status: dbOk ? 'healthy' : 'unhealthy' };
  const mem = process.memoryUsage();
  components.memory = { heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`, heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB` };
  components.uptime = `${Math.floor(process.uptime())}s`;
  components.node = process.version;
  components.env = process.env.NODE_ENV;
  const providers = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'HUGGINGFACE_TOKEN', 'STRIPE_SECRET_KEY', 'REDIS_URL'];
  for (const p of providers) {
    components[p.toLowerCase()] = process.env[p] ? 'configured' : 'not_configured';
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
