import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { en } from './en';

export type Language = 'en';
export const DEFAULT_LANGUAGE: Language = 'en';
export const LANGUAGE_OPTIONS = [{ key: 'en' as const, label: 'English' }];

type I18nValue = {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  t: (path: string) => string;
};

const LANGUAGE_KEY = 'mc.language';
const I18nContext = createContext<I18nValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: async () => undefined,
  t: (path) => path,
});

function resolvePath(path: string): string {
  let value: unknown = en;
  for (const part of path.split('.')) {
    if (value && typeof value === 'object' && part in value) value = (value as Record<string, unknown>)[part];
    else return path;
  }
  return typeof value === 'string' ? value : path;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((value) => { if (active && value === 'en') setLanguageState('en'); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const setLanguage = async (next: Language) => {
    setLanguageState(next);
    await AsyncStorage.setItem(LANGUAGE_KEY, next);
  };

  const value = useMemo(() => ({ language, setLanguage, t: resolvePath }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() { return useContext(I18nContext); }
