import { describe, it, expect, beforeEach } from 'vitest';
import {
  SupportedLanguage,
  LanguageDetector,
  AgentI18n,
  LANGUAGE_KEYWORDS,
} from '../lib/agent-i18n';

describe('Multi-Language Agent Responses (i18n)', () => {
  let detector: LanguageDetector;
  let i18n: AgentI18n;

  beforeEach(() => {
    detector = new LanguageDetector();
    i18n = new AgentI18n(detector);
  });

  describe('Language Keywords', () => {
    it('should have at least 10 keywords per supported language', () => {
      Object.values(SupportedLanguage).forEach((lang) => {
        const keywords = LANGUAGE_KEYWORDS[lang];
        expect(keywords).toBeDefined();
        expect(keywords.length).toBeGreaterThanOrEqual(10);
      });
    });
  });

  describe('LanguageDetector', () => {
    it('should detect French input', () => {
      const res = detector.detect('Bonjour monsieur, s\'il vous plaît aidez-moi.');
      expect(res.detectedLanguage).toBe(SupportedLanguage.FR);
      expect(res.confidence).toBeGreaterThan(0.2);
    });

    it('should detect English input', () => {
      const res = detector.detect('Hello, thank you very much for your help today.');
      expect(res.detectedLanguage).toBe(SupportedLanguage.EN);
      expect(res.confidence).toBeGreaterThan(0.2);
    });

    it('should detect Arabic input via character set and keywords', () => {
      const res = detector.detect('مرحبا بك، شكرا جزيلا لك اليوم');
      expect(res.detectedLanguage).toBe(SupportedLanguage.AR);
      expect(res.confidence).toBeGreaterThan(0.2);
    });

    it('should detect Swahili input', () => {
      const res = detector.detect('Habari gani rafiki, asante sana kwa msaada bojo');
      expect(res.detectedLanguage).toBe(SupportedLanguage.SW);
      expect(res.confidence).toBeGreaterThan(0.2);
    });

    it('should detect Wolof input', () => {
      const res = detector.detect('Nanga def jerejef lool teranga sunu');
      expect(res.detectedLanguage).toBe(SupportedLanguage.WO);
      expect(res.confidence).toBeGreaterThan(0.2);
    });

    it('should detect Bambara input', () => {
      const res = detector.detect('I ni sogoma, anitché bamanankan i ka kene');
      expect(res.detectedLanguage).toBe(SupportedLanguage.BM);
      expect(res.confidence).toBeGreaterThan(0.2);
    });

    it('should map browser locales correctly', () => {
      expect(detector.detectFromLocale('fr-FR')).toBe(SupportedLanguage.FR);
      expect(detector.detectFromLocale('en-US')).toBe(SupportedLanguage.EN);
      expect(detector.detectFromLocale('ar-SA')).toBe(SupportedLanguage.AR);
      expect(detector.detectFromLocale('sw-KE')).toBe(SupportedLanguage.SW);
      expect(detector.detectFromLocale('wo-SN')).toBe(SupportedLanguage.WO);
      expect(detector.detectFromLocale('bm-ML')).toBe(SupportedLanguage.BM);
      expect(detector.detectFromLocale('unknown')).toBe(SupportedLanguage.FR);
    });

    it('should store and update user profile', async () => {
      const userId = 'user-test-123';
      const initialProfile = await detector.getLanguageProfile(userId);

      expect(initialProfile.userId).toBe(userId);
      expect(initialProfile.preferredLanguage).toBe(SupportedLanguage.FR);
      expect(initialProfile.autoDetect).toBe(true);

      await detector.updateLanguageProfile(userId, {
        preferredLanguage: SupportedLanguage.SW,
        autoDetect: false,
        agentOverrides: { 'agent-sales': SupportedLanguage.WO },
      });

      const updatedProfile = await detector.getLanguageProfile(userId);
      expect(updatedProfile.preferredLanguage).toBe(SupportedLanguage.SW);
      expect(updatedProfile.autoDetect).toBe(false);
      expect(updatedProfile.agentOverrides['agent-sales']).toBe(SupportedLanguage.WO);
    });
  });

  describe('AgentI18n', () => {
    it('should prioritize agent override over user preference and auto-detect', async () => {
      const userId = 'user-override-test';
      await detector.updateLanguageProfile(userId, {
        preferredLanguage: SupportedLanguage.FR,
        autoDetect: true,
        agentOverrides: { 'agent-support': SupportedLanguage.BM },
      });

      // User sends English message, but agent-support has a Bambara override
      const lang = await i18n.getResponseLanguage('agent-support', userId, 'Hello, I need help');
      expect(lang).toBe(SupportedLanguage.BM);
    });

    it('should auto-detect language when autoDetect is enabled', async () => {
      const userId = 'user-autodetect-test';
      await detector.updateLanguageProfile(userId, {
        preferredLanguage: SupportedLanguage.FR,
        autoDetect: true,
      });

      const lang = await i18n.getResponseLanguage('default-agent', userId, 'Habari yako, asante sana');
      expect(lang).toBe(SupportedLanguage.SW);
    });

    it('should fallback to preferred language when autoDetect is false', async () => {
      const userId = 'user-no-autodetect';
      await detector.updateLanguageProfile(userId, {
        preferredLanguage: SupportedLanguage.AR,
        autoDetect: false,
      });

      const lang = await i18n.getResponseLanguage('default-agent', userId, 'Habari yako, asante sana');
      expect(lang).toBe(SupportedLanguage.AR);
    });

    it('should correctly identify RTL languages', () => {
      expect(i18n.isRTL(SupportedLanguage.AR)).toBe(true);
      expect(i18n.isRTL(SupportedLanguage.FR)).toBe(false);
      expect(i18n.isRTL(SupportedLanguage.EN)).toBe(false);
      expect(i18n.isRTL(SupportedLanguage.SW)).toBe(false);
      expect(i18n.isRTL(SupportedLanguage.WO)).toBe(false);
      expect(i18n.isRTL(SupportedLanguage.BM)).toBe(false);
    });

    it('should build natural language instructions', () => {
      const instruction = i18n.buildLanguageInstruction(SupportedLanguage.WO);
      expect(instruction).toContain('Wolof');

      const arInstruction = i18n.buildLanguageInstruction(SupportedLanguage.AR);
      expect(arInstruction).toContain('Arabic');
    });

    it('should inject language directive into system prompt', () => {
      const basePrompt = 'You are a helpful customer support agent.';
      const injected = i18n.injectLanguageDirective(basePrompt, SupportedLanguage.FR);

      expect(injected).toContain(basePrompt);
      expect(injected).toContain('[Language Directive]');
      expect(injected).toContain('Respond in French');
    });
  });
});
