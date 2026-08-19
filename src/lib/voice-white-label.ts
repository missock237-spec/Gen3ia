// ============================================================
// VOICE WHITE-LABEL — Assistants vocaux personnalisables
// Support multicanal: Twilio, WebRTC, WebSocket, Asterisk
// ============================================================

import { createLogger } from './logger';

const log = createLogger('voice-white-label');

export type VoiceProvider = 'twilio' | 'webrtc' | 'websocket' | 'asterisk' | 'sip';

export interface VoiceAssistantConfig {
  id: string; userId: string; name: string; greeting: string;
  personality: string; voice: string; language: string;
  speed: number; pitch: number;
  avatar?: string; brandColor?: string; brandLogo?: string; brandName?: string;
  contextPrompt?: string; transferNumber?: string;
  channels: VoiceProvider[];
  widgetConfig?: { primaryColor: string; position: string; title: string; subtitle: string; showAvatar: boolean; autoOpen: boolean; delaySeconds: number };
  isActive: boolean; createdAt: Date;
}

export const DEFAULT_VOICES = [
  { id:'alloy', name:'Alloy', gender:'neutral', provider:'openai', preview:'Voix neutre' },
  { id:'echo', name:'Echo', gender:'male', provider:'openai', preview:'Voix masculine' },
  { id:'fable', name:'Fable', gender:'neutral', provider:'openai', preview:'Voix narrative' },
  { id:'nova', name:'Nova', gender:'female', provider:'openai', preview:'Voix feminine' },
  { id:'shimmer', name:'Shimmer', gender:'female', provider:'openai', preview:'Voix feminine claire' },
  { id:'21m00Tcm4TlvDq8ikWAM', name:'Rachel', gender:'female', provider:'elevenlabs', preview:'ElevenLabs Rachel' },
  { id:'EXAVITQu4vrVxn66xGdM', name:'Bella', gender:'female', provider:'elevenlabs', preview:'ElevenLabs Bella' },
  { id:'yoZ06aMxZJJ28mfd3POQ', name:'Sam', gender:'male', provider:'elevenlabs', preview:'ElevenLabs Sam' },
];

export const DEFAULT_PERSONALITIES = [
  { id:'professional', name:'Professionnel', prompt:'Tu es un assistant professionnel, courtois et efficace.' },
  { id:'friendly', name:'Amical', prompt:'Tu es un assistant amical et chaleureux.' },
  { id:'humorous', name:'Humouristique', prompt:'Tu es un assistant drole et leger.' },
  { id:'empathetic', name:'Empathique', prompt:'Tu es un assistant empathique.' },
  { id:'technical', name:'Technique', prompt:'Tu es un assistant technique et precis.' },
];

class VoiceWhiteLabelService {
  generateWidgetScript(config: VoiceAssistantConfig): string {
    const w = config.widgetConfig || { primaryColor:'#3b82f6', position:'bottom-right', title:config.name, subtitle:'Comment puis-je vous aider ?', showAvatar:true, autoOpen:false, delaySeconds:5 };
    const url = process.env.NEXT_PUBLIC_APP_URL || 'https://gen3ia-app.onrender.com';
    return '<div id="gen3ia-voice-widget"></div><script>(function(){var c={assistantId:"'+config.id+'",apiUrl:"'+url+'",primaryColor:"'+w.primaryColor+'",position:"'+w.position+'",title:"'+w.title+'",subtitle:"'+w.subtitle+'",brandName:"'+(config.brandName||config.name)+'",language:"'+config.language+'"};var s=document.createElement("script");s.src=c.apiUrl+"/widgets/voice-widget.js";s.async=true;s.onload=function(){Gen3iaVoiceWidget.init(c)};document.head.appendChild(s)})();</script>';
  }

  buildSystemPrompt(config: VoiceAssistantConfig): string {
    const p = DEFAULT_PERSONALITIES.find(x => x.id === config.personality);
    return 'Tu es '+config.name+', un assistant vocal.\n\nPersonnalite: '+(p?.prompt||'Tu es un assistant utile.')+'\n\nRegles:\n- Parle en '+(config.language==='fr'?'francais':config.language)+'.\n- Reponses courtes et naturelles.\n'+(config.contextPrompt?'\nContexte: '+config.contextPrompt:'')+'\n\nPremier message: "'+(config.greeting||'Bonjour !')+'"';
  }

  createDefaultConfig(userId: string, name: string): VoiceAssistantConfig {
    return { id:'va_'+Date.now(), userId, name, greeting:'Bonjour ! Je suis '+name+', votre assistant vocal.', personality:'professional', voice:'alloy', language:'fr', speed:1.0, pitch:1.0, channels:['webrtc','twilio'], widgetConfig:{ primaryColor:'#3b82f6', position:'bottom-right', title:name, subtitle:'Comment puis-je vous aider ?', showAvatar:true, autoOpen:false, delaySeconds:5 }, isActive:true, createdAt:new Date() };
  }
}

export const voiceWhiteLabel = new VoiceWhiteLabelService();
export default voiceWhiteLabel;
