import type { VoiceCharacteristics } from '../fingerprint/speaker-analyzer';

/**
 * Voice Emotion Detection
 * Detects emotional state from voice characteristics
 */

export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted';

export interface EmotionDetectionResult {
  emotion: Emotion;
  confidence: number;
  scores: Record<Emotion, number>;
  intensity: number; // 0-1, how intense the emotion is
  characteristics: {
    pitchVariation: string; // high/medium/low
    energyLevel: string; // high/medium/low
    speechRate: string; // fast/normal/slow
  };
}

/**
 * Detect emotion from voice characteristics
 */
export function detectEmotion(characteristics: VoiceCharacteristics): EmotionDetectionResult {
  const scores: Record<Emotion, number> = {
    neutral: 0,
    happy: 0,
    sad: 0,
    angry: 0,
    surprised: 0,
    fearful: 0,
    disgusted: 0,
  };

  // Analyze pitch characteristics
  const pitchFeatures = analyzePitchFeatures(characteristics);
  updateScoresFromPitch(scores, pitchFeatures);

  // Analyze energy characteristics
  const energyFeatures = analyzeEnergyFeatures(characteristics);
  updateScoresFromEnergy(scores, energyFeatures);

  // Analyze spectral characteristics
  const spectralFeatures = analyzeSpectralFeatures(characteristics);
  updateScoresFromSpectral(scores, spectralFeatures);

  // Analyze voice quality
  const voiceQuality = analyzeVoiceQuality(characteristics);
  updateScoresFromVoiceQuality(scores, voiceQuality);

  // Find dominant emotion
  const emotions = Object.entries(scores) as [Emotion, number][];
  const [dominantEmotion, confidence] = emotions.reduce((prev, curr) =>
    curr[1] > prev[1] ? curr : prev
  );

  // Calculate intensity
  const intensity = Math.min(1, Math.abs(characteristics.energy) / 100);

  return {
    emotion: dominantEmotion,
    confidence: Math.min(1, confidence / 4), // Normalize to 0-1
    scores: normalizeScores(scores),
    intensity,
    characteristics: {
      pitchVariation: pitchFeatures.variation > 50 ? 'high' : pitchFeatures.variation > 20 ? 'medium' : 'low',
      energyLevel: characteristics.energy > -20 ? 'high' : characteristics.energy > -40 ? 'medium' : 'low',
      speechRate: characteristics.zeroCrossingRate > 0.1 ? 'fast' : characteristics.zeroCrossingRate > 0.05 ? 'normal' : 'slow',
    },
  };
}

interface PitchFeatures {
  variation: number;
  mean: number;
  range: number;
}

/**
 * Analyze pitch-based features
 */
function analyzePitchFeatures(characteristics: VoiceCharacteristics): PitchFeatures {
  // Estimate variation from jitter
  const variation = characteristics.jitter * 100;
  const mean = characteristics.pitch;
  const range = characteristics.pitch * (1 + characteristics.jitter);

  return { variation, mean, range };
}

interface EnergyFeatures {
  level: number;
  stability: number;
}

/**
 * Analyze energy-based features
 */
function analyzeEnergyFeatures(characteristics: VoiceCharacteristics): EnergyFeatures {
  const level = characteristics.energy;
  const stability = 1 - characteristics.shimmer; // Lower shimmer = more stable

  return { level, stability };
}

interface SpectralFeatures {
  brightness: number;
  complexity: number;
}

/**
 * Analyze spectral features
 */
function analyzeSpectralFeatures(characteristics: VoiceCharacteristics): SpectralFeatures {
  const brightness = characteristics.spectralCentroid / 5000; // Normalize
  const complexity = characteristics.mfcc.reduce((sum, coeff) => sum + Math.abs(coeff), 0) / characteristics.mfcc.length;

  return { brightness, complexity };
}

interface VoiceQuality {
  voicing: number; // 0-1, how voiced the speech is
  breathiness: number; // 0-1
}

/**
 * Analyze voice quality
 */
function analyzeVoiceQuality(characteristics: VoiceCharacteristics): VoiceQuality {
  const voicing = 1 - characteristics.zeroCrossingRate; // Lower ZCR = more voicing
  const breathiness = characteristics.zeroCrossingRate; // Higher ZCR = more breathy

  return { voicing, breathiness };
}

/**
 * Update emotion scores based on pitch features
 */
function updateScoresFromPitch(scores: Record<Emotion, number>, features: PitchFeatures): void {
  // Happy: high pitch variation, higher mean pitch
  if (features.variation > 40 && features.mean > 150) {
    scores.happy += 2;
  }

  // Sad: low pitch, low variation
  if (features.mean < 100 && features.variation < 20) {
    scores.sad += 2;
  }

  // Angry: high pitch, strong variation
  if (features.mean > 150 && features.variation > 50) {
    scores.angry += 2;
  }

  // Surprised: rapid pitch changes
  if (features.variation > 60) {
    scores.surprised += 1.5;
  }

  // Fearful: high pitch, unstable
  if (features.mean > 180 && features.variation > 40) {
    scores.fearful += 1.5;
  }
}

/**
 * Update emotion scores based on energy features
 */
function updateScoresFromEnergy(scores: Record<Emotion, number>, features: EnergyFeatures): void {
  // Happy: high energy, stable
  if (features.level > -20 && features.stability > 0.7) {
    scores.happy += 2;
  }

  // Sad: low energy, unstable
  if (features.level < -40 && features.stability < 0.5) {
    scores.sad += 2;
  }

  // Angry: very high energy
  if (features.level > -10) {
    scores.angry += 2;
  }

  // Fearful: unstable energy
  if (features.stability < 0.4) {
    scores.fearful += 1.5;
  }

  // Surprised: sudden energy changes
  if (Math.abs(features.level) > 20) {
    scores.surprised += 1;
  }
}

/**
 * Update emotion scores based on spectral features
 */
function updateScoresFromSpectral(scores: Record<Emotion, number>, features: SpectralFeatures): void {
  // Happy: bright spectrum
  if (features.brightness > 0.6) {
    scores.happy += 1.5;
  }

  // Sad: dark spectrum
  if (features.brightness < 0.4) {
    scores.sad += 1.5;
  }

  // Angry: harsh spectrum
  if (features.brightness > 0.7) {
    scores.angry += 1.5;
  }

  // Complex spectrum suggests emotion
  if (features.complexity > 50) {
    scores.surprised += 1;
  }
}

/**
 * Update emotion scores based on voice quality
 */
function updateScoresFromVoiceQuality(scores: Record<Emotion, number>, quality: VoiceQuality): void {
  // Happy: well-voiced
  if (quality.voicing > 0.8) {
    scores.happy += 1;
  }

  // Fearful: breathy
  if (quality.breathiness > 0.3) {
    scores.fearful += 1;
  }

  // Disgusted: varies
  if (quality.voicing > 0.7 && quality.breathiness < 0.2) {
    scores.disgusted += 0.5;
  }
}

/**
 * Normalize emotion scores to 0-1 range
 */
function normalizeScores(scores: Record<Emotion, number>): Record<Emotion, number> {
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  const normalized: Record<Emotion, number> = {} as Record<Emotion, number>;

  for (const emotion in scores) {
    normalized[emotion as Emotion] = sum > 0 ? scores[emotion as Emotion] / sum : 1 / 7;
  }

  return normalized;
}

/**
 * Combine multiple emotion detections
 */
export function combineEmotionDetections(detections: EmotionDetectionResult[]): EmotionDetectionResult {
  if (detections.length === 0) {
    return {
      emotion: 'neutral',
      confidence: 0,
      scores: { neutral: 1, happy: 0, sad: 0, angry: 0, surprised: 0, fearful: 0, disgusted: 0 },
      intensity: 0,
      characteristics: {
        pitchVariation: 'medium',
        energyLevel: 'medium',
        speechRate: 'normal',
      },
    };
  }

  // Average scores
  const combinedScores: Record<Emotion, number> = {
    neutral: 0,
    happy: 0,
    sad: 0,
    angry: 0,
    surprised: 0,
    fearful: 0,
    disgusted: 0,
  };

  for (const detection of detections) {
    for (const emotion in detection.scores) {
      combinedScores[emotion as Emotion] += detection.scores[emotion as Emotion];
    }
  }

  for (const emotion in combinedScores) {
    combinedScores[emotion as Emotion] /= detections.length;
  }

  // Find dominant emotion
  const emotions = Object.entries(combinedScores) as [Emotion, number][];
  const [dominantEmotion, confidence] = emotions.reduce((prev, curr) =>
    curr[1] > prev[1] ? curr : prev
  );

  const avgIntensity = detections.reduce((sum, d) => sum + d.intensity, 0) / detections.length;

  return {
    emotion: dominantEmotion,
    confidence,
    scores: combinedScores,
    intensity: avgIntensity,
    characteristics: detections[0].characteristics,
  };
}
