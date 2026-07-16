import { NextRequest, NextResponse } from 'next/server';
import { SSOManager } from '@/lib/auth/saml';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');
  const redirectTo = searchParams.get('redirectTo');

  if (!provider) {
    return NextResponse.json({ error: 'Provider requis' }, { status: 400 });
  }

  try {
    const ssoManager = new SSOManager();
    const loginUrl = ssoManager.getLoginUrl(provider, redirectTo || '/dashboard');
    return NextResponse.redirect(loginUrl);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
