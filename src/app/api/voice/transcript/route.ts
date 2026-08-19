// ============================================================
// Speech Transcript Webhook — Reçoit la transcription de la
// parole de l'utilisateur via Twilio, appelle le LLM,
// et retourne le TwiML avec la réponse vocale
// ============================================================

import { NextRequest } from 'next/server';
import { getVoiceAgentEngine } from '@/lib/voice/voice-agent';
import { db } from '@/lib/db';

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const callSid = request.nextUrl.searchParams.get('call_sid') || '';
    const speechResult = formData.get('SpeechResult') as string || '';
    const confidence = parseFloat(formData.get('Confidence') as string || '0.8');
    const fromNumber = formData.get('From') as string || '';

    if (!callSid) {
      return generateTwiML('Erreur technique. Veuillez rappeler.', true);
    }

    const engine = getVoiceAgentEngine();

    // Mettre à jour le statut de l'appel
    await engine.updateCallStatus(callSid, 'in-progress');

    // Si l'utilisateur n'a rien dit, demander de répéter
    if (!speechResult || speechResult.trim().length === 0) {
      const twiml = generateTwiML(
        'Je n\'ai pas entendu votre réponse. Pouvez-vous répéter ?',
        false
      );
      return twiml;
    }

    // Traiter la parole via le moteur d'agent vocal
    const actions = await engine.processSpeech(callSid, speechResult, confidence);

    // Générer TwiML
    let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

    for (const action of actions) {
      switch (action.type) {
        case 'speak': {
          const voice = fromNumber.startsWith('+237') ? 'Polly.Justin' : 'alice';
          const language = fromNumber.startsWith('+237') ? 'fr-FR' : 'en-US';
          twiml += `  <Say voice="${voice}" language="${language}">${escapeXml(action.payload || '')}</Say>\n`;
          break;
        }
        case 'listen':
          twiml += `  <Gather input="speech" timeout="10" speechTimeout="auto" language="fr-FR" enhanced="true" speechModel="phone_call" action="/api/voice/transcript?call_sid=${callSid}" method="POST">\n`;
          twiml += '    <Pause length="1"/>\n';
          twiml += '  </Gather>\n';
          break;
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
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  } catch (_error) {
    return generateTwiML('Désolé, une erreur est survenue. Nous vous rappelons rapidement.', true);
  }
}

function generateTwiML(message: string, hangup: boolean) {
  let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n`;
  twiml += `  <Say voice="alice" language="fr-FR">${escapeXml(message)}</Say>\n`;
  if (hangup) {
    twiml += '  <Hangup/>\n';
  }
  twiml += '</Response>';
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\\n/g, ' ')
    .replace(/\n/g, ' ');
}
