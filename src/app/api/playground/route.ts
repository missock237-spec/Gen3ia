import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { createAIRouter } from '@/lib/ai-router';
import { createComputeEngine } from '@/lib/compute/engine';
import { createHuggingFaceClient } from '@/lib/generation/huggingface-client';
import { getServerSession } from 'next-auth';

const log = createLogger('api-playground');

enum PlaygroundEndpoint {
  CHAT = 'chat',
  IMAGE = 'image',
  AUDIO = 'audio',
  TRANSLATE = 'translate',
  SUMMARIZE = 'summarize',
  COMPUTE = 'compute',
  STREAM = 'stream',
}

const ENDPOINT_INFO: Record<PlaygroundEndpoint, { description: string; params: Record<string, string>; example: string }> = {
  [PlaygroundEndpoint.CHAT]: {
    description: 'Chat avec l\'IA via le routeur adaptatif',
    params: { messages: 'Tableau de messages [{role, content}]', model: 'fast|default|powerful (optionnel)', provider: 'groq|openai|anthropic|huggingface (optionnel)' },
    example: JSON.stringify({ messages: [{ role: 'user', content: 'Bonjour !' }], model: 'fast' }, null, 2),
  },
  [PlaygroundEndpoint.IMAGE]: {
    description: 'Génération d\'image via HuggingFace (gratuit)',
    params: { prompt: 'Description de l\'image', model: 'stable-diffusion|flux|openjourney (optionnel)', width: '512-1024', height: '512-1024' },
    example: JSON.stringify({ prompt: 'A futuristic cityscape at sunset' }, null, 2),
  },
  [PlaygroundEndpoint.AUDIO]: {
    description: 'Génération audio/musique via HuggingFace (gratuit)',
    params: { prompt: 'Description du son/musique', model: 'musicgen|bark (optionnel)' },
    example: JSON.stringify({ prompt: 'Jazz piano with soft drums' }, null, 2),
  },
  [PlaygroundEndpoint.TRANSLATE]: {
    description: 'Traduction de texte (modèle NLLB gratuit)',
    params: { text: 'Texte à traduire', sourceLang: 'Langue source', targetLang: 'Langue cible' },
    example: JSON.stringify({ text: 'Hello world', sourceLang: 'eng', targetLang: 'fra' }, null, 2),
  },
  [PlaygroundEndpoint.SUMMARIZE]: {
    description: 'Résumé de texte via BART (gratuit)',
    params: { text: 'Texte à résumer', maxLength: 'Longueur max du résumé (optionnel)' },
    example: JSON.stringify({ text: 'Long text to summarize...' }, null, 2),
  },
  [PlaygroundEndpoint.COMPUTE]: {
    description: 'Calcul matriciel via WebGPU/Workers',
    params: { operation: 'matrix_multiply|vector_add|sigmoid|softmax|relu', data: 'Tableau de nombres' },
    example: JSON.stringify({ operation: 'vector_add', data: [1, 2, 3] }, null, 2),
  },
  [PlaygroundEndpoint.STREAM]: {
    description: 'Streaming SSE de chat (temps réel)',
    params: { userId: 'ID utilisateur' },
    example: '/api/events?userId=test',
  },
};

async function handleChat(body: { messages?: Array<{ role: string; content: string }>; model?: string; provider?: string }) {
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages requis (tableau non vide)' }, { status: 400 });
  }
  const modelTier = (body.model === 'fast' || body.model === 'powerful') ? body.model as 'fast' | 'powerful' : 'default';
  const router = createAIRouter('playground');
  const response = await router.chat(
    body.messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
    { model: modelTier, provider: body.provider }
  );
  return NextResponse.json({ success: true, data: { content: response.content, provider: response.provider, model: response.model, costUsd: response.costUsd, usage: response.usage } });
}

async function handleImage(body: { prompt?: string; model?: string; width?: number; height?: number }) {
  if (!body.prompt) return NextResponse.json({ error: 'prompt requis' }, { status: 400 });
  const hf = createHuggingFaceClient();
  const result = await hf.generateImage(body.prompt, { model: body.model, width: body.width, height: body.height });
  return NextResponse.json({ success: true, data: { imageSize: `${result.base64.length} caractères base64`, model: result.model, durationMs: result.durationMs } });
}

async function handleAudio(body: { prompt?: string; model?: string }) {
  if (!body.prompt) return NextResponse.json({ error: 'prompt requis' }, { status: 400 });
  const hf = createHuggingFaceClient();
  const result = await hf.generateAudio(body.prompt, { model: body.model });
  return NextResponse.json({ success: true, data: { audioSize: result.audioUrl.length, durationMs: result.durationMs } });
}

async function handleTranslate(body: { text?: string; sourceLang?: string; targetLang?: string }) {
  if (!body.text) return NextResponse.json({ error: 'text requis' }, { status: 400 });
  const hf = createHuggingFaceClient();
  const result = await hf.translate(body.text, body.sourceLang || 'eng', body.targetLang || 'fra');
  return NextResponse.json({ success: true, data: { translatedText: result.text, model: result.model, durationMs: result.durationMs } });
}

async function handleSummarize(body: { text?: string; maxLength?: number }) {
  if (!body.text) return NextResponse.json({ error: 'text requis' }, { status: 400 });
  const hf = createHuggingFaceClient();
  const result = await hf.summarize(body.text, { maxLength: body.maxLength || 150 });
  return NextResponse.json({ success: true, data: { summary: result.text, model: result.model, durationMs: result.durationMs } });
}

async function handleCompute(body: { operation?: string; data?: number[] }) {
  if (!body.operation || !body.data) return NextResponse.json({ error: 'operation et data requis' }, { status: 400 });
  const engine = createComputeEngine();
  const result = await engine.compute(body.operation, new Float32Array(body.data), { backend: 'cpu' });
  return NextResponse.json({ success: result.success, data: { result: result.data, backend: result.backend, durationMs: result.durationMs }, error: result.error });
}

export async function GET() {
  return NextResponse.json({
    name: 'Genova API Playground', version: '0.5.0',
    description: 'API interactive pour tester tous les endpoints Genova',
    baseUrl: '/api/playground',
    methods: { GET: 'Documentation', POST: 'Exécuter un appel API' },
    endpoints: ENDPOINT_INFO,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint } = body;
    if (!endpoint || !Object.values(PlaygroundEndpoint).includes(endpoint as PlaygroundEndpoint)) {
      return NextResponse.json({ error: `Endpoint invalide. Valeurs: ${Object.values(PlaygroundEndpoint).join(', ')}`, availableEndpoints: ENDPOINT_INFO }, { status: 400 });
    }
    log.info('Playground request', { endpoint });
    switch (endpoint) {
      case 'chat': return handleChat(body);
      case 'image': return handleImage(body);
      case 'audio': return handleAudio(body);
      case 'translate': return handleTranslate(body);
      case 'summarize': return handleSummarize(body);
      case 'compute': return handleCompute(body);
      case 'stream': return NextResponse.json({ info: 'Utilisez un client SSE (EventSource)', url: '/api/events?userId=your_user_id' });
      default: return NextResponse.json({ error: 'Non implémenté' }, { status: 501 });
    }
  } catch (error) {
    log.error('Playground error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Erreur interne du playground' }, { status: 500 });
  }
}