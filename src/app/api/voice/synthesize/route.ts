import { NextRequest, NextResponse } from 'next/server';
import { synthesizeText } from '@/lib/tts/huggingface-tts';

/**
 * POST /api/voice/synthesize
 * Generate speech from text
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, language = 'en', emotion = 'neutral', speed = 1.0, pitch = 1.0 } = body;

    if (!text || text.length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Text too long (max 5000 characters)' },
        { status: 400 }
      );
    }

    // Synthesize
    const result = await synthesizeText(text, {
      language,
      emotion: emotion as any,
      speed,
      pitch,
    });

    return NextResponse.json({
      success: true,
      data: {
        audio: result.audio.toString('base64'),
        mimeType: result.mimeType,
        duration: result.duration,
        sampleRate: result.sampleRate,
        channels: result.channels,
      },
    });
  } catch (error) {
    console.error('[API] Synthesis error:', error);
    return NextResponse.json(
      { error: 'Synthesis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
