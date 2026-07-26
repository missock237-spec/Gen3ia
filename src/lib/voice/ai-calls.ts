import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { SpeechToTextEngine } from '@/lib/voice/stt';
import { synthesizeSpeech } from '@/lib/voice/tts';
import { createAIRouter } from '@/lib/ai-router';
import { VoiceMemorySystem } from '@/lib/voice/voice-memory';
const log = createLogger('ai-calls');
export interface AICallConfig { provider: 'twilio' | 'whatsapp'; fromNumber: string; toNumber: string; agentId: string; language: string; maxDurationMinutes: number; recordingEnabled: boolean; }
export interface AICallSession { id: string; config: AICallConfig; status: 'ringing' | 'connected' | 'ended' | 'failed'; startedAt: string; endedAt?: string; recordingUrl?: string; transcript: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>; }
const activeCalls = new Map<string, AICallSession>();
async function initiateTwilioCall(callId: string, config: AICallConfig): Promise<{ callSid: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error('Twilio credentials not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/voice/calls/twiml?callId=${callId}`;
    const formData = new URLSearchParams();
    formData.append('To', config.toNumber);
    formData.append('From', config.fromNumber);
    formData.append('Url', twimlUrl);
    formData.append('Timeout', '30');
    if (config.recordingEnabled) formData.append('Record', 'true');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Twilio call initiation failed: ${res.status}`);
    const data = await res.json();
    return { callSid: data.sid };
  } finally { clearTimeout(timer); }
}
async function initiateWhatsAppCall(callId: string, config: AICallConfig): Promise<{ callSid: string }> {
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_API_TOKEN) throw new Error('WhatsApp credentials not configured');
  return { callSid: `wa_${callId}` };
}
export class AICallSystem {
  async initiateCall(config: AICallConfig, userId: string): Promise<AICallSession> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const session: AICallSession = { id: callId, config, status: 'ringing', startedAt: new Date().toISOString(), transcript: [] };
    try {
      await db.voiceCall.create({ data: { id: callId, userId, agentId: config.agentId, provider: config.provider, fromNumber: config.fromNumber, toNumber: config.toNumber, status: 'ringing', language: config.language, maxDurationMinutes: config.maxDurationMinutes, recordingEnabled: config.recordingEnabled, metadata: JSON.stringify({ initiatedBy: userId }) } });
    } catch (error) { log.warn('Failed to persist call session', { error: String(error) }); }
    try {
      const result = config.provider === 'twilio' ? await initiateTwilioCall(callId, config) : await initiateWhatsAppCall(callId, config);
      await db.voiceCall.update({ where: { id: callId }, data: { callSid: result.callSid } }).catch(() => {});
      log.info('AI call initiated', { callId, provider: config.provider, callSid: result.callSid });
    } catch (error) {
      session.status = 'failed';
      throw error;
    }
    activeCalls.set(callId, session);
    return session;
  }
  async handleIncomingCall(callSid: string, from: string, to: string): Promise<AICallSession> {
    const callId = `call_incoming_${Date.now()}`;
    const session: AICallSession = { id: callId, config: { provider: 'twilio', fromNumber: from, toNumber: to, agentId: 'default', language: 'en-US', maxDurationMinutes: 30, recordingEnabled: false }, status: 'connected', startedAt: new Date().toISOString(), transcript: [] };
    await db.voiceCall.create({ data: { id: callId, userId: 'system', provider: 'twilio', fromNumber: from, toNumber: to, status: 'connected', callSid, metadata: JSON.stringify({ direction: 'inbound' }) } }).catch(() => {});
    activeCalls.set(callId, session);
    return session;
  }
  async processCallAudio(callId: string, audioChunk: Buffer, userId: string): Promise<Buffer | null> {
    const session = activeCalls.get(callId);
    if (!session || session.status !== 'connected') return null;
    try {
      const stt = new SpeechToTextEngine(userId);
      const sttResult = await stt.transcribe(audioChunk, { language: session.config.language });
      const userText = sttResult.text.trim();
      if (!userText) return null;
      session.transcript.push({ role: 'user', content: userText, timestamp: new Date().toISOString() });
      const router = createAIRouter(userId);
      const messages = [{ role: 'system' as const, content: `You are an AI phone assistant. Keep responses brief. Language: ${session.config.language}.` }, ...session.transcript.slice(-8).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))];
      const aiResponse = await router.chat(messages, { model: 'fast' });
      session.transcript.push({ role: 'assistant', content: aiResponse.content, timestamp: new Date().toISOString() });
      const ttsResult = await synthesizeSpeech({ text: aiResponse.content, language: session.config.language, speed: 1.0 });
      await db.voiceCall.update({ where: { id: callId }, data: { transcript: JSON.stringify(session.transcript) } }).catch(() => {});
      return Buffer.from(ttsResult.audioUrl || '');
    } catch (error) { log.error('Failed to process call audio', { callId, error: String(error) }); return null; }
  }
  async endCall(callId: string): Promise<void> {
    const session = activeCalls.get(callId);
    if (!session) return;
    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    const durationSeconds = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    await db.voiceCall.update({ where: { id: callId }, data: { status: 'ended', endedAt: new Date(), durationSeconds, transcript: JSON.stringify(session.transcript) } }).catch(() => {});
    if (session.transcript.length > 0) {
      try {
        await new VoiceMemorySystem().storeMemory('system', session.transcript.map(m => `${m.role}: ${m.content}`).join('\n'), undefined, { type: 'conversation', callId });
      } catch (error) { log.warn('Failed to save call memory', { error: String(error) }); }
    }
    activeCalls.delete(callId);
  }
  async getCallStatus(callId: string): Promise<AICallSession> {
    const activeSession = activeCalls.get(callId);
    if (activeSession) return activeSession;
    const dbCall = await db.voiceCall.findUnique({ where: { id: callId } });
    if (!dbCall) throw new Error(`Call ${callId} not found`);
    return { id: dbCall.id, config: { provider: dbCall.provider as 'twilio' | 'whatsapp', fromNumber: dbCall.fromNumber, toNumber: dbCall.toNumber, agentId: dbCall.agentId ?? 'default', language: dbCall.language, maxDurationMinutes: dbCall.maxDurationMinutes, recordingEnabled: dbCall.recordingEnabled }, status: dbCall.status as AICallSession['status'], startedAt: dbCall.startedAt.toISOString(), endedAt: dbCall.endedAt?.toISOString(), recordingUrl: dbCall.recordingUrl ?? undefined, transcript: JSON.parse(dbCall.transcript || '[]') };
  }
  async listCalls(userId: string, options: { status?: string; limit?: number; offset?: number } = {}): Promise<{ calls: AICallSession[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;
    const where = { userId, ...(status ? { status } : {}) };
    const [calls, total] = await Promise.all([
      db.voiceCall.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      db.voiceCall.count({ where }),
    ]);
    return { calls: calls.map(c => ({ id: c.id, config: { provider: c.provider as 'twilio' | 'whatsapp', fromNumber: c.fromNumber, toNumber: c.toNumber, agentId: c.agentId ?? 'default', language: c.language, maxDurationMinutes: c.maxDurationMinutes, recordingEnabled: c.recordingEnabled }, status: c.status as AICallSession['status'], startedAt: c.startedAt.toISOString(), endedAt: c.endedAt?.toISOString(), recordingUrl: c.recordingUrl ?? undefined, transcript: JSON.parse(c.transcript || '[]') })), total };
  }
}