/**
 * Unit Tests for Voice & Image Systems
 * 
 * Tests for voice fingerprinting, emotion detection, TTS, STT, and image generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  analyzeVoiceCharacteristics, 
  calculateVoiceDistance, 
  generateFingerprintId 
} from '@/lib/voice/fingerprint/speaker-analyzer';
import { detectEmotion, combineEmotionDetections } from '@/lib/voice/emotion/emotion-detector';
import { VoiceProfileManager, VOICE_STYLES } from '@/lib/voice/voice-profile';
import { AgentVoiceManager } from '@/lib/voice/agent-voice-integration';

describe('Voice Fingerprinting', () => {
  let mockAudioBuffer: Float32Array;

  beforeEach(() => {
    // Create mock audio buffer (16000 samples at 16kHz = 1 second)
    mockAudioBuffer = new Float32Array(16000);
    // Generate simple sine wave (440 Hz)
    for (let i = 0; i < mockAudioBuffer.length; i++) {
      mockAudioBuffer[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
    }
  });

  it('should analyze voice characteristics', async () => {
    const characteristics = await analyzeVoiceCharacteristics(mockAudioBuffer, 16000);

    expect(characteristics).toBeDefined();
    expect(characteristics.pitch).toBeGreaterThan(0);
    expect(characteristics.energy).toBeLessThan(0); // In dB
    expect(characteristics.spectralCentroid).toBeGreaterThan(0);
    expect(characteristics.mfcc).toHaveLength(13);
    expect(characteristics.zeroCrossingRate).toBeGreaterThanOrEqual(0);
    expect(characteristics.zeroCrossingRate).toBeLessThanOrEqual(1);
    expect(characteristics.jitter).toBeGreaterThanOrEqual(0);
    expect(characteristics.shimmer).toBeGreaterThanOrEqual(0);
  });

  it('should calculate distance between characteristics', () => {
    const char1 = {
      pitch: 440,
      energy: -20,
      spectralCentroid: 2000,
      mfcc: Array(13).fill(0),
      zeroCrossingRate: 0.05,
      jitter: 0.01,
      shimmer: 0.02,
      timestamp: Date.now(),
    };

    const char2 = {
      pitch: 450,
      energy: -19,
      spectralCentroid: 2100,
      mfcc: Array(13).fill(0.1),
      zeroCrossingRate: 0.05,
      jitter: 0.01,
      shimmer: 0.02,
      timestamp: Date.now(),
    };

    const distance = calculateVoiceDistance(char1, char2);
    expect(distance).toBeGreaterThanOrEqual(0);
  });

  it('should generate unique fingerprint IDs', () => {
    const id1 = generateFingerprintId('user1', 123456);
    const id2 = generateFingerprintId('user1', 123457);
    const id3 = generateFingerprintId('user2', 123456);

    expect(id1).toBeTruthy();
    expect(id1).toHaveLength(16);
    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(id3);
  });
});

describe('Emotion Detection', () => {
  let mockCharacteristics: any;

  beforeEach(() => {
    mockCharacteristics = {
      pitch: 150,
      energy: -15,
      spectralCentroid: 3000,
      mfcc: Array(13).fill(1),
      zeroCrossingRate: 0.08,
      jitter: 0.05,
      shimmer: 0.03,
      timestamp: Date.now(),
    };
  });

  it('should detect emotions', () => {
    const emotion = detectEmotion(mockCharacteristics);

    expect(emotion).toBeDefined();
    expect(['neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted']).toContain(emotion.emotion);
    expect(emotion.confidence).toBeGreaterThanOrEqual(0);
    expect(emotion.confidence).toBeLessThanOrEqual(1);
    expect(emotion.scores).toBeDefined();
    expect(Object.keys(emotion.scores)).toHaveLength(7);
    expect(emotion.intensity).toBeGreaterThanOrEqual(0);
    expect(emotion.intensity).toBeLessThanOrEqual(1);
  });

  it('should detect happy emotion with high pitch', () => {
    const happyChar = {
      ...mockCharacteristics,
      pitch: 200,
      energy: -10,
      jitter: 0.08,
    };

    const emotion = detectEmotion(happyChar);
    expect(emotion.scores.happy).toBeGreaterThan(emotion.scores.sad);
  });

  it('should detect sad emotion with low pitch', () => {
    const sadChar = {
      ...mockCharacteristics,
      pitch: 80,
      energy: -40,
      jitter: 0.02,
    };

    const emotion = detectEmotion(sadChar);
    expect(emotion.scores.sad).toBeGreaterThan(emotion.scores.happy);
  });

  it('should combine multiple emotion detections', () => {
    const detection1 = detectEmotion(mockCharacteristics);
    const detection2 = detectEmotion(mockCharacteristics);
    const detection3 = detectEmotion(mockCharacteristics);

    const combined = combineEmotionDetections([detection1, detection2, detection3]);

    expect(combined).toBeDefined();
    expect(combined.emotion).toBeTruthy();
    expect(combined.confidence).toBeGreaterThanOrEqual(0);
    expect(Object.keys(combined.scores)).toHaveLength(7);
  });
});

describe('Voice Profile Management', () => {
  let mockCharacteristics: any;
  let mockEmotion: any;

  beforeEach(() => {
    mockCharacteristics = {
      pitch: 440,
      energy: -20,
      spectralCentroid: 2000,
      mfcc: Array(13).fill(0),
      zeroCrossingRate: 0.05,
      jitter: 0.01,
      shimmer: 0.02,
      timestamp: Date.now(),
    };

    mockEmotion = {
      emotion: 'neutral',
      confidence: 0.8,
      scores: {
        neutral: 0.8,
        happy: 0.1,
        sad: 0.05,
        angry: 0.03,
        surprised: 0.01,
        fearful: 0.01,
        disgusted: 0,
      },
      intensity: 0.3,
      characteristics: {
        pitchVariation: 'medium',
        energyLevel: 'medium',
        speechRate: 'normal',
      },
    };
  });

  it('should create voice profile', () => {
    const profile = VoiceProfileManager.createProfile(
      'user123',
      mockCharacteristics,
      mockEmotion,
      {
        name: 'Test Profile',
        isDefault: true,
      }
    );

    expect(profile).toBeDefined();
    expect(profile.userId).toBe('user123');
    expect(profile.name).toBe('Test Profile');
    expect(profile.isDefault).toBe(true);
    expect(profile.recordingCount).toBe(1);
    expect(profile.characteristics.pitch).toBe(440);
  });

  it('should update voice profile', () => {
    const profile = VoiceProfileManager.createProfile(
      'user123',
      mockCharacteristics,
      mockEmotion,
      { name: 'Test' }
    );

    const newCharacteristics = { ...mockCharacteristics, pitch: 450 };
    const updatedProfile = VoiceProfileManager.updateProfile(
      profile,
      newCharacteristics,
      mockEmotion
    );

    expect(updatedProfile.recordingCount).toBe(2);
    expect(updatedProfile.characteristics.pitch).toBeCloseTo(445, 0); // Average
  });

  it('should provide preset templates', () => {
    const templates = VoiceProfileManager.getPresetTemplates();

    expect(templates).toBeDefined();
    expect(templates.professional).toBeDefined();
    expect(templates.casual).toBeDefined();
    expect(templates.storytelling).toBeDefined();
    expect(templates.calm).toBeDefined();
  });

  it('should export and import profile', () => {
    const profile = VoiceProfileManager.createProfile(
      'user123',
      mockCharacteristics,
      mockEmotion,
      { name: 'Test' }
    );

    const exported = VoiceProfileManager.exportProfile(profile);
    expect(typeof exported).toBe('string');

    const imported = VoiceProfileManager.importProfile(exported);
    expect(imported.userId).toBe(profile.userId);
    expect(imported.name).toBe(profile.name);
  });
});

describe('Agent Voice Integration', () => {
  it('should create agent voice config', () => {
    const config = AgentVoiceManager.createAgentVoiceConfig('agent1', 'TestAgent');

    expect(config).toBeDefined();
    expect(config.agentId).toBe('agent1');
    expect(config.name).toBe('TestAgent');
    expect(config.enableVoiceRecognition).toBe(true);
    expect(config.enableEmotionDetection).toBe(true);
    expect(config.language).toBe('en');
  });

  it('should create multi-agent voice coordination', () => {
    const agentIds = ['agent1', 'agent2', 'agent3'];
    const baseProfile = {
      id: 'profile1',
      userId: 'user1',
      name: 'Base Profile',
      characteristics: {
        pitch: 440,
        energy: -20,
        spectralCentroid: 2000,
        mfcc: Array(13).fill(0),
        zeroCrossingRate: 0.05,
        jitter: 0.01,
        shimmer: 0.02,
        timestamp: Date.now(),
      },
      fingerprintId: 'fp1',
      defaultEmotion: {
        emotion: 'neutral',
        confidence: 0.8,
        scores: { neutral: 1, happy: 0, sad: 0, angry: 0, surprised: 0, fearful: 0, disgusted: 0 },
        intensity: 0,
        characteristics: { pitchVariation: 'medium', energyLevel: 'medium', speechRate: 'normal' },
      },
      emotionRange: {},
      preferredLanguages: ['en'],
      speechRate: 1.0,
      pitch: 1.0,
      agentCompatibility: {},
      isDefault: true,
      recordingCount: 1,
      confidence: 0.8,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const coordination = AgentVoiceManager.createMultiAgentVoiceCoordination(agentIds, baseProfile);

    expect(Object.keys(coordination)).toHaveLength(3);
    expect(coordination.agent1).toBeDefined();
    expect(coordination.agent1.voiceProfileId).toBe('profile1');
    expect(coordination.agent1.pitch).not.toBe(coordination.agent2.pitch);
  });

  it('should generate voice statistics', () => {
    const interactions = [
      {
        id: 'int1',
        agentId: 'agent1',
        userId: 'user1',
        input: { text: 'Hello', recognizedEmotion: { emotion: 'neutral', confidence: 0.8, scores: {}, intensity: 0, characteristics: {} }, recognizedLanguage: 'en' },
        output: { text: 'Hi', audio: Buffer.from([]), emotion: { emotion: 'happy', confidence: 0.9, scores: { happy: 1 }, intensity: 0.5, characteristics: {} } },
        timestamp: new Date(),
        duration: 2,
      },
    ];

    const stats = AgentVoiceManager.generateVoiceStatistics(interactions);

    expect(stats.totalInteractions).toBe(1);
    expect(stats.averageResponseDuration).toBe(2);
    expect(stats.dominantEmotion).toBeDefined();
  });
});

describe('Voice Styles', () => {
  it('should have predefined voice styles', () => {
    expect(VOICE_STYLES).toBeDefined();
    expect(VOICE_STYLES.narrator).toBeDefined();
    expect(VOICE_STYLES.customer_service).toBeDefined();
    expect(VOICE_STYLES.automated_system).toBeDefined();
    expect(VOICE_STYLES.educational).toBeDefined();
    expect(VOICE_STYLES.entertainment).toBeDefined();
    expect(VOICE_STYLES.meditation).toBeDefined();

    for (const style of Object.values(VOICE_STYLES)) {
      expect(style.emotion).toBeTruthy();
      expect(style.speechRate).toBeGreaterThan(0.5);
      expect(style.speechRate).toBeLessThan(2);
      expect(style.pitch).toBeGreaterThan(0.5);
      expect(style.pitch).toBeLessThan(2);
    }
  });
});
