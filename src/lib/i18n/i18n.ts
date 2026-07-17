import fr from './locales/fr/common.json';
import en from './locales/en/common.json';
const locales: Record<string, any> = { fr, en };
export function detectLanguage(): string {
  try { const l = navigator.language?.split('-')[0]; if (locales[l]) return l; } catch {}
  return 'fr';
}
export function t(key: string, params?: Record<string, string>, lang?: string): string {
  const l = lang || detectLanguage();
  const parts = key.split('.');
  let v: any = locales[l] || locales.fr;
  for (const p of parts) { if (v && typeof v === 'object') v = v[p]; else return key; }
  if (typeof v !== 'string') return key;
  return params ? v.replace(/\{(\w+)\}/g, (_, k) => params[k] || '{'+k+'}') : v;
}