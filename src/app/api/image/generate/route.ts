import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/image/huggingface-image';

/**
 * POST /api/image/generate
 * Generate image from text prompt using Hugging Face
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      prompt,
      negativePrompt = '',
      width = 512,
      height = 512,
      numSteps = 30,
      guidanceScale = 7.5,
      model = 'flux',
    } = body;

    if (!prompt || prompt.length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (prompt.length > 1000) {
      return NextResponse.json(
        { error: 'Prompt too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    if (width < 256 || width > 1024 || height < 256 || height > 1024) {
      return NextResponse.json(
        { error: 'Width and height must be between 256 and 1024' },
        { status: 400 }
      );
    }

    // Generate image
    const result = await generateImage({
      prompt,
      negativePrompt,
      width,
      height,
      numInferenceSteps: numSteps,
      guidanceScale,
      model: model as 'flux' | 'stable-diffusion-v2',
    });

    return NextResponse.json({
      success: true,
      data: {
        image: result.image.toString('base64'),
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        generationTime: result.generationTime,
        seed: result.seed,
      },
    });
  } catch (error) {
    console.error('[API] Image generation error:', error);
    return NextResponse.json(
      { error: 'Image generation failed' },
      { status: 500 }
    );
  }
}
