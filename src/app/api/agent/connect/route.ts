import { NextRequest, NextResponse } from 'next/server';
import { agentOrchestrator, Platform } from '@/lib/agent/agent-orchestrator';
import { isFeatureActive } from '@/lib/config/features';

const VALID_PLATFORMS = new Set<Platform>([
  'gmail', 'google_calendar', 'google_drive', 'slack', 'discord',
  'github', 'notion', 'twitter', 'linkedin', 'shopify', 'stripe',
  'supabase', 'web_browser'
]);

export async function POST(request: NextRequest) {
  try {
    const { userId, platform, authCode } = await request.json();
    if (!userId || !platform || !authCode) {
      return NextResponse.json({ error: 'userId, platform et authCode requis' }, { status: 400 });
    }
    if (!VALID_PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Plateforme non valide: ' + platform }, { status: 400 });
    }
    const platformFeatures: {[key:string]: string} = {
      gmail: 'google_oauth',
      google_calendar: 'google_oauth',
      google_drive: 'google_oauth',
      slack: 'slack_bot',
      discord: 'discord_bot',
      github: 'github_oauth',
      stripe: 'stripe_payments',
    };
    const featureKey = platformFeatures[platform];
    if (featureKey && !isFeatureActive(featureKey as any)) {
      return NextResponse.json({
        error: 'Plateforme non configuree',
        message: 'Cette plateforme n\'est pas active. Configurez les variables d\'environnement necessaires.',
        platform,
      }, { status: 503 });
    }
    const success = await agentOrchestrator.connect(userId, platform);
    return NextResponse.json({ success, message: success ? 'Plateforme connectee' : 'Echec de connexion' });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const platform = searchParams.get('platform');
  if (!userId || !platform) {
    return NextResponse.json({ error: 'userId et platform requis' }, { status: 400 });
  }
  if (!VALID_PLATFORMS.has(platform as Platform)) {
    return NextResponse.json({ error: 'Plateforme non valide: ' + platform }, { status: 400 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = agentOrchestrator.getOAuthURL(platform as Platform, appUrl + '/api/agent/oauth/callback');
  return NextResponse.json({ url, requiresConfig: !isFeatureActive('google_oauth') });
}