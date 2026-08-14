import { createLogger } from '@/lib/logger';
import { getRelaySystem, getNextAIProvider, getNextVoiceProvider, getNextImageProvider, getNextVideoProvider, getNextAudioProvider, RelayModality } from './relay-system';

const log = createLogger('relay-integrator');

enum AIAction {
  CHAT = 'chat',
  REASONING = 'reasoning',
  ANALYSIS = 'analysis',
  CODE = 'code',
}

interface AICallResult {
  content: string;
  provider: string;
  model: string;
  isFree: boolean;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface VoiceCallResult {
  audioUrl: string;
  provider: string;
  model: string;
  isFree: boolean;
  durationMs: number;
}

interface ImageCallResult {
  imageUrl: string;
  provider: string;
  model: string;
  isFree: boolean;
}

interface VideoCallResult {
  videoUrl: string;
  provider: string;
  model: string;
  isFree: boolean;
}

interface AudioCallResult {
  audioUrl: string;
  provider: string;
  model: string;
  isFree: boolean;
}

export class RelayIntegrator {
  async chat(messages: Array<{ role: string; content: string }>, action: AIAction = AIAction.CHAT): Promise<AICallResult> {
    const relay = getRelaySystem();
    const result = await relay.executeWithRelay<AICallResult>(
      RelayModality.REASONING,
      async (provider, model) => {
        const apiKey = this.getApiKey(provider);
        if (!apiKey) throw new Error(`${provider} API key not configured`);

        const endpoint = this.getEndpoint(provider);
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const body: Record<string, unknown> = { model, messages, max_tokens: 4096 };

        if (provider === 'anthropic') {
          const systemMsg = messages.find(m => m.role === 'system')?.content || '';
          const userMsgs = messages.filter(m => m.role !== 'system');
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          body.system = systemMsg;
          body.messages = userMsgs;
          delete (body as any).messages;
          (body as any).messages = userMsgs;
        } else if (provider === 'groq' || provider === 'openai' || provider === 'openrouter') {
          headers['Authorization'] = `Bearer ${apiKey}`;
          if (provider === 'openrouter') {
            headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          }
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`${provider} API error ${res.status}: ${errText.slice(0, 200)}`);
        }

        const data = await res.json();
        let content = '';
        let promptTokens = 0;
        let completionTokens = 0;

        if (provider === 'anthropic') {
          content = data.content?.find((c: any) => c.type === 'text')?.text || '';
          promptTokens = data.usage?.input_tokens || 0;
          completionTokens = data.usage?.output_tokens || 0;
        } else {
          content = data.choices?.[0]?.message?.content || '';
          promptTokens = data.usage?.prompt_tokens || 0;
          completionTokens = data.usage?.completion_tokens || 0;
        }

        return {
          content,
          provider,
          model,
          isFree: ['huggingface', 'groq'].includes(provider) || model.includes('free'),
          usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
        };
      },
      { preferFree: true }
    );

    return result.result;
  }

  async synthesizeSpeech(text: string, language: string = 'en-US'): Promise<VoiceCallResult> {
    const relay = getRelaySystem();
    const result = await relay.executeWithRelay<VoiceCallResult>(
      RelayModality.VOICE,
      async (provider, model) => {
        const apiKey = this.getApiKey(provider);

        if (provider === 'huggingface') {
          if (!apiKey) throw new Error('HUGGINGFACE_TOKEN not configured');
          const res = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ inputs: text }),
              signal: AbortSignal.timeout(120000),
            }
          );
          if (!res.ok) throw new Error(`HuggingFace TTS error: ${res.status}`);
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          return {
            audioUrl: `data:audio/wav;base64,${base64}`,
            provider: 'huggingface',
            model,
            isFree: true,
            durationMs: Math.round(text.length * 60),
          };
        }

        if (provider === 'elevenlabs') {
          if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
          const res = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
            {
              method: 'POST',
              headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
              body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
              signal: AbortSignal.timeout(60000),
            }
          );
          if (!res.ok) throw new Error(`ElevenLabs TTS error: ${res.status}`);
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          return {
            audioUrl: `data:audio/mp3;base64,${base64}`,
            provider: 'elevenlabs',
            model,
            isFree: false,
            durationMs: Math.round(text.length * 50),
          };
        }

        throw new Error(`Unknown voice provider: ${provider}`);
      },
      { preferFree: true }
    );

    return result.result;
  }

  async generateImage(prompt: string): Promise<ImageCallResult> {
    const relay = getRelaySystem();
    const result = await relay.executeWithRelay<ImageCallResult>(
      RelayModality.IMAGE,
      async (provider, model) => {
        const apiKey = this.getApiKey(provider);

        if (provider === 'huggingface') {
          if (!apiKey) throw new Error('HUGGINGFACE_TOKEN not configured');
          const res = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4, guidance_scale: 3.5 } }),
              signal: AbortSignal.timeout(120000),
            }
          );
          if (!res.ok) throw new Error(`HuggingFace Image error: ${res.status}`);
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          return {
            imageUrl: `data:image/png;base64,${base64}`,
            provider: 'huggingface',
            model,
            isFree: true,
          };
        }

        if (provider === 'openai') {
          if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
          const res = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
            signal: AbortSignal.timeout(60000),
          });
          if (!res.ok) throw new Error(`OpenAI Image error: ${res.status}`);
          const data = await res.json();
          return {
            imageUrl: data.data?.[0]?.url || '',
            provider: 'openai',
            model,
            isFree: false,
          };
        }

        throw new Error(`Unknown image provider: ${provider}`);
      },
      { preferFree: true }
    );

    return result.result;
  }

  async generateVideo(prompt: string): Promise<VideoCallResult> {
    const relay = getRelaySystem();
    const result = await relay.executeWithRelay<VideoCallResult>(
      RelayModality.VIDEO,
      async (provider, model) => {
        const apiKey = this.getApiKey(provider);

        if (provider === 'huggingface') {
          if (!apiKey) throw new Error('HUGGINGFACE_TOKEN not configured');
          const res = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ inputs: prompt }),
              signal: AbortSignal.timeout(300000),
            }
          );
          if (!res.ok) throw new Error(`HuggingFace Video error: ${res.status}`);
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          return {
            videoUrl: `data:video/mp4;base64,${base64}`,
            provider: 'huggingface',
            model,
            isFree: true,
          };
        }

        throw new Error(`Unknown video provider: ${provider}`);
      },
      { preferFree: true }
    );

    return result.result;
  }

  async generateAudio(prompt: string): Promise<AudioCallResult> {
    const relay = getRelaySystem();
    const result = await relay.executeWithRelay<AudioCallResult>(
      RelayModality.AUDIO,
      async (provider, model) => {
        const apiKey = this.getApiKey(provider);

        if (provider === 'huggingface') {
          if (!apiKey) throw new Error('HUGGINGFACE_TOKEN not configured');
          const res = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 256 } }),
              signal: AbortSignal.timeout(180000),
            }
          );
          if (!res.ok) throw new Error(`HuggingFace Audio error: ${res.status}`);
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          return {
            audioUrl: `data:audio/wav;base64,${base64}`,
            provider: 'huggingface',
            model,
            isFree: true,
          };
        }

        if (provider === 'openai') {
          if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
          const res = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input: prompt, voice: 'alloy', response_format: 'mp3' }),
            signal: AbortSignal.timeout(60000),
          });
          if (!res.ok) throw new Error(`OpenAI Audio error: ${res.status}`);
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          return {
            audioUrl: `data:audio/mp3;base64,${base64}`,
            provider: 'openai',
            model,
            isFree: false,
          };
        }

        throw new Error(`Unknown audio provider: ${provider}`);
      },
      { preferFree: true }
    );

    return result.result;
  }

  async getRelayReport() {
    const relay = getRelaySystem();
    await relay.flushUsage();
    return relay.getUsageReport();
  }

  private getEndpoint(provider: string): string {
    const endpoints: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      huggingface: 'https://api-inference.huggingface.co/v1/chat/completions',
    };
    return endpoints[provider] || endpoints.openai;
  }

  private getApiKey(provider: string): string | undefined {
    const keys: Record<string, string | undefined> = {
      groq: process.env.GROQ_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      huggingface: process.env.HUGGINGFACE_TOKEN,
      elevenlabs: process.env.ELEVENLABS_API_KEY,
    };
    return keys[provider];
  }
}

export function createRelayIntegrator(): RelayIntegrator {
  return new RelayIntegrator();
}