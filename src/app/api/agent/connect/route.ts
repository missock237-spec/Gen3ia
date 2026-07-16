import { NextRequest, NextResponse } from 'next/server';
import { agentOrchestrator } from '@/lib/agent/agent-orchestrator';

export async function POST(request: NextRequest) {
  try {
    const { userId, platform, authCode } = await request.json();
    if (!userId || !platform || !authCode) {
      return NextResponse.json({ error: 'userId, platform et authCode requis' }, { status: 400 });
    }
    const success = await agentOrchestrator.connectPlatform(userId, platform, authCode);
    return NextResponse.json({ success, message: success ? 'Plateforme connectée' : 'Échec de connexion' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const platform = searchParams.get('platform') as any;
  if (!userId || !platform) {
    return NextResponse.json({ error: 'userId et platform requis' }, { status: 400 });
  }
  const url = agentOrchestrator.getOAuthURL(platform, process.env.APP_URL + '/api/agent/oauth/callback');
  return NextResponse.json({ url });
}
