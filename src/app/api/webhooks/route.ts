// API Webhooks - Configuration et execution
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applySecurity } from '@/lib/security';
import { webhookEngine } from '@/lib/webhook-engine';

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') || 'configs';
    switch (scope) {
      case 'configs': { const configs = await webhookEngine.getConfigs(auth.userId); return NextResponse.json({ success: true, configs }); }
      case 'logs': { const configId = url.searchParams.get('configId') || undefined; const logs = await webhookEngine.getLogs(configId); return NextResponse.json({ success: true, logs }); }
      default: return NextResponse.json({ error: 'Scope inconnu' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  try {
    const body = await request.json();
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'create';
    switch (action) {
      case 'create': {
        const config = await webhookEngine.createConfig({ userId: auth.userId, name: body.name, url: body.url, method: body.method, headers: body.headers, secret: body.secret, retryCount: body.retryCount, timeout: body.timeout, template: body.template });
        return NextResponse.json({ success: true, config }, { status: 201 });
      }
      case 'execute': {
        if (body.configId) { const result = await webhookEngine.executeConfig(body.configId, body.data); return NextResponse.json({ success: true, result }); }
        const result = await webhookEngine.executeDirect({ url: body.url, method: body.method, headers: body.headers, body: body.data, secret: body.secret, retryCount: body.retryCount }, auth.userId);
        return NextResponse.json({ success: true, result });
      }
      case 'delete': {
        if (!body.configId) return NextResponse.json({ error: 'configId requis' }, { status: 400 });
        await webhookEngine.deleteConfig(body.configId, auth.userId);
        return NextResponse.json({ success: true });
      }
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}