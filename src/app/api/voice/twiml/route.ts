// ============================================================
// TwiML Webhook — Génère le XML Twilio pour les appels vocaux
// Point d'entrée appelé par Twilio quand un appel démarre
// ============================================================

import { NextRequest } from 'next/server';
import { getVoiceAgentEngine } from '@/lib/voice/voice-agent';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string || '';
    const from = formData.get('From') as string || '';
    const to = formData.get('To') as string || '';
    const agentId = request.nextUrl.searchParams.get('agent_id') || '';
    const userId = request.nextUrl.searchParams.get('user_id') || '';

    const engine = getVoiceAgentEngine();
    const actions = await engine.handleIncomingCall(userId, agentId, from, to, callSid);

    // Générer TwiML
    let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

    for (const action of actions) {
      switch (action.type) {
        case 'speak':
          twiml += `  <Say voice="alice" language="${action.parameters?.language || 'fr-FR'}">${escapeXml(action.payload || '')}</Say>\n`;
          break;

        case 'listen': {
          const timeout = (action.parameters?.timeout as number) || 10;
          const endOnSilence = (action.parameters?.endOnSilence as number) || 1000;
          const language = (action.parameters?.language as string) || 'fr-FR';
          twiml += `  <Gather input="speech" timeout="${timeout}" speechTimeout="auto" language="${language}" enhanced="true" speechModel="phone_call" action="/api/voice/transcript?call_sid=${callSid}" method="POST">\n`;
          twiml += `    <Pause length="1"/>\n`;
          twiml += `  </Gather>\n`;
          twiml += `  <Redirect>/api/voice/twiml?agent_id=${agentId}&user_id=${userId}</Redirect>\n`;
          break;
        }

        case 'gather':
          twiml += `  <Gather numDigits="${action.parameters?.numDigits || '1'}" timeout="${action.parameters?.timeout || '10'}" action="/api/voice/dtmf?call_sid=${callSid}" method="POST">\n`;
          if (action.payload) {
            twiml += `    <Say voice="alice" language="fr-FR">${escapeXml(action.payload)}</Say>\n`;
          }
          twiml += `  </Gather>\n`;
          break;

        case 'hangup':
          twiml += '  <Hangup/>\n';
          break;

        case 'pause':
          twiml += `  <Pause length="${action.parameters?.length || '1'}"/>\n`;
          break;

        case 'transfer':
          twiml += `  <Dial>${escapeXml(action.payload || '')}</Dial>\n`;
          break;

        case 'send_dtmf':
          twiml += `  <Play digits="${escapeXml(action.payload || '')}"/>\n`;
          break;
      }
    }

    twiml += '</Response>';

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
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
