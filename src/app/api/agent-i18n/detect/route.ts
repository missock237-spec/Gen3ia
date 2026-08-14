import { NextRequest, NextResponse } from 'next/server';
import { languageDetector } from '@/lib/agent-i18n';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agent-i18n/detect
 * Detects the language of input text.
 * Body: { text: string }
 * Returns DetectionResult
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body?.text ?? '';

    if (typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid payload. "text" field must be a string.' },
        { status: 400 }
      );
    }

    const detectionResult = languageDetector.detect(text);
    return NextResponse.json(detectionResult);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to perform language detection', details: String(error) },
      { status: 500 }
    );
  }
}
