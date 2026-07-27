import { NextRequest, NextResponse } from 'next/server';
import { getOAuthProvider, buildAuthorizationUrl } from '@/lib/oauth/provider-registry';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';
import { randomUUID } from 'crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { service } = await params;
    const provider = getOAuthProvider(service);
    if (!provider) {
      return NextResponse.json({ error: 'Provider OAuth non supporte' }, { status: 400 });
    }

    const state = randomUUID();
    const codeVerifier = randomUUID().replace(/-/g, '').slice(0, 64);

    await prisma.oAuthState.create({
      data: {
        state,
        codeVerifier,
        userId: session.userId,
        service,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const redirectUri = `${request.nextUrl.origin}/api/auth/oauth/${service}/callback`;
    const authUrl = buildAuthorizationUrl(provider, redirectUri, state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('OAuth initiation error:', error);
    return NextResponse.json({ error: 'Erreur initiation OAuth' }, { status: 500 });
  }
}
