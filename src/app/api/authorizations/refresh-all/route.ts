import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { refreshExpiredTokens, refreshSingleToken } from '@/lib/oauth/token-refresher';
import { prisma } from '@/lib/prisma';





export const dynamic = "force-dynamic";
export async function POST() {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const authorizations = await prisma.workflowAuthorization.findMany({
      where: { userId: session.user.id, isActive: true, refreshToken: { not: null } },
      select: { id: true, service: true, accountName: true },
    });

    let refreshed = 0;
    let failed = 0;

    for (const auth of authorizations) {
      const success = await refreshSingleToken(auth.id);
      if (success) refreshed++;
      else failed++;
    }

    return NextResponse.json({
      message: `Rafraichissement termine: ${refreshed} reussis, ${failed} echoues`,
      total: authorizations.length,
      refreshed,
      failed,
    });
  } catch (error) {
    console.error('POST /authorizations/refresh-all error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
