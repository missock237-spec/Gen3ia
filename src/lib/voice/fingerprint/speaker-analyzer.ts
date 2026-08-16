import * as crypto from 'crypto';

/**
 * Speaker Identification & Voice Fingerprinting
 * Analyzes audio characteristics to identify and distinguish speakers
 */

export interface VoiceCharacteristics {
  pitch: number; // Hz (fundamental frequency)
  energy: number; // dB (loudness)
  spectralCentroid: number; // Hz (brightness)
  mfcc: number[]; // Mel-frequency cepstral coefficients (13 coefficients)
  zeroCrossingRate: number; // For voicing detection
  jitter: number; // Pitch variation
  shimmer: number; // Amplitude variation
  timestamp: number;
}

export interface SpeakerFingerprint {
  id: string;
  userId: string;
  characteristics: VoiceCharacteristics[];
  averageCharacteristics: VoiceCharacteristics;
  confidence: number; // 0-1 confidence score
  sampleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpeakerIdentificationResult {
  speakerId: string;
  confidence: number;
  distance: number;
  characteristics: VoiceCharacteristics;
}

/**
 * Analyze audio buffer and extract voice characteristics
 */
export async function analyzeVoiceCharacteristics(
  audioBuffer: Float32Array,
  sampleRate: number
): Promise<VoiceCharacteristics> {
  const characteristics: VoiceCharacteristics = {
    pitch: estimatePitch(audioBuffer, sampleRate),
    energy: calculateEnergy(audioBuffer),
    spectralCentroid: calculateSpectralCentroid(audioBuffer, sampleRate),
    mfcc: calculateMFCC(audioBuffer, sampleRate),
    zeroCrossingRate: calculateZeroCrossingRate(audioBuffer),
    jitter: estimateJitter(audioBuffer, sampleRate),
    shimmer: estimateShimmer(audioBuffer, sampleRate),
    timestamp: Date.now(),
  };

  return characteristics;
}

/**
 * Estimate pitch using autocorrelation
 */
function estimatePitch(audioBuffer: Float32Array, sampleRate: number): number {
  const windowSize = Math.min(4096, audioBuffer.length);
  const window = audioBuffer.slice(0, windowSize);

  // Simple autocorrelation-based pitch detection
  const correlation = new Float32Array(windowSize);
  for (let lag = 1; lag < windowSize / 2; lag++) {
    let sum = 0;
    for (let i = 0; i < windowSize - lag; i++) {
      sum += window[i] * window[i + lag];
    }
    correlation[lag] = sum;
  }

  // Find peak in correlation
  let maxCorrelation = 0;
  let bestLag = 1;
  for (let lag = Math.floor(sampleRate / 500); lag < Math.floor(sampleRate / 50); lag++) {
    if (correlation[lag] > maxCorrelation) {
      maxCorrelation = correlation[lag];
      bestLag = lag;
    }
  }

  return bestLag > 0 ? sampleRate / bestLag : 0;
}

/**
 * Calculate energy (RMS)
 */
function calculateEnergy(audioBuffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    sum += audioBuffer[i] * audioBuffer[i];
  }
  const rms = Math.sqrt(sum / audioBuffer.length);
  return 20 * Math.log10(Math.max(rms, 0.00001)); // Convert to dB
}

/**
 * Calculate spectral centroid
 */
function calculateSpectralCentroid(audioBuffer: Float32Array, sampleRate: number): number {
  // FFT-based spectral analysis
  const fftSize = 2048;
  const magnitude = performFFT(audioBuffer, fftSize);

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < magnitude.length; i++) {
    const frequency = (i / fftSize) * sampleRate;
    numerator += frequency * magnitude[i];
    denominator += magnitude[i];
  }

  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Calculate MFCC (Mel-Frequency Cepstral Coefficients)
 */
function calculateMFCC(audioBuffer: Float32Array, sampleRate: number): number[] {
  const fftSize = 2048;
  const numMelBands = 40;
  const numCoefficients = 13;

  // FFT
  const magnitude = performFFT(audioBuffer, fftSize);

  // Convert to mel scale
  const melSpectrum = new Float32Array(numMelBands);
  for (let i = 0; i < numMelBands; i++) {
    const melFreq = (i + 1) * sampleRate / (numMelBands + 2);
    const binIndex = Math.floor((melFreq / sampleRate) * fftSize);
    if (binIndex < magnitude.length) {
      melSpectrum[i] = magnitude[binIndex];
    }
  }

  // DCT to get MFCC
  const mfcc = new Array(numCoefficients).fill(0);
  for (let k = 0; k < numCoefficients; k++) {
    for (let n = 0; n < numMelBands; n++) {
      mfcc[k] += Math.cos((Math.PI * k * (n + 0.5)) / numMelBands) * melSpectrum[n];
    }
  }

  return mfcc;
}

/**
 * Calculate zero-crossing rate
 */
function calculateZeroCrossingRate(audioBuffer: Float32Array): number {
  let zeroCrossings = 0;
  for (let i = 1; i < audioBuffer.length; i++) {
    if ((audioBuffer[i - 1] < 0 && audioBuffer[i] >= 0) ||
        (audioBuffer[i - 1] >= 0 && audioBuffer[i] < 0)) {
      zeroCrossings++;
    }
  }
  return zeroCrossings / audioBuffer.length;
}

/**
 * Estimate jitter (pitch variation)
 */
function estimateJitter(audioBuffer: Float32Array, sampleRate: number): number {
  const pitch = estimatePitch(audioBuffer, sampleRate);
  if (pitch === 0) return 0;

  // Simplified jitter estimation
  const windowSize = Math.floor(sampleRate / pitch);
  let jitterSum = 0;
  let count = 0;

  for (let i = 0; i < audioBuffer.length - windowSize * 2; i += windowSize) {
    const period1 = estimatePitch(audioBuffer.slice(i, i + windowSize), sampleRate);
    const period2 = estimatePitch(audioBuffer.slice(i + windowSize, i + windowSize * 2), sampleRate);
    if (period1 > 0 && period2 > 0) {
      jitterSum += Math.abs(period1 - period2) / ((period1 + period2) / 2);
      count++;
    }
  }

  return count > 0 ? jitterSum / count : 0;
}

/**
 * Estimate shimmer (amplitude variation)
 */
function estimateShimmer(audioBuffer: Float32Array, sampleRate: number): number {
  const pitch = estimatePitch(audioBuffer, sampleRate);
  if (pitch === 0) return 0;

  const windowSize = Math.floor(sampleRate / pitch);
  let shimmerSum = 0;
  let count = 0;

  for (let i = 0; i < audioBuffer.length - windowSize * 2; i += windowSize) {
    const amp1 = calculateEnergy(audioBuffer.slice(i, i + windowSize));
    const amp2 = calculateEnergy(audioBuffer.slice(i + windowSize, i + windowSize * 2));
    shimmerSum += Math.abs(amp1 - amp2) / ((Math.abs(amp1) + Math.abs(amp2)) / 2);
    count++;
  }

  return count > 0 ? shimmerSum / count : 0;
}

/**
 * Simple FFT (Fast Fourier Transform) using Cooley-Tukey algorithm
 */
function performFFT(audioBuffer: Float32Array, size: number): Float32Array {
  // Zero-pad to power of 2
  const fftSize = Math.pow(2, Math.ceil(Math.log2(size)));
  const input = new Float32Array(fftSize);
  for (let i = 0; i < Math.min(audioBuffer.length, fftSize); i++) {
    input[i] = audioBuffer[i];
  }

  // Apply Hanning window
  for (let i = 0; i < fftSize; i++) {
    input[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  }

  // Compute magnitude spectrum (simplified)
  const magnitude = new Float32Array(fftSize / 2);
  for (let k = 0; k < fftSize / 2; k++) {
    let real = 0,
      imag = 0;
    for (let n = 0; n < fftSize; n++) {
      const angle = (-2 * Math.PI * k * n) / fftSize;
      real += input[n] * Math.cos(angle);
      imag += input[n] * Math.sin(angle);
    }
    magnitude[k] = Math.sqrt(real * real + imag * imag);
  }

  return magnitude;
}

/**
 * Calculate distance between two voice fingerprints
 */
export function calculateVoiceDistance(
  characteristics1: VoiceCharacteristics,
  characteristics2: VoiceCharacteristics
): number {
  let distance = 0;

  // Pitch distance (normalize by average pitch)
  const avgPitch = (Math.abs(characteristics1.pitch) + Math.abs(characteristics2.pitch)) / 2;
  distance += Math.abs(characteristics1.pitch - characteristics2.pitch) / Math.max(avgPitch, 1);

  // Energy distance
  distance += Math.abs(characteristics1.energy - characteristics2.energy) / 100;

  // Spectral centroid distance
  distance += Math.abs(characteristics1.spectralCentroid - characteristics2.spectralCentroid) / 5000;

  // MFCC distance (Euclidean)
  let mfccDistance = 0;
  for (let i = 0; i < Math.min(characteristics1.mfcc.length, characteristics2.mfcc.length); i++) {
    mfccDistance += Math.pow(characteristics1.mfcc[i] - characteristics2.mfcc[i], 2);
  }
  distance += Math.sqrt(mfccDistance);

  // Zero-crossing rate distance
  distance += Math.abs(characteristics1.zeroCrossingRate - characteristics2.zeroCrossingRate);

  return distance / 5; // Normalize
}

/**
 * Generate speaker fingerprint ID
 */
export function generateFingerprintId(userId: string, timestamp: number = Date.now()): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${userId}-${timestamp}-${Math.random()}`);
  return hash.digest('hex').slice(0, 16);
}

/**
 * Calculate confidence score based on fingerprint consistency
 */
export function calculateFingerprintConfidence(
  characteristics: VoiceCharacteristics[],
  averageCharacteristics: VoiceCharacteristics
): number {
  if (characteristics.length === 0) return 0;

  let totalDistance = 0;
  for (const char of characteristics) {
    totalDistance += calculateVoiceDistance(char, averageCharacteristics);
  }

  const avgDistance = totalDistance / characteristics.length;
  // Convert distance to confidence (lower distance = higher confidence)
  return Math.max(0, Math.min(1, 1 - avgDistance / 10));
}
