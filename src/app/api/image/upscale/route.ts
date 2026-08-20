import { NextRequest, NextResponse } from 'next/server';
import { upscaleImage } from '@/lib/image/huggingface-image';

/**
 * POST /api/image/upscale
 * Upscale and enhance image quality
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const scale = parseInt((formData.get('scale') as string) || '4');
    const tiling = formData.get('tiling') === 'true';

    if (!imageFile) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    if (![2, 4].includes(scale)) {
      return NextResponse.json(
        { error: 'Scale must be 2 or 4' },
        { status: 400 }
      );
    }

    // Convert image to buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Upscale
    const result = await upscaleImage(imageBuffer, {
      scale: scale as 2 | 4,
      tiling,
    });

    return NextResponse.json({
      success: true,
      data: {
        image: result.image.toString('base64'),
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        processingTime: result.generationTime,
      },
    });
  } catch (error) {
    console.error('[API] Image upscaling error:', error);
    return NextResponse.json(
      { error: 'Image upscaling failed' },
      { status: 500 }
    );
  }
}
