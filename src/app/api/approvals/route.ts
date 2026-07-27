import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getPendingConsents, approveConsent, denyConsent } from '@/lib/agent-engine/consent-manager';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const consents = await getPendingConsents(session.userId);
    return NextResponse.json({ consents, total: consents.length });
  } catch (error) {
    console.error('GET /approvals error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = await request.json();
    const { requestId, action } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Champs requis: requestId, action' }, { status: 400 });
    }

    if (action === 'approve') {
      const success = await approveConsent(requestId, session.userId);
      if (!success) {
        return NextResponse.json({ error: 'Impossible d\'approuver la demande' }, { status: 404 });
      }
      return NextResponse.json({ message: 'Demande approuvee', status: 'approved' });
    }

    if (action === 'deny') {
      const success = await denyConsent(requestId, session.userId);
      if (!success) {
        return NextResponse.json({ error: 'Impossible de refuser la demande' }, { status: 404 });
      }
      return NextResponse.json({ message: 'Demand refuse', status: 'denied' });
    }

    return NextResponse.json({ error: 'Action invalide. Utilise "approve" ou "deny"' }, { status: 400 });
  } catch (error) {
    console.error('POST /approvals error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
