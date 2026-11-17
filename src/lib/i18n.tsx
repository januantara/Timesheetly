import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { AppLanguage } from '../types';

export const LANGUAGE_STORAGE_KEY = 'timesheetly_ui_lang';

let currentActiveLanguage: AppLanguage = 'en';

export function getStoredLanguage(): AppLanguage {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw === 'id' || raw === 'en') {
      currentActiveLanguage = raw;
      return raw;
    }
  } catch {
    // ignore storage access issues
  }
  return currentActiveLanguage;
}

export function getActiveLanguage(): AppLanguage {
  return currentActiveLanguage;
}

export function syncActiveLanguage(lang: AppLanguage): void {
  currentActiveLanguage = lang;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore storage access issues
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

export function pickLang(lang: AppLanguage, en: string, id: string): string {
  return lang === 'id' ? id : en;
}

export interface LanguageContextValue {
  lang: AppLanguage;
  isId: boolean;
  setLang: (nextLang: AppLanguage) => void;
  t: (en: string, id: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  isId: false,
  setLang: () => {},
  t: (en) => en,
});

interface LanguageProviderProps {
  lang: AppLanguage;
  onChangeLang: (nextLang: AppLanguage) => void;
  children: ReactNode;
}

export function LanguageProvider({
  lang,
  onChangeLang,
  children,
}: LanguageProviderProps) {
  useEffect(() => {
    syncActiveLanguage(lang);
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      isId: lang === 'id',
      setLang: onChangeLang,
      t: (en: string, id: string) => (lang === 'id' ? id : en),
    }),
    [lang, onChangeLang]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
