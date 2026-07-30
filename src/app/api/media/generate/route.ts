import { NextRequest, NextResponse } from 'next/server';
import { hfGeneration } from '@/lib/media';
import { createLogger } from '@/lib/logger';
const log = createLogger('api-media');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, type = 'image', model, negativePrompt, width, height } = body;
    if (!prompt) return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });
    const enhancedPrompt = await hfGeneration.enhancePrompt(prompt);
    const result = type === 'video'
      ? await hfGeneration.generateVideo(enhancedPrompt, { model, width, height })
      : await hfGeneration.generateImage(enhancedPrompt, { model, negativePrompt, width, height });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
    log.info('generated', { type, model: result.model, ms: result.latencyMs });
    return NextResponse.json({ success: true, dataUrl: result.dataUrl, model: result.model, latencyMs: result.latencyMs, mimeType: result.mimeType });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur de generation' }, { status: 500 });
  }
}
