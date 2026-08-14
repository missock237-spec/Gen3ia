// Approvals API — Approbation des actions agent nécessitant validation
// GET: lister les approbations en attente
// POST: approuver/refuser une demande

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { applySecurity, secureResponse } from '@/lib/security';
import { getPendingConsents, approveConsent, denyConsent } from '@/lib/agent-engine/consent-manager';





export const dynamic = "force-dynamic";
const log = createLogger('approvals');

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const consents = await getPendingConsents(auth.userId);
    return NextResponse.json({ consents, total: consents.length });
  } catch (error) {
    log.error('approvals_fetch_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { requestId, action } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Champs requis: requestId, action' }, { status: 400 });
    }

    if (action === 'approve') {
      const success = await approveConsent(requestId, auth.userId);
      if (!success) return NextResponse.json({ error: 'Impossible d\'approuver la demande' }, { status: 404 });
      log.info('consent_approved', { requestId });
      return NextResponse.json({ message: 'Demande approuvee', status: 'approved' });
    }

    if (action === 'deny') {
      const success = await denyConsent(requestId, auth.userId);
      if (!success) return NextResponse.json({ error: 'Impossible de refuser la demande' }, { status: 404 });
      log.info('consent_denied', { requestId });
      return NextResponse.json({ message: 'Demande refusee', status: 'denied' });
    }

    return NextResponse.json({ error: 'Action invalide. Utilise "approve" ou "deny"' }, { status: 400 });
  } catch (error) {
    log.error('approvals_post_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
