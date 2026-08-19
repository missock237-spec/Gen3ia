import { NextRequest, NextResponse } from 'next/server';
import { getRelayStatus, relayChat, relaySynthesizeSpeech, relayGenerateImage, relayGenerateVideo, relayGenerateAudio } from '@/lib/relay/relay-router';
import { createLogger } from '@/lib/logger';

export const dynamic = "force-dynamic";
const log = createLogger('api-relay');

export async function GET() {
  try {
    const status = await getRelayStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    log.error('Relay status error', { error: String(error) });
    return NextResponse.json({ success: false, error: 'Failed to get relay status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'chat': {
        const { messages, preferFree, maxCost } = body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
          return NextResponse.json({ success: false, error: 'messages array required' }, { status: 400 });
        }
        const result = await relayChat(messages, { preferFree, maxCost });
        return NextResponse.json({ success: true, data: result });
      }

      case 'tts': {
        const { text, language } = body;
        if (!text) return NextResponse.json({ success: false, error: 'text required' }, { status: 400 });
        const result = await relaySynthesizeSpeech(text, language || 'en-US');
        return NextResponse.json({ success: true, data: result });
      }

      case 'image': {
        const { prompt } = body;
        if (!prompt) return NextResponse.json({ success: false, error: 'prompt required' }, { status: 400 });
        const result = await relayGenerateImage(prompt);
        return NextResponse.json({ success: true, data: result });
      }

      case 'video': {
        const { prompt } = body;
        if (!prompt) return NextResponse.json({ success: false, error: 'prompt required' }, { status: 400 });
        const result = await relayGenerateVideo(prompt);
        return NextResponse.json({ success: true, data: result });
      }

      case 'audio': {
        const { prompt } = body;
        if (!prompt) return NextResponse.json({ success: false, error: 'prompt required' }, { status: 400 });
        const result = await relayGenerateAudio(prompt);
        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}. Available: chat, tts, image, video, audio`,
        }, { status: 400 });
    }
  } catch (error) {
    log.error('Relay API error', { error: String(error) });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Relay error' }, { status: 500 });
  }
}