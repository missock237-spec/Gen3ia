/**
 * API Route: /api/multimodal/screen
 * POST: Process a screen capture frame
 * SECURITE: withAuth() + quota (traitement de frames = vision coûteuse)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createScreenShareHandler } from '@/lib/multimodal/screen-share';
import { withAuth, type RouteParams } from '@/lib/with-auth';

// Cache handlers per user for frame comparison

export const dynamic = "force-dynamic";
const handlers = new Map<string, ReturnType<typeof createScreenShareHandler>>();

export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const body = await request.json();
    const { imageData, width, height, windowTitle, _sessionId } = body;

    if (!imageData) {
      return NextResponse.json({ error: 'Screen frame data is required' }, { status: 400 });
    }

    // Get or create handler for this user
    let handler = handlers.get(auth.userId);
    if (!handler) {
      handler = createScreenShareHandler(auth.userId);
      handlers.set(auth.userId, handler);
    }

    const result = await handler.processFrame({
      data: imageData,
      width: width || 1920,
      height: height || 1080,
      timestamp: Date.now(),
      windowTitle: windowTitle || undefined,
    });

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screen frame processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 30, windowMs: 60000 },
  quota: true, // Le traitement de frames ecran consomme des tokens de vision LLM
});
