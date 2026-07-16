// route: GET /api/agent/oauth
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const platform = searchParams.get('platform') || searchParams.get('state');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return NextResponse.redirect(appUrl + '/agent?code=' + (code || '') + '&platform=' + (platform || ''));
}
