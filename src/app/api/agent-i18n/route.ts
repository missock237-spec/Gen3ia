import { NextRequest, NextResponse } from 'next/server';
import { languageDetector, SupportedLanguage } from '@/lib/agent-i18n';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agent-i18n
 * Fetches the user's language profile.
 * Query param: ?userId=<string>
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';

    const profile = await languageDetector.getLanguageProfile(userId);
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch language profile', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent-i18n
 * Updates the user's language profile.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId || 'default';

    const updates: {
      preferredLanguage?: SupportedLanguage;
      fallbackLanguage?: SupportedLanguage;
      autoDetect?: boolean;
      agentOverrides?: { [agentId: string]: SupportedLanguage };
      rtl?: boolean;
    } = {};

    if (body.preferredLanguage) updates.preferredLanguage = body.preferredLanguage;
    if (body.fallbackLanguage) updates.fallbackLanguage = body.fallbackLanguage;
    if (typeof body.autoDetect === 'boolean') updates.autoDetect = body.autoDetect;
    if (body.agentOverrides && typeof body.agentOverrides === 'object') {
      updates.agentOverrides = body.agentOverrides;
    }
    if (typeof body.rtl === 'boolean') updates.rtl = body.rtl;

    await languageDetector.updateLanguageProfile(userId, updates);
    const updatedProfile = await languageDetector.getLanguageProfile(userId);

    return NextResponse.json(updatedProfile);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update language profile', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/agent-i18n
 * Alias for POST to update language profile.
 */
export async function PUT(request: NextRequest) {
  return POST(request);
}
