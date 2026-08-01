/**
 * API Route: /api/multimodal/vision
 * POST: Analyze an image using the vision engine
 * SECURITE: withAuth() + quota (vision = LLM coûteux en tokens)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createVisionEngine } from '@/lib/multimodal/vision-engine';
import { withAuth } from '@/lib/with-auth';

export const POST = withAuth(async (request: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    let imageData: Buffer | string;
    let options: Record<string, boolean> = {};

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const imageFile = formData.get('image') as File | null;

      if (!imageFile) {
        return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
      }

      const arrayBuffer = await imageFile.arrayBuffer();
      imageData = Buffer.from(arrayBuffer);

      options = {
        detectObjects: formData.get('detectObjects') !== 'false',
        extractText: formData.get('extractText') !== 'false',
        describeScene: formData.get('describeScene') !== 'false',
        generateTags: formData.get('generateTags') !== 'false',
      };
    } else {
      const body = await request.json();
      const { image, ...opts } = body;

      if (!image) {
        return NextResponse.json({ error: 'Image data is required (base64 or file upload)' }, { status: 400 });
      }

      imageData = image;
      options = opts;
    }

    const engine = createVisionEngine(auth.userId);
    const result = await engine.analyzeImage(imageData, options);

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vision analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 10, windowMs: 60000 }, // 10 analyses visuelles/min max (coûteux)
  quota: true, // L'analyse d'image consomme beaucoup de tokens LLM
});
