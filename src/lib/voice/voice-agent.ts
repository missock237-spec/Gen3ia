// ============================================================
// Voice Agent — Agent IA vocal capable de passer et répondre
// aux appels téléphoniques comme un humain
// ============================================================
// Utilise Twilio/Vonage pour la téléphonie, Deepgram/Whisper
// pour la transcription, ElevenLabs/OpenAI TTS pour la voix,
// et GPT/Claude pour la compréhension et réponse.
// ============================================================

import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export type VoiceProvider = 'twilio' | 'vonage' | 'plivo';
export type SttProvider = 'deepgram' | 'whisper' | 'google' | 'assemblyai';
export type TtsProvider = 'elevenlabs' | 'openai' | 'cartesia' | 'microsoft';
export type LlmProvider = 'openai' | 'anthropic' | 'groq' | 'openrouter';
export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'canceled';
export type CallDirection = 'inbound' | 'outbound';

export interface VoiceAgentConfig {
  id: string;
  name: string;
  voiceProvider: VoiceProvider;
  sttProvider: SttProvider;
  ttsProvider: TtsProvider;
  llmProvider: LlmProvider;
  llmModel: string;
  voiceId: string;
  language: string;
  systemPrompt: string;
  maxDurationMinutes: number;
  endCallDetection: boolean;
  interruptible: boolean;
  enableRecording: boolean;
  greetingMessage: string;
  postCallAnalysis: boolean;
  transferOnEscalation: string | null;
  knowledgeBase: string[];
}

export interface CallState {
  callSid: string;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  agentId: string;
  userId: string;
  transcript: TranscriptEntry[];
  startedAt: string;
  durationSeconds: number;
  context: Record<string, unknown>;
}

export interface TranscriptEntry {
  role: 'agent' | 'user' | 'system';
  text: string;
  timestamp: number;
  confidence: number;
  durationMs: number;
}

export interface CallAction {
  type: 'speak' | 'listen' | 'hangup' | 'transfer' | 'gather' | 'pause' | 'send_dtmf';
  payload?: string;
  parameters?: Record<string, unknown>;
}

export interface VoiceAgentAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  intent: string;
  entities: Record<string, string>;
  summary: string;
  actionItems: string[];
  escalationNeeded: boolean;
  score: number;
}

// ============================================================
// Voice Agent Engine
// ============================================================

export class VoiceAgentEngine {
  private configs: Map<string, VoiceAgentConfig> = new Map();
  private activeCalls: Map<string, CallState> = new Map();

  constructor() {
    this.loadConfigs();
  }

  private async loadConfigs(): Promise<void> {
    try {
      const agents = await db.agent.findMany({
        where: { type: 'voice' },
        select: { id: true, config: true },
      });
      for (const agent of agents) {
        try {
          const config = JSON.parse(agent.config) as VoiceAgentConfig;
          config.id = agent.id;
          this.configs.set(agent.id, config);
        } catch {}
      }
    } catch {}
  }

  async createVoiceAgent(
    userId: string,
    name: string,
    config: Partial<VoiceAgentConfig>
  ): Promise<{ id: string; config: VoiceAgentConfig }> {
    const defaultConfig: VoiceAgentConfig = {
      id: '',
      name,
      voiceProvider: 'twilio',
      sttProvider: 'deepgram',
      ttsProvider: 'elevenlabs',
      llmProvider: 'openai',
      llmModel: 'gpt-4o',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      language: 'fr-FR',
      systemPrompt: 'Tu es un assistant vocal professionnel et naturel. Réponds de manière concise et chaleureuse. Parle comme un humain.',
      maxDurationMinutes: 15,
      endCallDetection: true,
      interruptible: true,
      enableRecording: false,
      greetingMessage: 'Bonjour, ici Genova AI. Comment puis-je vous aider aujourd\'hui ?',
      postCallAnalysis: true,
      transferOnEscalation: null,
      knowledgeBase: [],
      ...config,
    };

    const agent = await db.agent.create({
      data: {
        name,
        type: 'voice',
        description: `Agent vocal : ${name}`,
        status: 'active',
        config: JSON.stringify(defaultConfig),
        userId,
      },
    });

    defaultConfig.id = agent.id;
    this.configs.set(agent.id, defaultConfig);

    return { id: agent.id, config: defaultConfig };
  }

  async makeCall(
    userId: string,
    agentId: string,
    toNumber: string,
    fromNumber: string,
    context?: Record<string, unknown>
  ): Promise<{ callSid: string; status: string }> {
    const config = this.configs.get(agentId);
    if (!config) throw new Error(`Agent vocal ${agentId} introuvable`);

    const voiceConfig = await db.userResource.findFirst({
      where: { userId, type: 'twilio' },
    });

    if (!voiceConfig?.apiKey) {
      throw new Error('Configuration téléphonique manquante. Connectez Twilio/Vonage.');
    }

    // Créer l'appel via Twilio
    const accountSid = voiceConfig.apiKey;
    const authToken = voiceConfig.config || process.env.TWILIO_AUTH_TOKEN || '';
    const twilioNumber = voiceConfig.endpoint || fromNumber;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: toNumber,
          From: twilioNumber,
          Url: `${process.env.GENOVA_API_URL || 'https://missock237-spec.github.io/Genova'}/api/voice/twiml?agent_id=${agentId}&user_id=${userId}`,
          StatusCallback: `${process.env.GENOVA_API_URL || 'https://missock237-spec.github.io/Genova'}/api/voice/status`,
          StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
          Timeout: '30',
          Record: config.enableRecording ? 'true' : 'false',
          MachineDetection: 'DetectMessageEnd',
        }).toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Échec de l'appel: ${error}`);
    }

    const data = await response.json();
    const callSid = data.sid;

    // Enregistrer l'appel en BDD
    await db.voiceCall.create({
      data: {
        userId,
        agentId,
        provider: 'twilio',
        callSid,
        fromNumber: twilioNumber,
        toNumber,
        status: 'queued',
        direction: 'outbound',
      },
    });

    // Initialiser l'état de l'appel
    this.activeCalls.set(callSid, {
      callSid,
      direction: 'outbound',
      fromNumber: twilioNumber,
      toNumber,
      status: 'queued',
      agentId,
      userId,
      transcript: [],
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      context: context || {},
    });

    return { callSid, status: 'queued' };
  }

  async handleIncomingCall(
    userId: string,
    agentId: string,
    fromNumber: string,
    toNumber: string,
    callSid: string
  ): Promise<CallAction[]> {
    const config = this.configs.get(agentId);
    if (!config) {
      return [{
        type: 'speak',
        payload: 'Désolé, l\'assistant n\'est pas disponible pour le moment.',
      }, { type: 'hangup' }];
    }

    await db.voiceCall.create({
      data: {
        userId,
        agentId,
        provider: 'twilio',
        callSid,
        fromNumber,
        toNumber,
        status: 'ringing',
        direction: 'inbound',
      },
    });

    this.activeCalls.set(callSid, {
      callSid,
      direction: 'inbound',
      fromNumber,
      toNumber,
      status: 'ringing',
      agentId,
      userId,
      transcript: [],
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      context: {},
    });

    return [
      {
        type: 'speak',
        payload: config.greetingMessage,
      },
      {
        type: 'listen',
        parameters: {
          language: config.language,
          endOnSilence: 1000,
          timeout: 10,
        },
      },
    ];
  }

  async processSpeech(
    callSid: string,
    transcript: string,
    confidence: number
  ): Promise<CallAction[]> {
    const callState = this.activeCalls.get(callSid);
    if (!callState) {
      return [{ type: 'hangup' }];
    }

    const config = this.configs.get(callState.agentId);
    if (!config) {
      return [{ type: 'speak', payload: 'Je ne peux pas continuer.' }, { type: 'hangup' }];
    }

    // Ajouter la transcription
    const entry: TranscriptEntry = {
      role: 'user',
      text: transcript,
      timestamp: Date.now(),
      confidence,
      durationMs: 0,
    };
    callState.transcript.push(entry);

    // Construire le contexte pour le LLM
    const conversationHistory = callState.transcript
      .map(t => `${t.role === 'agent' ? 'Assistant' : 'Utilisateur'}: ${t.text}`)
      .join('\n');

    const systemContext = `${config.systemPrompt}

Contexte de l'appel :
${JSON.stringify(callState.context)}

Historique :
${conversationHistory}`;

    // Appeler le LLM pour générer la réponse
    const llmResponse = await this.callLlm(config, systemContext, transcript);

    // Ajouter la réponse au transcript
    callState.transcript.push({
      role: 'agent',
      text: llmResponse,
      timestamp: Date.now(),
      confidence: 1.0,
      durationMs: 0,
    });

    const actions: CallAction[] = [
      {
        type: 'speak',
        payload: llmResponse,
      },
    ];

    // Détection de fin d'appel
    if (config.endCallDetection) {
      const endPhrases = ['au revoir', 'bonne journée', 'merci au revoir', 'ciao', 'bye', 'à bientôt', 'je vous remercie', 'je raccroche', 'terminé', 'c\'est tout'];
      const saidBye = endPhrases.some(phrase =>
        transcript.toLowerCase().includes(phrase) || llmResponse.toLowerCase().includes(phrase)
      );

      if (saidBye) {
        actions.push({ type: 'hangup' });
        await this.endCall(callSid);
        return actions;
      }
    }

    // Continuer à écouter
    actions.push({
      type: 'listen',
      parameters: {
        language: config.language,
        endOnSilence: 800,
        timeout: 15,
      },
    });

    return actions;
  }

  private async callLlm(
    config: VoiceAgentConfig,
    systemPrompt: string,
    userMessage: string
  ): Promise<string> {
    const apiKey = this.getApiKey(config.llmProvider);
    if (!apiKey) return 'Je ne peux pas répondre pour le moment. Veuillez réessayer.';

    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    };

    const endpoint = endpoints[config.llmProvider];
    if (!endpoint) return 'Erreur de configuration du modèle.';

    try {
      const body: Record<string, unknown> = {
        model: config.llmModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 250,
        temperature: 0.7,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.llmProvider === 'anthropic') {
        // BUGFIX: le body Anthropic attend `system` séparé et `messages`
        // sans rôle 'system'. On remplace le contenu — on ne le supprime pas.
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body.system = systemPrompt;
        body.messages = [{ role: 'user', content: userMessage }];
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) return 'Je n\'ai pas compris. Pouvez-vous répéter ?';

      const data = await response.json();

      if (config.llmProvider === 'anthropic') {
        return data.content?.[0]?.text || '...';
      }

      return data.choices?.[0]?.message?.content || '...';
    } catch {
      return 'Je n\'ai pas compris. Pouvez-vous répéter ?';
    }
  }

  private getApiKey(provider: string): string | undefined {
    const keys: Record<string, string | undefined> = {
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      groq: process.env.GROQ_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
    };
    return keys[provider];
  }

  async updateCallStatus(callSid: string, status: CallStatus): Promise<void> {
    const callState = this.activeCalls.get(callSid);
    if (callState) {
      callState.status = status;
      if (status === 'completed' || status === 'failed') {
        callState.durationSeconds = Math.floor(
          (Date.now() - new Date(callState.startedAt).getTime()) / 1000
        );
      }
    }

    await db.voiceCall.updateMany({
      where: { callSid },
      data: { status },
    });
  }

  async endCall(callSid: string): Promise<void> {
    const callState = this.activeCalls.get(callSid);
    if (callState) {
      callState.status = 'completed';
      callState.durationSeconds = Math.floor(
        (Date.now() - new Date(callState.startedAt).getTime()) / 1000
      );

      // Analyse post-appel
      if (this.configs.get(callState.agentId)?.postCallAnalysis) {
        await this.analyzeCall(callState);
      }

      // Mettre à jour le transcript en BDD
      await db.voiceCall.updateMany({
        where: { callSid },
        data: {
          status: 'completed',
          transcript: JSON.stringify(callState.transcript),
          durationSeconds: callState.durationSeconds,
        },
      });

      this.activeCalls.delete(callSid);
    }
  }

  private async analyzeCall(callState: CallState): Promise<VoiceAgentAnalysis> {
    const transcript = callState.transcript.map(t => t.text).join(' ');
    const analysis: VoiceAgentAnalysis = {
      sentiment: 'neutral',
      intent: 'unknown',
      entities: {},
      summary: '',
      actionItems: [],
      escalationNeeded: false,
      score: 0.5,
    };

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Analyse cette conversation téléphonique. Retourne UNIQUEMENT du JSON valide avec :
              - sentiment: positive|negative|neutral
              - intent: l'intention principale
              - entities: les entités extraites (nom, téléphone, email, etc.)
              - summary: résumé en 1 phrase
              - actionItems: liste des actions à prendre
              - escalationNeeded: true/false
              - score: 0.0 à 1.0`,
            },
            { role: 'user', content: transcript },
          ],
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        Object.assign(analysis, result);
      }
    } catch {}

    return analysis;
  }

  getActiveCall(callSid: string): CallState | undefined {
    return this.activeCalls.get(callSid);
  }

  getActiveCallsByUser(userId: string): CallState[] {
    return Array.from(this.activeCalls.values()).filter(c => c.userId === userId);
  }
}

// ============================================================
// Singleton
// ============================================================

let instance: VoiceAgentEngine | null = null;

export function getVoiceAgentEngine(): VoiceAgentEngine {
  if (!instance) {
    instance = new VoiceAgentEngine();
  }
  return instance;
}
