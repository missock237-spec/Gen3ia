import type { VoiceProfile } from './voice-profile';
import type { EmotionDetectionResult } from './emotion/emotion-detector';
import { synthesizeText } from '../tts/huggingface-tts';
import { transcribeAudio } from '../stt/huggingface-stt';

/**
 * Agent Voice Integration
 * Enables AI agents to use personalized voices for communication
 */

export interface AgentVoiceConfig {
  agentId: string;
  name: string;
  description: string;
  
  // Voice settings
  voiceProfileId?: string;
  defaultVoiceTemplate?: string;
  emotionMapping?: Record<string, string>; // Agent emotion -> voice emotion
  
  // Preferences
  language: string;
  speechRate: number; // 0.5-2.0
  pitch: number; // 0.5-2.0
  
  // Features
  enableVoiceRecognition: boolean;
  enableEmotionDetection: boolean;
  enableVoiceCloning: boolean;
  maxResponseDuration: number; // in seconds
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentVoiceResponse {
  agentId: string;
  text: string;
  audio: Buffer;
  emotion: EmotionDetectionResult;
  duration: number;
  voiceProfileId: string;
  timestamp: Date;
}

export interface AgentVoiceInput {
  audio: Buffer;
  userId: string;
  agentId: string;
  context?: {
    conversationId: string;
    messageIndex: number;
  };
}

export interface AgentVoiceInteraction {
  id: string;
  agentId: string;
  userId: string;
  input: {
    text: string;
    recognizedEmotion: EmotionDetectionResult;
    recognizedLanguage: string;
  };
  output: {
    text: string;
    audio: Buffer;
    emotion: EmotionDetectionResult;
  };
  timestamp: Date;
  duration: number;
}

/**
 * Agent Voice Manager
 */
export class AgentVoiceManager {
  private static readonly MAX_RESPONSE_DURATION = 300; // 5 minutes

  /**
   * Create default voice configuration for agent
   */
  static createAgentVoiceConfig(agentId: string, agentName: string): AgentVoiceConfig {
    return {
      agentId,
      name: agentName,
      description: `Default voice configuration for ${agentName}`,
      language: 'en',
      speechRate: 1.0,
      pitch: 1.0,
      enableVoiceRecognition: true,
      enableEmotionDetection: true,
      enableVoiceCloning: false,
      maxResponseDuration: this.MAX_RESPONSE_DURATION,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Process user voice input
   */
  static async processVoiceInput(input: AgentVoiceInput): Promise<{
    text: string;
    emotion: EmotionDetectionResult;
    language: string;
  }> {
    try {
      // Transcribe audio
      const transcription = await transcribeAudio(input.audio, {
        punctuation: true,
        paragraphs: false,
      });

      return {
        text: transcription.text,
        emotion: {
          emotion: 'neutral',
          confidence: transcription.confidence,
          scores: {
            neutral: 1,
            happy: 0,
            sad: 0,
            angry: 0,
            surprised: 0,
            fearful: 0,
            disgusted: 0,
          },
          intensity: 0,
          characteristics: {
            pitchVariation: 'medium',
            energyLevel: 'medium',
            speechRate: 'normal',
          },
        },
        language: transcription.language,
      };
    } catch (error) {
      console.error('[Agent Voice] Input processing error:', error);
      throw error;
    }
  }

  /**
   * Generate agent voice response
   */
  static async generateVoiceResponse(
    agentId: string,
    responseText: string,
    config: AgentVoiceConfig,
    emotion?: EmotionDetectionResult
  ): Promise<AgentVoiceResponse> {
    try {
      // Map agent emotion to voice emotion if needed
      const voiceEmotion = emotion?.emotion || 'neutral';

      // Generate speech
      const ttsResult = await synthesizeText(responseText, {
        language: config.language,
        emotion: voiceEmotion as any,
        speed: config.speechRate,
        pitch: config.pitch,
      });

      // Check duration
      if (ttsResult.duration > config.maxResponseDuration) {
        throw new Error(
          `Response duration (${ttsResult.duration}s) exceeds limit (${config.maxResponseDuration}s)`
        );
      }

      return {
        agentId,
        text: responseText,
        audio: ttsResult.audio,
        emotion: emotion || {
          emotion: 'neutral',
          confidence: 1,
          scores: {
            neutral: 1,
            happy: 0,
            sad: 0,
            angry: 0,
            surprised: 0,
            fearful: 0,
            disgusted: 0,
          },
          intensity: 0,
          characteristics: {
            pitchVariation: 'medium',
            energyLevel: 'medium',
            speechRate: 'normal',
          },
        },
        duration: ttsResult.duration,
        voiceProfileId: config.voiceProfileId || `default-${agentId}`,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('[Agent Voice] Response generation error:', error);
      throw error;
    }
  }

  /**
   * Create voice clone for agent from user recording
   */
  static async createAgentVoiceClone(
    agentId: string,
    voiceProfile: VoiceProfile,
    customizations?: {
      emotion?: string;
      speechRate?: number;
      pitch?: number;
    }
  ): Promise<AgentVoiceConfig> {
    const config = this.createAgentVoiceConfig(agentId, agentId);

    return {
      ...config,
      voiceProfileId: voiceProfile.id,
      language: voiceProfile.preferredLanguages[0] || 'en',
      speechRate: customizations?.speechRate ?? voiceProfile.speechRate,
      pitch: customizations?.pitch ?? voiceProfile.pitch,
      enableVoiceCloning: true,
    };
  }

  /**
   * Enable multi-agent voice coordination
   */
  static createMultiAgentVoiceCoordination(
    agentIds: string[],
    baseVoiceProfile: VoiceProfile
  ): Record<string, AgentVoiceConfig> {
    const coordination: Record<string, AgentVoiceConfig> = {};

    // Create variations of the base voice for different agents
    const variations = [
      { pitch: 0.95, speechRate: 0.95 }, // Lower, slightly slower
      { pitch: 1.0, speechRate: 1.0 }, // Normal
      { pitch: 1.05, speechRate: 1.05 }, // Higher, slightly faster
      { pitch: 0.9, speechRate: 1.1 }, // Lower but faster
    ];

    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];
      const variation = variations[i % variations.length];

      coordination[agentId] = {
        agentId,
        name: `Agent-${agentId}`,
        description: `Voice configuration for agent ${agentId}`,
        voiceProfileId: baseVoiceProfile.id,
        language: baseVoiceProfile.preferredLanguages[0] || 'en',
        speechRate: variation.speechRate,
        pitch: variation.pitch,
        enableVoiceRecognition: true,
        enableEmotionDetection: true,
        enableVoiceCloning: true,
        maxResponseDuration: this.MAX_RESPONSE_DURATION,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return coordination;
  }

  /**
   * Route voice input to appropriate agent
   */
  static routeVoiceInputToAgent(
    voiceInput: AgentVoiceInput,
    agentVoiceConfigs: Record<string, AgentVoiceConfig>
  ): AgentVoiceConfig | null {
    // Route based on agent ID
    const config = agentVoiceConfigs[voiceInput.agentId];

    if (!config) {
      console.warn(
        `[Agent Voice] No configuration found for agent ${voiceInput.agentId}`
      );
      return null;
    }

    if (!config.enableVoiceRecognition) {
      console.warn(
        `[Agent Voice] Voice recognition disabled for agent ${voiceInput.agentId}`
      );
      return null;
    }

    return config;
  }

  /**
   * Log voice interaction
   */
  static createInteractionLog(
    agentId: string,
    userId: string,
    input: AgentVoiceInput,
    output: AgentVoiceResponse,
    inputText: string,
    inputEmotion: EmotionDetectionResult
  ): AgentVoiceInteraction {
    return {
      id: `avi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      userId,
      input: {
        text: inputText,
        recognizedEmotion: inputEmotion,
        recognizedLanguage: 'auto-detected',
      },
      output: {
        text: output.text,
        audio: output.audio,
        emotion: output.emotion,
      },
      timestamp: new Date(),
      duration: output.duration,
    };
  }

  /**
   * Get agent voice statistics
   */
  static generateVoiceStatistics(interactions: AgentVoiceInteraction[]) {
    if (interactions.length === 0) {
      return {
        totalInteractions: 0,
        averageResponseDuration: 0,
        dominantEmotion: 'neutral',
        emotionDistribution: {},
      };
    }

    const totalDuration = interactions.reduce((sum, i) => sum + i.duration, 0);
    const emotionCounts: Record<string, number> = {};

    for (const interaction of interactions) {
      const emotion = interaction.output.emotion.emotion;
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    }

    const dominantEmotion = Object.entries(emotionCounts).reduce((prev, curr) =>
      curr[1] > prev[1] ? curr : prev
    )[0];

    return {
      totalInteractions: interactions.length,
      averageResponseDuration: totalDuration / interactions.length,
      dominantEmotion,
      emotionDistribution: emotionCounts,
    };
  }

  /**
   * Export agent voice configuration
   */
  static exportVoiceConfig(config: AgentVoiceConfig): string {
    return JSON.stringify(config, null, 2);
  }

  /**
   * Import agent voice configuration
   */
  static importVoiceConfig(json: string): AgentVoiceConfig {
    const config = JSON.parse(json) as AgentVoiceConfig;
    config.createdAt = new Date(config.createdAt);
    config.updatedAt = new Date(config.updatedAt);
    return config;
  }
}

/**
 * Preset agent voice personalities
 */
export const AGENT_VOICE_PERSONALITIES = {
  friendly: {
    emotion: 'happy',
    speechRate: 1.05,
    pitch: 1.1,
    description: 'Warm and approachable',
  },
  professional: {
    emotion: 'neutral',
    speechRate: 0.95,
    pitch: 1.0,
    description: 'Formal and authoritative',
  },
  supportive: {
    emotion: 'calm',
    speechRate: 0.9,
    pitch: 0.95,
    description: 'Soothing and patient',
  },
  energetic: {
    emotion: 'happy',
    speechRate: 1.2,
    pitch: 1.15,
    description: 'Enthusiastic and vibrant',
  },
  analytical: {
    emotion: 'neutral',
    speechRate: 1.1,
    pitch: 0.95,
    description: 'Precise and technical',
  },
};
