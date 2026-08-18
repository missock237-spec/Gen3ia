/**
 * Core i18n module for Multi-language Agent Responses in Gen3ia.
 * Supports automatic language detection, user preferences, per-agent overrides, and RTL scripts.
 */

export enum SupportedLanguage {
  FR = 'fr',
  EN = 'en',
  AR = 'ar',
  SW = 'sw',
  WO = 'wo',
  BM = 'bm',
}

export interface LanguageProfile {
  userId: string;
  preferredLanguage: SupportedLanguage;
  fallbackLanguage: SupportedLanguage;
  autoDetect: boolean;
  agentOverrides: { [agentId: string]: SupportedLanguage };
  rtl: boolean;
}

export interface DetectionResult {
  detectedLanguage: SupportedLanguage;
  confidence: number;
  alternatives: { language: SupportedLanguage; confidence: number }[];
}

/**
 * Language Keyword Maps for heuristic detection.
 * Contains at least 10 keywords/phrases per language.
 */
export const LANGUAGE_KEYWORDS: Record<SupportedLanguage, string[]> = {
  [SupportedLanguage.FR]: [
    'bonjour', 'salut', 'merci', 'comment', 'pourquoi', 's\'il vous plaît',
    'sil vous plait', 'oui', 'non', 'd\'accord', 'daccord', 'aujourd\'hui',
    'demain', 'monsieur', 'madame', 'besoin', 'aide', 'est-ce', 'avec',
    'dans', 'pour', 'bonsoir', 'bienvenue', 'français', 'francais'
  ],
  [SupportedLanguage.EN]: [
    'hello', 'hi', 'thanks', 'thank you', 'please', 'how', 'why', 'what',
    'where', 'today', 'tomorrow', 'help', 'yes', 'no', 'with', 'for',
    'would', 'could', 'should', 'about', 'welcome', 'good morning', 'english'
  ],
  [SupportedLanguage.AR]: [
    'مرحبا', 'شكرا', 'كيف', 'لماذا', 'نعم', 'لا', 'من فضلكم', 'من فضلك',
    'السلام', 'عليكم', 'اليوم', 'غدا', 'مساعدة', 'اريد', 'ايضا', 'أهلا',
    'شكراً', 'عفواً', 'كيف حالك', 'صباح الخير', 'العربية'
  ],
  [SupportedLanguage.SW]: [
    'jambo', 'habari', 'asante', 'karibu', 'tafadhali', 'kwa heri', 'kwaheri',
    'ndiyo', 'hapana', 'sana', 'leo', 'kesho', 'nzuri', 'mambo', 'shukrani',
    'msada', 'msaada', 'kwa', 'rafiki', 'salama', 'kiswahili'
  ],
  [SupportedLanguage.WO]: [
    'nanga def', 'nanga', 'jaajaf', 'jerejef', 'jërejëf', 'waaw', 'deedet',
    'soo laate', 'lu xew', 'am na', 'akksil', 'na nga def', 'teranga',
    'sunu', 'sama', 'yawi', 'bala', 'ndokkel', 'sant', 'wolof'
  ],
  [SupportedLanguage.BM]: [
    'i ni sogoma', 'i ni tile', 'i ni wula', 'i ni su', 'a ni ce', 'anitché',
    'anitchi', 'i ka kene', 'aw ni ce', 'i bisimila', 'i ni ce', 'bamanankan',
    'i ka kɛnɛ', 'ne bɛ', 'aw ni baara', 'i ni baara', 'n\'ba', 'bambara'
  ],
};

// Persistent storage for language profiles — uses FirestoreRepository directly
// (collection 'language_profiles' — Prisma shim n'expose pas ce modèle par défaut).
import { FirestoreRepository } from '@/lib/firebase/firestore';
import { createLogger } from '@/lib/logger';

const log = createLogger('agent-i18n');

const profileStore = new Map<string, LanguageProfile>();
const profileRepo = new FirestoreRepository<LanguageProfile & { id: string }>('language_profiles');

export class LanguageDetector {
  /**
   * Perform heuristic detection on input text using character sets,
   * keyword matching, and frequency scoring.
   */
  detect(text: string): DetectionResult {
    if (!text || text.trim().length === 0) {
      return {
        detectedLanguage: SupportedLanguage.FR,
        confidence: 0,
        alternatives: [
          { language: SupportedLanguage.EN, confidence: 0 },
          { language: SupportedLanguage.AR, confidence: 0 },
          { language: SupportedLanguage.SW, confidence: 0 },
          { language: SupportedLanguage.WO, confidence: 0 },
          { language: SupportedLanguage.BM, confidence: 0 },
        ],
      };
    }

    const normalizedText = text.toLowerCase();

    // Check for Arabic Script
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
    const arabicMatches = normalizedText.match(arabicRegex);
    const totalChars = normalizedText.replace(/\s+/g, '').length;

    const scores: Record<SupportedLanguage, number> = {
      [SupportedLanguage.FR]: 0,
      [SupportedLanguage.EN]: 0,
      [SupportedLanguage.AR]: 0,
      [SupportedLanguage.SW]: 0,
      [SupportedLanguage.WO]: 0,
      [SupportedLanguage.BM]: 0,
    };

    if (arabicMatches && totalChars > 0) {
      const arabicCharRatio = arabicMatches.length / totalChars;
      scores[SupportedLanguage.AR] += arabicCharRatio * 10;
    }

    // Tokenize text into words and multi-word phrases
    const words = normalizedText.split(/[^\p{L}\p{M}\d]+/u).filter(Boolean);

    for (const [langKey, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
      const lang = langKey as SupportedLanguage;
      for (const keyword of keywords) {
        const cleanKeyword = keyword.toLowerCase();
        if (cleanKeyword.includes(' ')) {
          if (normalizedText.includes(cleanKeyword)) {
            scores[lang] += 2.5; // Multi-word match bonus
          }
        } else {
          for (const word of words) {
            if (word === cleanKeyword) {
              scores[lang] += 1.0;
            }
          }
        }
      }
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    let results: { language: SupportedLanguage; confidence: number }[] = [];

    if (totalScore === 0) {
      // Default fallback distribution when no keywords matched
      results = [
        { language: SupportedLanguage.FR, confidence: 0.3 },
        { language: SupportedLanguage.EN, confidence: 0.25 },
        { language: SupportedLanguage.SW, confidence: 0.15 },
        { language: SupportedLanguage.WO, confidence: 0.1 },
        { language: SupportedLanguage.BM, confidence: 0.1 },
        { language: SupportedLanguage.AR, confidence: 0.1 },
      ];
    } else {
      results = Object.entries(scores).map(([langKey, score]) => {
        const lang = langKey as SupportedLanguage;
        // Normalize confidence between 0 and 1
        const rawConf = score / Math.max(totalScore, 1);
        const normalizedConf = Math.min(Math.round(rawConf * 100) / 100, 0.99);
        return { language: lang, confidence: normalizedConf };
      });

      results.sort((a, b) => b.confidence - a.confidence);
    }

    const detectedLanguage = results[0].language;
    const confidence = results[0].confidence;
    const alternatives = results.slice(1);

    return {
      detectedLanguage,
      confidence,
      alternatives,
    };
  }

  /**
   * Maps browser locale string to supported language.
   */
  detectFromLocale(locale: string): SupportedLanguage {
    if (!locale) return SupportedLanguage.FR;
    const loc = locale.toLowerCase().trim();

    if (loc.startsWith('fr')) return SupportedLanguage.FR;
    if (loc.startsWith('en')) return SupportedLanguage.EN;
    if (loc.startsWith('ar')) return SupportedLanguage.AR;
    if (loc.startsWith('sw')) return SupportedLanguage.SW;
    if (loc.startsWith('wo')) return SupportedLanguage.WO;
    if (loc.startsWith('bm') || loc.startsWith('bam')) return SupportedLanguage.BM;

    return SupportedLanguage.FR;
  }

  /**
   * Retrieve language profile for a given user.
   */
  async getLanguageProfile(userId: string): Promise<LanguageProfile> {
    const existing = profileStore.get(userId);
    if (existing) {
      return { ...existing };
    }

    const defaultProfile: LanguageProfile = {
      userId,
      preferredLanguage: SupportedLanguage.FR,
      fallbackLanguage: SupportedLanguage.EN,
      autoDetect: true,
      agentOverrides: {},
      rtl: false,
    };

    profileStore.set(userId, defaultProfile);
    return { ...defaultProfile };
  }

  /**
   * Update language profile for a given user.
   */
  async updateLanguageProfile(
    userId: string,
    updates: Partial<LanguageProfile>
  ): Promise<void> {
    const current = await this.getLanguageProfile(userId);

    const updatedPref = updates.preferredLanguage ?? current.preferredLanguage;
    const isArabic = updatedPref === SupportedLanguage.AR;

    const updatedProfile: LanguageProfile = {
      ...current,
      ...updates,
      userId,
      preferredLanguage: updatedPref,
      fallbackLanguage: updates.fallbackLanguage ?? current.fallbackLanguage,
      autoDetect: updates.autoDetect ?? current.autoDetect,
      agentOverrides: updates.agentOverrides
        ? { ...updates.agentOverrides }
        : { ...current.agentOverrides },
      rtl: updates.rtl !== undefined ? updates.rtl : isArabic,
    };

    profileStore.set(userId, updatedProfile);
    try {
      await profileRepo.upsert({
        where: { id: userId },
        create: { id: userId, ...updatedProfile } as any,
        update: { ...updatedProfile } as any,
      });
    } catch (err) {
      log.error('language_profiles.upsert failed', { userId, error: String(err) });
    }
  }
}

export class AgentI18n {
  private detector: LanguageDetector;

  constructor(detector: LanguageDetector = new LanguageDetector()) {
    this.detector = detector;
  }

  /**
   * Determines the language for an agent response based on agent overrides,
   * auto-detection on user message, or user preferences.
   */
  async getResponseLanguage(
    agentId: string,
    userId: string,
    userMessage: string
  ): Promise<SupportedLanguage> {
    const profile = await this.detector.getLanguageProfile(userId);

    // 1. Check agent override
    if (agentId && profile.agentOverrides && profile.agentOverrides[agentId]) {
      return profile.agentOverrides[agentId];
    }

    // 2. Auto-detect from user message if enabled
    if (profile.autoDetect && userMessage && userMessage.trim().length > 0) {
      const detection = this.detector.detect(userMessage);
      if (detection.confidence >= 0.2) {
        return detection.detectedLanguage;
      }
    }

    // 3. Fallback to user preferred or fallback language
    return profile.preferredLanguage || profile.fallbackLanguage || SupportedLanguage.FR;
  }

  /**
   * Generates a clear instruction prompt for LLM response generation in the target language.
   */
  buildLanguageInstruction(language: SupportedLanguage): string {
    switch (language) {
      case SupportedLanguage.FR:
        return 'Respond in French (français). Use natural, fluent French.';
      case SupportedLanguage.EN:
        return 'Respond in English. Use natural, fluent English.';
      case SupportedLanguage.AR:
        return 'Respond in Arabic (العربية). Use natural, fluent Arabic. Note: Right-to-Left script.';
      case SupportedLanguage.SW:
        return 'Respond in Swahili (Kiswahili). Use natural, fluent Swahili.';
      case SupportedLanguage.WO:
        return 'Respond in Wolof. Use natural, fluent Wolof.';
      case SupportedLanguage.BM:
        return 'Respond in Bambara (Bamanankan). Use natural, fluent Bambara.';
      default:
        return 'Respond in French (français). Use natural, fluent French.';
    }
  }

  /**
   * Returns true if the given language uses Right-to-Left (RTL) writing system.
   */
  isRTL(language: SupportedLanguage): boolean {
    return language === SupportedLanguage.AR;
  }

  /**
   * Appends language instruction to system prompt.
   */
  injectLanguageDirective(prompt: string, language: SupportedLanguage): string {
    const instruction = this.buildLanguageInstruction(language);
    if (!prompt || prompt.trim() === '') {
      return instruction;
    }
    return `${prompt}\n\n[Language Directive]\n${instruction}`;
  }
}

// Export singleton instances
export const languageDetector = new LanguageDetector();
export const agentI18n = new AgentI18n(languageDetector);

export default agentI18n;
