"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICTIONARIES, type Lang, type TranslationKey } from "./dictionaries";

/**
 * i18n GEN3IA — bilingue français / anglais.
 * - langue persistée : localStorage (choix explicite) > profil utilisateur
 *   (settings.language) > langue du navigateur > français ;
 * - chaque changement est propagé au profil via /api/settings et au cookie
 *   gen3ia_lang (lus par les routes serveur pour localiser leurs messages) ;
 * - t() prend en charge l'interpolation {param}.
 */

const STORAGE_KEY = "gen3ia.lang";
export const LANG_COOKIE = "gen3ia_lang";

export function isLang(v: unknown): v is Lang {
  return v === "fr" || v === "en";
}

function detectBrowserLang(): Lang {
  try {
    const nav = navigator.language ?? "fr";
    return nav.toLowerCase().startsWith("fr") ? "fr" : "en";
  } catch {
    return "fr";
  }
}

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string): void {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* cookies bloqués : la langue reste en localStorage */
  }
}

interface I18nContextValue {
  lang: Lang;
  /** Langue effective après résolution (false tant que la résolution initiale est en cours). */
  ready: boolean;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr"); // correspond au rendu serveur
  const [ready, setReady] = useState(false);

  // Résolution initiale : localStorage → cookie → profil → navigateur.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let resolved: Lang | null = null;
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isLang(stored)) resolved = stored;
      } catch {
        /* stockage indisponible */
      }
      if (!resolved) {
        const cookieLang = readCookie(LANG_COOKIE);
        if (isLang(cookieLang)) resolved = cookieLang;
      }
      if (!resolved) {
        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          const json = (await res.json()) as { user?: { settings?: { language?: string } } };
          const profileLang = json.user?.settings?.language;
          if (isLang(profileLang)) resolved = profileLang;
        } catch {
          /* non connecté ou réseau indisponible */
        }
      }
      const final = resolved ?? detectBrowserLang();
      // setState avec la même valeur est un no-op : inutile de lire « lang » ici
      // (l'effet reste à dépendances vides, résolution unique au montage).
      if (!cancelled) setLangState(final);
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    }
  }, []);

  // Reflet de la langue sur l'attribut <html lang>.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* stockage indisponible */
    }
    writeCookie(LANG_COOKIE, next);
    // Propagation au profil (silencieuse si non connecté).
    void fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    }).catch(() => undefined);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      let value: string = DICTIONARIES[lang][key] ?? DICTIONARIES.fr[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return value;
    },
    [lang]
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({ lang, ready, setLang, t }),
    [lang, ready, setLang, t]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n doit être utilisé sous <LanguageProvider>.");
  }
  return ctx;
}

/** Traduction hors composant (scripts, tests) — langue explicite. */
export function translate(
  lang: Lang,
  key: TranslationKey,
  params?: Record<string, string | number>
): string {
  let value: string = DICTIONARIES[lang][key] ?? DICTIONARIES.fr[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}
