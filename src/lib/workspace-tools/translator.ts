// ============================================================
// AFRICAN TRANSLATOR — Traduction entre langues africaines
// Supporte: Français, Anglais, Hausa, Yoruba, Igbo, Swahili, 
//           Wolof, Bambara, Lingala, Arabic
// Méthode: dictionnaire de phrases courantes + règles de transposition
// ============================================================

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  countries: string[];
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'fr', name: 'French', nativeName: 'Français', countries: ['CM', 'CI', 'SN', 'ML', 'BF', 'BJ', 'TG', 'NE', 'TD', 'GA', 'CG', 'CF', 'TD'] },
  { code: 'en', name: 'English', nativeName: 'English', countries: ['NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'GM', 'SL', 'LR'] },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', countries: ['NG', 'NE'] },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', countries: ['NG', 'BJ'] },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', countries: ['NG'] },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', countries: ['KE', 'TZ', 'UG', 'RW', 'BI', 'CD'] },
  { code: 'wo', name: 'Wolof', nativeName: 'Wolof', countries: ['SN'] },
  { code: 'bm', name: 'Bambara', nativeName: 'Bamanankan', countries: ['ML'] },
  { code: 'ln', name: 'Lingala', nativeName: 'Lingála', countries: ['CD', 'CG'] },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', countries: ['EG', 'MA', 'DZ', 'TN', 'LY', 'SD', 'MR'] },
];

// Dictionnaire de phrases/traductions courantes
type TranslationMap = Record<string, string>;

const PHRASES: Record<string, TranslationMap> = {
  'bonjour': { fr: 'Bonjour', en: 'Good morning', ha: 'Ina kwana', yo: 'Ẹ kaaro', ig: 'Ụtụtụ ọma', sw: 'Habari za asubuhi', wo: 'Salaam aleekum', bm: 'I ni ce', ln: 'Mbote na yo', ar: 'صباح الخير' },
  'merci': { fr: 'Merci', en: 'Thank you', ha: 'Na gode', yo: 'O ṣeun', ig: 'Daalụ', sw: 'Asante', wo: 'Jërejëf', bm: 'Aw ni ce', ln: 'Matondi', ar: 'شكرا' },
  'oui': { fr: 'Oui', en: 'Yes', ha: 'Eh', yo: 'Bẹẹni', ig: 'Ee', sw: 'Ndiyo', wo: 'Waaw', bm: 'Aw', ln: 'Ee', ar: 'نعم' },
  'non': { fr: 'Non', en: 'No', ha: 'A\'a', yo: 'Rara', ig: 'Mba', sw: 'Hapana', wo: 'Deedet', bm: 'Mba', ln: 'Te', ar: 'لا' },
  'bienvenue': { fr: 'Bienvenue', en: 'Welcome', ha: 'Barka da zuwa', yo: 'Ẹ kú àbọ̀', ig: 'Nnọọ', sw: 'Karibu', wo: 'Dolëen na', bm: 'I ni ce', ln: 'Boyo mutindo', ar: 'أهلا وسهلا' },
  'aide': { fr: 'Aide', en: 'Help', ha: 'Taimako', yo: 'Irankẹ', ig: 'Nyere aka', sw: 'Msaada', wo: 'Ndimbal', bm: 'Dɛmɛ', ln: 'Lisalisi', ar: 'مساعدة' },
  'argent': { fr: 'Argent', en: 'Money', ha: 'Kudi', yo: 'Owó', ig: 'Ego', sw: 'Pesa', wo: 'Xaalis', bm: 'Wari', ln: 'Mbongo', ar: 'مال' },
  'eau': { fr: 'Eau', en: 'Water', ha: 'Ruwa', yo: 'Omi', ig: 'Mmiri', sw: 'Maji', wo: 'Ndoob', bm: 'Ji', ln: 'Mai', ar: 'ماء' },
  'manger': { fr: 'Manger', en: 'Eat', ha: 'Cin abinci', yo: 'Jẹ', ig: 'Ri nri', sw: 'Kula', wo: 'Lekk', bm: 'Dumuni', ln: 'Lia', ar: 'أكل' },
  'maison': { fr: 'Maison', en: 'House', ha: 'Gida', yo: 'Ilé', ig: 'Ụlọ', sw: 'Nyumba', wo: 'Kër', bm: 'So', ln: 'Nzo', ar: 'بيت' },
  'marché': { fr: 'Marché', en: 'Market', ha: 'Kasuwa', yo: 'Ọjà', ig: 'Ahịa', sw: 'Soko', wo: 'Marché', bm: 'Jago', ln: 'Zando', ar: 'سوق' },
  'travail': { fr: 'Travail', en: 'Work', ha: 'Aiki', yo: 'Iṣẹ́', ig: 'Ọrụ', sw: 'Kazi', wo: 'Liggéey', bm: 'Baara', ln: 'Mosala', ar: 'عمل' },
  'temps': { fr: 'Temps', en: 'Time', ha: 'Lokaci', yo: 'Àkókò', ig: 'Oge', sw: 'Wakati', wo: 'Jamano', bm: 'Jɛ', ln: 'Ngonga', ar: 'وقت' },
  'ami': { fr: 'Ami', en: 'Friend', ha: 'Aboki', yo: 'Ọrẹ́', ig: 'Enyi', sw: 'Rafiki', wo: 'Xarit', bm: 'Jɛ', ln: 'Monganga', ar: 'صديق' },
  'amour': { fr: 'Amour', en: 'Love', ha: 'So', yo: 'Ifẹ́', ig: 'Ịhụnanya', sw: 'Mapenzi', wo: 'Noppi', bm: 'Hakilili', ln: 'Linga', ar: 'حب' },
  'santé': { fr: 'Santé', en: 'Health', ha: 'Lafiya', yo: 'Iléra', ig: 'Ahụ ike', sw: 'Afya', wo: 'Wér', bm: 'Bana', ln: 'Bontola', ar: 'صحة' },
  'paiement': { fr: 'Paiement', en: 'Payment', ha: 'Biya', yo: 'Owó san', ig: 'Ịkwụ ụgwọ', sw: 'Malipo', wo: 'Fayda', bm: 'Sara', ln: 'Funda', ar: 'دفع' },
  'business': { fr: 'Business', en: 'Business', ha: 'Kasuwanci', yo: 'Iṣẹ́-owo', ig: 'Ahịa', sw: 'Biashara', wo: 'Liggéey', bm: 'Jago', ln: 'Bisinsi', ar: 'عمل تجاري' },
  'réunion': { fr: 'Réunion', en: 'Meeting', ha: 'Taro', yo: 'Ìpàdé', ig: 'Ọzụ̀', sw: 'Mkutano', wo: 'Ja-bopp', bm: 'Baarajɛ', ln: 'Mpalama', ar: 'اجتماع' },
  'projet': { fr: 'Projet', en: 'Project', ha: 'Aikin', yo: 'Iṣẹ́-àtìlẹyìn', ig: 'Ọrụ', sw: 'Mradi', wo: 'Liggéey', bm: 'Baara', ln: 'Projet', ar: 'مشروع' },
};

// Détection de la langue source
function detectLanguage(text: string): string {
  const lower = text.toLowerCase().trim();
  for (const [phrase, translations] of Object.entries(PHRASES)) {
    if (lower === phrase || lower.startsWith(phrase)) {
      for (const [lang, value] of Object.entries(translations)) {
        if (lower === value.toLowerCase() || lower.startsWith(value.toLowerCase())) {
          return lang;
        }
      }
    }
  }
  // Détection par caractères distinctifs
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[àâçéèêëîïôûùüÿ]/i.test(text) && /\b(le|la|les|de|une|un|et|est)\b/i.test(text)) return 'fr';
  return 'fr'; // défaut français
}

export class AfricanTranslator {
  /**
   * Traduit un mot ou une phrase courte
   */
  translate(text: string, from: string, to: string): { translated: string; source: string; detected: string; matches: number } {
    if (from === to) return { translated: text, source: from, detected: from, matches: 0 };

    const lower = text.toLowerCase().trim();
    let translated = text;
    let matches = 0;

    // 1. Traduction directe depuis le dictionnaire
    for (const [basePhrase, translations] of Object.entries(PHRASES)) {
      // Si le texte contient la phrase de base (fr)
      if (lower === basePhrase || lower.startsWith(basePhrase + ' ')) {
        if (translations[to]) {
          translated = translated.replace(new RegExp(basePhrase, 'i'), translations[to]);
          matches++;
        }
      }
      // Si le texte est dans une autre langue, cherche dans les traductions
      for (const [lang, value] of Object.entries(translations)) {
        if (lang === from && (lower === value.toLowerCase() || lower.startsWith(value.toLowerCase()))) {
          // Trouve la correspondance, traduis vers la cible
          const targetValue = translations[to] || translations['fr'];
          translated = translated.replace(new RegExp(value, 'i'), targetValue);
          matches++;
        }
      }
    }

    // 2. Traduction mot par mot pour les phrases
    if (matches === 0) {
      const words = lower.split(/\s+/);
      const translatedWords = words.map(word => {
        const cleanWord = word.replace(/[^a-zàâçéèêëîïôûùüÿñáíóú-]/g, '');
        for (const [basePhrase, translations] of Object.entries(PHRASES)) {
          if (cleanWord === basePhrase && translations[to]) {
            matches++;
            return translations[to];
          }
          for (const [lang, value] of Object.entries(translations)) {
            if (lang === from && cleanWord === value.toLowerCase()) {
              matches++;
              return translations[to] || translations['fr'];
            }
          }
        }
        return word;
      });
      translated = translatedWords.join(' ');
    }

    return {
      translated: matches > 0 ? translated : `[Non traduit — dictionnaire incomplet pour "${text}"]`,
      source: from,
      detected: from,
      matches,
    };
  }

  /**
   * Traduit avec détection automatique de la langue source
   */
  autoTranslate(text: string, to: string): { translated: string; detectedFrom: string; to: string; matches: number } {
    const detected = detectLanguage(text);
    const result = this.translate(text, detected, to);
    return { translated: result.translated, detectedFrom: detected, to, matches: result.matches };
  }

  /**
   * Liste les langues supportées
   */
  listLanguages(): SupportedLanguage[] {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * Suggère des phrases courantes à traduire
   */
  getCommonPhrases(): Array<{ fr: string; translations: Record<string, string> }> {
    return Object.entries(PHRASES).map(([base, translations]) => ({
      fr: base,
      translations,
    }));
  }

  /**
   * Détecte la langue d'un texte
   */
  detect(text: string): string {
    return detectLanguage(text);
  }
}

export const africanTranslator = new AfricanTranslator();
