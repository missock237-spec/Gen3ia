import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/stt/huggingface-stt';
import { analyzeVoiceCharacteristics, generateFingerprintId } from '@/lib/voice/fingerprint/speaker-analyzer';
import { detectEmotion } from '@/lib/voice/emotion/emotion-detector';

/**
 * POST /api/voice/transcribe
 * Transcribe audio to text with emotion and speaker identification
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const userId = formData.get('userId') as string | null;
    const language = (formData.get('language') as string) || undefined;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Convert audio to ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Transcribe
    const transcription = await transcribeAudio(audioBuffer, {
      language,
      punctuation: true,
      paragraphs: true,
    });

    // Analyze voice characteristics
    const audioData = new Float32Array(arrayBuffer);
    const characteristics = await analyzeVoiceCharacteristics(audioData, 16000);

    // Detect emotion
    const emotion = detectEmotion(characteristics);

    // Generate fingerprint
    const fingerprintId = generateFingerprintId(userId);

    return NextResponse.json({
      success: true,
      data: {
        text: transcription.text,
        language: transcription.language,
        confidence: transcription.confidence,
        paragraphs: transcription.paragraphs,
        duration: transcription.duration,
        
        // Voice analysis
        characteristics: {
          pitch: characteristics.pitch,
          energy: characteristics.energy,
          spectralCentroid: characteristics.spectralCentroid,
          zeroCrossingRate: characteristics.zeroCrossingRate,
          jitter: characteristics.jitter,
          shimmer: characteristics.shimmer,
        },
        
        // Emotion detection
        emotion: {
          detected: emotion.emotion,
          confidence: emotion.confidence,
          scores: emotion.scores,
          intensity: emotion.intensity,
        },
        
        fingerprintId,
      },
    });
  } catch (error) {
    console.error('[API] Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
