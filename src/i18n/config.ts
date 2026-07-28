import { createTranslator } from 'next-intl';

export type Locale = 'fr' | 'en' | 'pt' | 'ar';

export const LOCALES: Locale[] = ['fr', 'en', 'pt', 'ar'];
export const DEFAULT_LOCALE: Locale = 'fr';

// Langues avec lecture RTL (Right-to-Left)
export const RTL_LOCALES: Locale[] = ['ar'];

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Francais',
  en: 'English',
  pt: 'Portugues',
  ar: 'العربية',
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
  pt: '🇵🇹',
  ar: '🇸🇦',
};

export const LOCALE_DIRS: Record<Locale, 'ltr' | 'rtl'> = {
  fr: 'ltr',
  en: 'ltr',
  pt: 'ltr',
  ar: 'rtl',
};

export const LOCALE_MARKETS: Record<Locale, string[]> = {
  fr: ['Cameroun', "Cote d'Ivoire", 'Senegal', 'RDC', 'Mali', 'Burkina Faso', 'France', 'Belgique', 'Suisse'],
  en: ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Uganda', 'Tanzania', 'UK', 'USA'],
  pt: ['Angola', 'Mozambique', 'Portugal', 'Bresil'],
  ar: ['Maroc', 'Algerie', 'Tunisie', 'Egypte', 'Mauritanie', 'Djibouti', 'Comores', 'Soudan'],
};

export function getLocaleFromPath(path: string): Locale {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.includes(segments[0] as Locale)) {
    return segments[0] as Locale;
  }
  return DEFAULT_LOCALE;
}

export function getPathWithoutLocale(path: string): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.includes(segments[0] as Locale)) {
    return '/' + segments.slice(1).join('/');
  }
  return path;
}

export function getLocalizedPath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  const cleanPath = getPathWithoutLocale(path);
  return `/${locale}${cleanPath === '/' ? '' : cleanPath}`;
}
