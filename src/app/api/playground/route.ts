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
    example: JSON.stringify({ prompt: 'A futuristic cityscape at sunset', model: 'stabilityai/stable-diffusion-3.5-large-turbo' }, null, 2),
  },
  [PlaygroundEndpoint.AUDIO]: {
    description: 'Génération audio/musique via HuggingFace (gratuit)',
    params: { prompt: 'Description du son/musique', model: 'musicgen|bark (optionnel)' },
    example: JSON.stringify({ prompt: 'Jazz piano with soft drums', model: 'facebook/musicgen-small' }, null, 2),
  },
  [PlaygroundEndpoint.TRANSLATE]: {
    description: 'Traduction de texte (modèle NLLB gratuit)',
    params: { text: 'Texte à traduire', sourceLang: 'Langue source', targetLang: 'Langue cible' },
    example: JSON.stringify({ text: 'Hello world', sourceLang: 'eng', targetLang: 'fra' }, null, 2),
  },
  [PlaygroundEndpoint.SUMMARIZE]: {
    description: 'Résumé de texte via BART (gratuit)',
    params: { text: 'Texte à résumer', maxLength: 'Longueur max du résumé (optionnel)' },
    example: JSON.stringify({ text: 'Long text to summarize...', maxLength: 150 }, null, 2),
  },
  [PlaygroundEndpoint.COMPUTE]: {
    description: 'Calcul matriciel via WebGPU/Workers',
    params: { operation: 'matrix_multiply|vector_add|sigmoid|softmax|relu', data: 'Tableau de nombres' },
    example: JSON.stringify({ operation: 'matrix_multiply', data: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, null, 2),
  },
  [PlaygroundEndpoint.STREAM]: {
    description: 'Streaming SSE de chat (temps réel)',
    params: { messages: 'Tableau de messages', endpoint: 'events/route.ts' },
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

  return NextResponse.json({
    success: true,
    data: {
      content: response.content,
      provider: response.provider,
      model: response.model,
      costUsd: response.costUsd,
      usage: response.usage,
    },
  });
}

async function handleImage(body: { prompt?: string; model?: string; width?: number; height?: number }) {
  if (!body.prompt) return NextResponse.json({ error: 'prompt requis' }, { status: 400 });

  const hf = createHuggingFaceClient();
  const result = await hf.generateImage(body.prompt, {
    model: body.model || 'stabilityai/stable-diffusion-3.5-large-turbo',
    width: body.width || 1024,
    height: body.height || 1024,
  });

  return NextResponse.json({
    success: true,
    data: {
      imageUrl: result.imageUrl.startsWith('data:') ? result.imageUrl.slice(0, 100) + '...' : result.imageUrl,
      model: result.model,
      durationMs: result.durationMs,
    },
  });
}

async function handleAudio(body: { prompt?: string; model?: string }) {
  if (!body.prompt) return NextResponse.json({ error: 'prompt requis' }, { status: 400 });

  const hf = createHuggingFaceClient();
  const result = await hf.generateAudio(body.prompt, {
    model: body.model || 'facebook/musicgen-small',
  });

  return NextResponse.json({
    success: true,
    data: {
      audioUrl: result.audioUrl.startsWith('data:') ? `${result.audioUrl.slice(0, 50)}... [${result.audioUrl.length} caractères]` : result.audioUrl,
      durationMs: result.durationMs,
    },
  });
}

async function handleTranslate(body: { text?: string; sourceLang?: string; targetLang?: string }) {
  if (!body.text) return NextResponse.json({ error: 'text requis' }, { status: 400 });

  const hf = createHuggingFaceClient();
  const result = await hf.translate(
    body.text,
    body.sourceLang || 'eng',
    body.targetLang || 'fra'
  );

  return NextResponse.json({
    success: true,
    data: {
      translatedText: result.text,
      model: result.model,
      durationMs: result.durationMs,
    },
  });
}

async function handleSummarize(body: { text?: string; maxLength?: number }) {
  if (!body.text) return NextResponse.json({ error: 'text requis' }, { status: 400 });

  const hf = createHuggingFaceClient();
  const result = await hf.summarize(body.text, {
    maxLength: body.maxLength || 150,
  });

  return NextResponse.json({
    success: true,
    data: {
      summary: result.text,
      model: result.model,
      durationMs: result.durationMs,
    },
  });
}

async function handleCompute(body: { operation?: string; data?: number[] }) {
  if (!body.operation || !body.data) {
    return NextResponse.json({ error: 'operation et data requis' }, { status: 400 });
  }

  const engine = createComputeEngine();
  const result = await engine.compute(
    body.operation,
    new Float32Array(body.data),
    { backend: 'cpu' }
  );

  return NextResponse.json({
    success: result.success,
    data: {
      result: result.data,
      backend: result.backend,
      durationMs: result.durationMs,
    },
    error: result.error,
  });
}

export async function GET() {
  // Documentation de l\'API Playground
  const session = await getServerSession();

  return NextResponse.json({
    name: 'Genova API Playground',
    version: '0.4.0',
    description: 'API interactive pour tester tous les endpoints Genova',
    auth: session?.user ? `Authentifié en tant que ${session.user.email}` : 'Non authentifié — certaines fonctionnalités peuvent être limitées',
    baseUrl: '/api/playground',
    methods: {
      GET: 'Documentation des endpoints disponibles',
      POST: 'Exécuter un appel API sur un endpoint spécifique',
    },
    endpoints: ENDPOINT_INFO,
    example_request: {
      endpoint: 'chat',
      body: { messages: [{ role: 'user', content: 'Bonjour' }], model: 'fast' },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint || !Object.values(PlaygroundEndpoint).includes(endpoint as PlaygroundEndpoint)) {
      return NextResponse.json({
        error: `Endpoint invalide. Valeurs acceptées: ${Object.values(PlaygroundEndpoint).join(', ')}`,
        availableEndpoints: ENDPOINT_INFO,
      }, { status: 400 });
    }

    log.info('Playground request', { endpoint, hasSession: !!session });

    switch (endpoint) {
      case PlaygroundEndpoint.CHAT:
        return handleChat(body);
      case PlaygroundEndpoint.IMAGE:
        return handleImage(body);
      case PlaygroundEndpoint.AUDIO:
        return handleAudio(body);
      case PlaygroundEndpoint.TRANSLATE:
        return handleTranslate(body);
      case PlaygroundEndpoint.SUMMARIZE:
        return handleSummarize(body);
      case PlaygroundEndpoint.COMPUTE:
        return handleCompute(body);
      case PlaygroundEndpoint.STREAM:
        return NextResponse.json({
          info: 'Utilisez un client SSE (EventSource) pour vous connecter',
          url: '/api/events?userId=your_user_id',
        });
      default:
        return NextResponse.json({ error: 'Endpoint non implémenté' }, { status: 501 });
    }
  } catch (error) {
    log.error('Playground error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: 'Erreur interne du playground' }, { status: 500 });
  }
}
