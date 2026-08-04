import type { VoiceCharacteristics } from './fingerprint/speaker-analyzer';
import type { EmotionDetectionResult } from './emotion/emotion-detector';

/**
 * User Voice Profile Management
 * Stores user voice characteristics for personalized voice experiences
 */

export interface VoiceProfile {
  id: string;
  userId: string;
  name: string;
  description?: string;
  
  // Voice characteristics
  characteristics: VoiceCharacteristics;
  fingerprintId: string;
  
  // Emotional profile
  defaultEmotion: EmotionDetectionResult;
  emotionRange: Record<string, number>; // Min to max ranges for emotions
  
  // TTS preferences
  preferredLanguages: string[];
  preferredTTSVoice?: string;
  speechRate: number; // 0.5-2.0
  pitch: number; // 0.5-2.0
  
  // Agent preferences
  agentCompatibility: Record<string, number>; // Agent ID -> compatibility score
  
  // Metadata
  isDefault: boolean;
  recordingCount: number;
  lastUpdated: Date;
  createdAt: Date;
}

export interface VoiceTemplate {
  id: string;
  name: string;
  description: string;
  emotion: EmotionDetectionResult;
  speechRate: number;
  pitch: number;
  language: string;
  useCase: 'professional' | 'casual' | 'emotional' | 'storytelling';
  previewAudio?: Buffer;
}

/**
 * Voice Profile Manager
 */
export class VoiceProfileManager {
  /**
   * Create a new voice profile from recordings
   */
  static createProfile(
    userId: string,
    characteristics: VoiceCharacteristics,
    emotion: EmotionDetectionResult,
    options: {
      name: string;
      description?: string;
      isDefault?: boolean;
      languages?: string[];
    }
  ): VoiceProfile {
    return {
      id: `vp-${userId}-${Date.now()}`,
      userId,
      name: options.name,
      description: options.description,
      characteristics,
      fingerprintId: `fp-${userId}-${Date.now()}`,
      defaultEmotion: emotion,
      emotionRange: {
        happy_min: 0.1,
        happy_max: 0.9,
        sad_min: 0.1,
        sad_max: 0.8,
        angry_min: 0.1,
        angry_max: 0.85,
      },
      preferredLanguages: options.languages || ['en'],
      speechRate: 1.0,
      pitch: 1.0,
      agentCompatibility: {},
      isDefault: options.isDefault || false,
      recordingCount: 1,
      lastUpdated: new Date(),
      createdAt: new Date(),
    };
  }

  /**
   * Update profile with new recording data
   */
  static updateProfile(
    profile: VoiceProfile,
    newCharacteristics: VoiceCharacteristics,
    emotion: EmotionDetectionResult
  ): VoiceProfile {
    // Average characteristics
    const avgCharacteristics = this.averageCharacteristics(
      profile.characteristics,
      newCharacteristics
    );

    // Update emotion range
    const emotionRange = profile.emotionRange;
    for (const [emotion_key, score] of Object.entries(emotion.scores)) {
      const minKey = `${emotion_key}_min`;
      const maxKey = `${emotion_key}_max`;
      if (minKey in emotionRange) {
        emotionRange[minKey] = Math.min(emotionRange[minKey], score);
        emotionRange[maxKey] = Math.max(emotionRange[maxKey], score);
      }
    }

    return {
      ...profile,
      characteristics: avgCharacteristics,
      defaultEmotion: emotion,
      emotionRange,
      recordingCount: profile.recordingCount + 1,
      lastUpdated: new Date(),
    };
  }

  /**
   * Average two voice characteristics
   */
  private static averageCharacteristics(
    char1: VoiceCharacteristics,
    char2: VoiceCharacteristics
  ): VoiceCharacteristics {
    return {
      pitch: (char1.pitch + char2.pitch) / 2,
      energy: (char1.energy + char2.energy) / 2,
      spectralCentroid: (char1.spectralCentroid + char2.spectralCentroid) / 2,
      mfcc: char1.mfcc.map((c, i) => (c + (char2.mfcc[i] || 0)) / 2),
      zeroCrossingRate: (char1.zeroCrossingRate + char2.zeroCrossingRate) / 2,
      jitter: (char1.jitter + char2.jitter) / 2,
      shimmer: (char1.shimmer + char2.shimmer) / 2,
      timestamp: Date.now(),
    };
  }

  /**
   * Get preset voice templates
   */
  static getPresetTemplates(): Record<string, VoiceTemplate> {
    return {
      professional: {
        id: 'tpl-professional',
        name: 'Professional',
        description: 'Clear, confident, and authoritative voice',
        emotion: {
          emotion: 'neutral',
          confidence: 0.9,
          scores: {
            neutral: 0.9,
            happy: 0.05,
            sad: 0,
            angry: 0,
            surprised: 0,
            fearful: 0,
            disgusted: 0.05,
          },
          intensity: 0.3,
          characteristics: {
            pitchVariation: 'low',
            energyLevel: 'medium',
            speechRate: 'normal',
          },
        },
        speechRate: 0.95,
        pitch: 1.0,
        language: 'en',
        useCase: 'professional',
      },

      casual: {
        id: 'tpl-casual',
        name: 'Casual',
        description: 'Friendly and conversational voice',
        emotion: {
          emotion: 'happy',
          confidence: 0.7,
          scores: {
            neutral: 0.2,
            happy: 0.7,
            sad: 0,
            angry: 0,
            surprised: 0.05,
            fearful: 0,
            disgusted: 0.05,
          },
          intensity: 0.5,
          characteristics: {
            pitchVariation: 'medium',
            energyLevel: 'medium',
            speechRate: 'normal',
          },
        },
        speechRate: 1.05,
        pitch: 1.1,
        language: 'en',
        useCase: 'casual',
      },

      storytelling: {
        id: 'tpl-storytelling',
        name: 'Storytelling',
        description: 'Engaging and expressive voice for narratives',
        emotion: {
          emotion: 'happy',
          confidence: 0.6,
          scores: {
            neutral: 0.15,
            happy: 0.4,
            sad: 0.15,
            angry: 0.1,
            surprised: 0.15,
            fearful: 0.05,
            disgusted: 0,
          },
          intensity: 0.7,
          characteristics: {
            pitchVariation: 'high',
            energyLevel: 'high',
            speechRate: 'normal',
          },
        },
        speechRate: 1.0,
        pitch: 1.15,
        language: 'en',
        useCase: 'storytelling',
      },

      calm: {
        id: 'tpl-calm',
        name: 'Calm & Soothing',
        description: 'Gentle and relaxing voice',
        emotion: {
          emotion: 'calm',
          confidence: 0.85,
          scores: {
            neutral: 0.85,
            happy: 0.05,
            sad: 0,
            angry: 0,
            surprised: 0,
            fearful: 0,
            disgusted: 0.1,
          },
          intensity: 0.2,
          characteristics: {
            pitchVariation: 'low',
            energyLevel: 'low',
            speechRate: 'slow',
          },
        },
        speechRate: 0.85,
        pitch: 0.95,
        language: 'en',
        useCase: 'emotional',
      },
    };
  }

  /**
   * Calculate agent compatibility score
   */
  static calculateAgentCompatibility(
    profile: VoiceProfile,
    agentId: string,
    agentPreferences?: {
      emotionPreference?: string;
      languagePreference?: string;
      speechRatePreference?: number;
    }
  ): number {
    let compatibility = 0.5; // Base score

    // Emotion compatibility
    if (agentPreferences?.emotionPreference) {
      const emotionScore = profile.defaultEmotion.scores[agentPreferences.emotionPreference as keyof typeof profile.defaultEmotion.scores] || 0;
      compatibility += emotionScore * 0.3;
    }

    // Language compatibility
    if (agentPreferences?.languagePreference) {
      if (profile.preferredLanguages.includes(agentPreferences.languagePreference)) {
        compatibility += 0.2;
      }
    }

    // Speech rate compatibility
    if (agentPreferences?.speechRatePreference) {
      const rateDiff = Math.abs(profile.speechRate - agentPreferences.speechRatePreference);
      compatibility += (1 - Math.min(rateDiff, 1)) * 0.2;
    }

    return Math.min(1, compatibility);
  }

  /**
   * Export profile as JSON (for backup/transfer)
   */
  static exportProfile(profile: VoiceProfile): string {
    return JSON.stringify(profile, null, 2);
  }

  /**
   * Import profile from JSON
   */
  static importProfile(json: string): VoiceProfile {
    const profile = JSON.parse(json) as VoiceProfile;
    profile.lastUpdated = new Date(profile.lastUpdated);
    profile.createdAt = new Date(profile.createdAt);
    return profile;
  }
}

/**
 * Predefined voice styles for quick selection
 */
export const VOICE_STYLES = {
  narrator: {
    emotion: 'neutral',
    speechRate: 0.9,
    pitch: 1.05,
  },
  customer_service: {
    emotion: 'happy',
    speechRate: 1.0,
    pitch: 1.1,
  },
  automated_system: {
    emotion: 'neutral',
    speechRate: 1.2,
    pitch: 1.0,
  },
  educational: {
    emotion: 'neutral',
    speechRate: 0.95,
    pitch: 1.0,
  },
  entertainment: {
    emotion: 'happy',
    speechRate: 1.1,
    pitch: 1.15,
  },
  meditation: {
    emotion: 'calm',
    speechRate: 0.8,
    pitch: 0.95,
  },
};
