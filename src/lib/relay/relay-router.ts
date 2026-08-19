import { createLogger } from '@/lib/logger';
import { getRelaySystem, RelayModality } from '@/lib/relay/relay-system';
import { createRelayIntegrator } from '@/lib/relay/relay-integrator';
import { AIMessage, AIResponse } from '@/lib/ai-router';

const log = createLogger('relay-router');
const relay = getRelaySystem();
const integrator = createRelayIntegrator();

export async function relayChat(
  messages: AIMessage[],
  options?: { preferFree?: boolean; maxCost?: number }
): Promise<AIResponse> {
  const startTime = Date.now();

  // Verifier si un provider est disponible via le relay
  const available = await relay.getNextAvailable(RelayModality.REASONING, {
    preferFree: options?.preferFree ?? true,
    maxCost: options?.maxCost,
  });

  if (!available) {
    throw new Error('All AI reasoning providers are exhausted. Check your quotas or upgrade your plan.');
  }

  log.info('Relay router: selected provider', {
    provider: available.provider,
    model: available.model,
    isFree: available.isFree,
    dailyRemaining: available.dailyRemaining,
    stepInChain: available.stepIndex + 1,
  });

  // Utiliser l'integrator qui gere l'appel API + tracking
  const result = await integrator.chat(
    messages.map(m => ({ role: m.role, content: m.content }))
  );

  // Si l'integrator a reussi, on retourne le resultat
  if (result) {
    return {
      content: result.content,
      usage: result.usage,
      provider: result.provider,
      model: result.model,
      costUsd: result.isFree ? 0 : 0.001,
      latencyMs: Date.now() - startTime,
    };
  }

  throw new Error('Relay chat failed: no provider could complete the request');
}

export async function relaySynthesizeSpeech(
  text: string,
  language: string = 'en-US'
): Promise<{ audioUrl: string; provider: string; isFree: boolean; durationMs: number }> {
  const available = await relay.getNextAvailable(RelayModality.VOICE, { preferFree: true });

  if (!available) {
    throw new Error('All voice synthesis providers are exhausted');
  }

  log.info('Relay router: selected voice provider', {
    provider: available.provider,
    model: available.model,
    isFree: available.isFree,
    dailyRemaining: available.dailyRemaining,
  });

  const result = await integrator.synthesizeSpeech(text, language);
  return result;
}

export async function relayGenerateImage(
  prompt: string
): Promise<{ imageUrl: string; provider: string; isFree: boolean }> {
  const available = await relay.getNextAvailable(RelayModality.IMAGE, { preferFree: true });

  if (!available) {
    throw new Error('All image generation providers are exhausted');
  }

  log.info('Relay router: selected image provider', {
    provider: available.provider,
    model: available.model,
    isFree: available.isFree,
    dailyRemaining: available.dailyRemaining,
  });

  const result = await integrator.generateImage(prompt);
  return result;
}

export async function relayGenerateVideo(
  prompt: string
): Promise<{ videoUrl: string; provider: string; isFree: boolean }> {
  const available = await relay.getNextAvailable(RelayModality.VIDEO, { preferFree: true });

  if (!available) {
    throw new Error('All video generation providers are exhausted');
  }

  const result = await integrator.generateVideo(prompt);
  return result;
}

export async function relayGenerateAudio(
  prompt: string
): Promise<{ audioUrl: string; provider: string; isFree: boolean }> {
  const available = await relay.getNextAvailable(RelayModality.AUDIO, { preferFree: true });

  if (!available) {
    throw new Error('All audio generation providers are exhausted');
  }

  const result = await integrator.generateAudio(prompt);
  return result;
}

export async function getRelayStatus() {
  await relay.flushUsage();
  const report = await relay.getUsageReport();
  return {
    reasoning: report.filter(r => r.modality === 'reasoning'),
    voice: report.filter(r => r.modality === 'voice'),
    image: report.filter(r => r.modality === 'image'),
    video: report.filter(r => r.modality === 'video'),
    audio: report.filter(r => r.modality === 'audio'),
  };
}