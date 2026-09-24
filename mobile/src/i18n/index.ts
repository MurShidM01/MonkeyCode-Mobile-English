import React, { createContext, useContext } from 'react';
import { en } from './en';
export type Language = 'en';
export const DEFAULT_LANGUAGE: Language = 'en';
type I18nValue = { language: Language; t: (path: string) => string };
const I18nContext = createContext<I18nValue>({ language: DEFAULT_LANGUAGE, t: (path) => path });
function resolvePath(path: string): string {
  let value: unknown = en;
  for (const part of path.split('.')) {
    if (value && typeof value === 'object' && part in value) value = (value as Record<string, unknown>)[part];
    else return path;
  }
  return typeof value === 'string' ? value : path;
}
export function I18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nContext.Provider value={{ language: DEFAULT_LANGUAGE, t: resolvePath }}>{children}</I18nContext.Provider>;
}
export function useI18n() { return useContext(I18nContext); }
