import { NextRequest, NextResponse } from 'next/server';
import { whatsappClient } from '@/lib/whatsapp';
import { createLogger } from '@/lib/logger';
const log = createLogger('api-whatsapp-send');

export async function POST(request: NextRequest) {
  try {
    const { to, type, text, templateName, buttons } = await request.json();
    if (!to) return NextResponse.json({ error: 'Numéro requis' }, { status: 400 });
    if (!whatsappClient.isConfigured()) return NextResponse.json({ error: 'WhatsApp non configuré' }, { status: 503 });
    
    let result;
    switch (type) {
      case 'template':
        result = await whatsappClient.sendTemplate(to, templateName || 'hello_world');
        break;
      case 'interactive':
        result = await whatsappClient.sendButtons(to, text || 'Choisissez', buttons || []);
        break;
      default:
        result = await whatsappClient.sendText(to, text || 'Bonjour de Gen3ia!');
    }
    
    return NextResponse.json(result);
  } catch (error) {
    log.error('whatsapp_send_error', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Erreur interne' }, { status: 500 });
  }
}
