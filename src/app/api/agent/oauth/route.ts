// route: GET /api/agent/oauth
import { NextRequest, NextResponse } from 'next/server';

const VALID_PLATFORMS = new Set([
  'gmail', 'google_calendar', 'google_drive', 'slack', 'discord',
  'github', 'notion', 'twitter', 'linkedin', 'shopify', 'stripe',
  'supabase', 'web_browser'
]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const platform = searchParams.get('platform') || searchParams.get('state');
  if (!code || !platform) {
    return NextResponse.json({ error: 'code et platform requis' }, { status: 400 });
  }
  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Plateforme non valide' }, { status: 400 });
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const safeCode = encodeURIComponent(code);
  const safePlatform = encodeURIComponent(platform);
  return NextResponse.redirect(appUrl + '/agent?code=' + safeCode + '&platform=' + safePlatform);
}