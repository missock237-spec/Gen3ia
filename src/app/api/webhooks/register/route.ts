import { NextRequest, NextResponse } from 'next/server';
import { webhookManager } from '@/lib/webhooks/webhook-manager';

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, url, events } = await request.json();
    if (!userId || !url || !events) {
      return NextResponse.json({ error: 'userId, url et events requis' }, { status: 400 });
    }
    if (!isValidUrl(url)) {
      return NextResponse.json({ error: 'URL invalide. Seuls les protocoles http et https sont autorises.' }, { status: 400 });
    }
    const result = await webhookManager.register(userId, url, events);
    return NextResponse.json({ success: true, webhook: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
  return NextResponse.json({ webhooks: webhookManager.list(userId) });
}