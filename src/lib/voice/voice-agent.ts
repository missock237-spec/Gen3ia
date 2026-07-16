/**
 * Voice AI — Parler avec les agents
 * STT (Speech-to-Text) + TTS (Text-to-Speech)
 */

import { generateText } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';

const log = createLogger('voice-agent');

// ============================================================
// Types
// ============================================================

export interface VoiceInteractionResult {
  transcript: string;
  response: string;
  audioUrl?: string;
  durationMs: number;
}

// ============================================================
// Speech-to-Text (Reconnaissance vocale)
// ============================================================

/**
 * Transcrit un fichier audio en texte via Hugging Face Whisper (gratuit)
 */
export async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'audio/webm',
          },
          body: audioBuffer,
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.text || '';
      }
    } catch (err) {
      log.warn('Whisper API failed, using browser STT', { error: String(err) });
    }
  }

  // Fallback: le navigateur gère le STT côté client
  // Le texte sera envoyé par le frontend
  return '';
}

// ============================================================
// Text-to-Speech (Synthèse vocale)
// ============================================================

/**
 * Convertit du texte en audio via Hugging Face TTS (gratuit)
 */
export async function synthesizeSpeech(text: string): Promise<{ audioUrl: string; format: string }> {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;

  if (apiKey) {
    try {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/facebook/mms-tts-fra',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: text }),
        }
      );

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return {
          audioUrl: `data:audio/wav;base64,${base64}`,
          format: 'wav',
        };
      }
    } catch (err) {
      log.warn('TTS API failed, using browser TTS', { error: String(err) });
    }
  }

  // Fallback: utiliser l'API Web Speech du navigateur
  return { audioUrl: 'browser_tts', format: 'browser' };
}

// ============================================================
// Interaction vocale complète
// ============================================================

/**
 * Traite une commande vocale complète
 */
export async function processVoiceCommand(
  userId: string,
  transcript: string,
  agentId?: string,
): Promise<VoiceInteractionResult> {
  const startTime = Date.now();

  // Contexte agent
  let systemPrompt = 'Tu es un assistant vocal AI. Réponds de façon concise et naturelle.';
  if (agentId) {
    const { db } = await import('@/lib/db');
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (agent) {
      systemPrompt = `${agent.description}\n\nSois concis, tu es un assistant vocal.`;
    }
  }

  // Générer la réponse
  const result = await generateText(
    [{ role: 'user', content: transcript }],
    { systemPrompt },
  );

  // Synthétiser la réponse en audio
  const { audioUrl } = await synthesizeSpeech(result.content);

  log.info('Voice command processed', {
    userId,
    durationMs: Date.now() - startTime,
    transcriptLength: transcript.length,
  });

  return {
    transcript,
    response: result.content,
    audioUrl,
    durationMs: Date.now() - startTime,
  };
}

// ============================================================
// Route API
// ============================================================

export async function handleVoiceRequest(
  userId: string,
  audio?: ArrayBuffer,
  text?: string,
  agentId?: string,
): Promise<VoiceInteractionResult> {
  let transcript = text || '';

  // Si un fichier audio est fourni, le transcrire
  if (audio && !transcript) {
    transcript = await transcribeAudio(audio);
  }

  if (!transcript) {
    throw new Error('Aucun texte ou audio fourni');
  }

  return processVoiceCommand(userId, transcript, agentId);
}
