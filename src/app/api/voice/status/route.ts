// ============================================================
// Call Status Webhook — Reçoit les mises à jour de statut
// des appels depuis Twilio (initiated, ringing, answered,
// completed, failed, busy, no-answer)
// ============================================================

import { NextRequest } from 'next/server';
import { getVoiceAgentEngine } from '@/lib/voice/voice-agent';

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string || '';
    const callStatus = formData.get('CallStatus') as string || '';
    const fromNumber = formData.get('From') as string || '';
    const toNumber = formData.get('To') as string || '';
    const duration = formData.get('CallDuration') as string || '0';
    const answeredBy = formData.get('AnsweredBy') as string || '';
    const callerName = formData.get('CallerName') as string || '';
    const durationSeconds = parseInt(duration, 10) || 0;

    const engine = getVoiceAgentEngine();

    // Mapper les statuts Twilio vers les statuts Genova
    const statusMap: Record<string, string> = {
      'initiated': 'queued',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'in-progress-answered': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no-answer',
      'canceled': 'canceled',
    };

    const mappedStatus = statusMap[callStatus] || callStatus;

    // Mettre à jour le statut dans le moteur
    await engine.updateCallStatus(callSid, mappedStatus as any);

    // Si l'appel est terminé, finaliser
    if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus)) {
      await engine.endCall(callSid);
    }

    return new Response('OK', { status: 200 });
  } catch {
    return new Response('OK', { status: 200 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
