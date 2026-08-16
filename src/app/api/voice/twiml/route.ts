import { NextRequest } from 'next/server';
import { getVoiceAgentEngine } from '@/lib/voice/voice-agent';
import { db } from '@/lib/db';





export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string || '';
    const from = formData.get('From') as string || '';
    const to = formData.get('To') as string || '';
    const agentId = request.nextUrl.searchParams.get('agent_id') || '';

    // Résoudre l'utilisateur via le numéro Twilio appelé (to)
    // Le webhook Twilio ne transmet pas de userId, on le déduit
    // du numéro de téléphone Twilio configuré par l'utilisateur
    let userId = request.nextUrl.searchParams.get('user_id') || '';

    if (!userId && to) {
      const resource = await db.userResource.findFirst({
        where: { type: 'twilio', endpoint: to, isActive: true },
        select: { userId: true },
      });
      if (resource) {
        userId = resource.userId;
      }
    }

    // Dernier fallback : chercher dans les voix configs
    if (!userId && to) {
      const voiceCall = await db.voiceCall.findFirst({
        where: { toNumber: to },
        orderBy: { createdAt: 'desc' },
        select: { userId: true },
      });
      if (voiceCall) {
        userId = voiceCall.userId;
      }
    }

    const engine = getVoiceAgentEngine();
    const actions = await engine.handleIncomingCall(userId, agentId, from, to, callSid);

    let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

    for (const action of actions) {
      switch (action.type) {
        case 'speak':
          twiml += `  <Say voice="alice" language="${action.parameters?.language || 'fr-FR'}">${escapeXml(action.payload || '')}</Say>\n`;
          break;
        case 'listen': {
          const timeout = (action.parameters?.timeout as number) || 10;
          const language = (action.parameters?.language as string) || 'fr-FR';
          twiml += `  <Gather input="speech" timeout="${timeout}" speechTimeout="auto" language="${language}" enhanced="true" speechModel="phone_call" action="/api/voice/transcript?call_sid=${callSid}" method="POST">\n`;
          twiml += `    <Pause length="1"/>\n`;
          twiml += `  </Gather>\n`;
          twiml += userId
            ? `  <Redirect>/api/voice/twiml?agent_id=${agentId}&user_id=${userId}</Redirect>\n`
            : '  <Redirect>/api/voice/twiml</Redirect>\n';
          break;
        }
        case 'hangup':
          twiml += '  <Hangup/>\n';
          break;
        case 'transfer':
          twiml += `  <Dial>${escapeXml(action.payload || '')}</Dial>\n`;
          break;
      }
    }

    twiml += '</Response>';

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  } catch {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice" language="fr-FR">Désolé, une erreur technique est survenue. Veuillez rappeler plus tard.</Say>\n  <Hangup/>\n</Response>`;
    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
