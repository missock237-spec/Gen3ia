import { NextRequest, NextResponse } from 'next/server';
import { AgentVoiceManager } from '@/lib/voice/agent-voice-integration';

/**
 * POST /api/agent/voice-response
 * Generate agent voice response with emotion and personalization
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      agentId,
      responseText,
      emotion = 'neutral',
      language = 'en',
      speechRate = 1.0,
      pitch = 1.0,
    } = body;

    if (!agentId || !responseText) {
      return NextResponse.json(
        { error: 'agentId and responseText are required' },
        { status: 400 }
      );
    }

    if (responseText.length > 5000) {
      return NextResponse.json(
        { error: 'Response text too long (max 5000 characters)' },
        { status: 400 }
      );
    }

    // Create agent voice config
    const config = AgentVoiceManager.createAgentVoiceConfig(agentId, agentId);
    config.language = language;
    config.speechRate = speechRate;
    config.pitch = pitch;

    // Generate voice response
    const response = await AgentVoiceManager.generateVoiceResponse(
      agentId,
      responseText,
      config,
      {
        emotion: emotion as any,
        confidence: 0.9,
        scores: {
          neutral: emotion === 'neutral' ? 1 : 0.1,
          happy: emotion === 'happy' ? 1 : 0.1,
          sad: emotion === 'sad' ? 1 : 0.1,
          angry: emotion === 'angry' ? 1 : 0.1,
          surprised: emotion === 'surprised' ? 1 : 0.1,
          fearful: emotion === 'fearful' ? 1 : 0.1,
          disgusted: emotion === 'disgusted' ? 1 : 0.1,
        },
        intensity: 0.5,
        characteristics: {
          pitchVariation: 'medium',
          energyLevel: 'medium',
          speechRate: 'normal',
        },
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        audio: response.audio.toString('base64'),
        text: response.text,
        emotion: response.emotion.emotion,
        duration: response.duration,
        voiceProfileId: response.voiceProfileId,
      },
    });
  } catch (error) {
    console.error('[API] Agent voice response error:', error);
    return NextResponse.json(
      { error: 'Voice response generation failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
