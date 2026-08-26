import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import de, { type TranslationKey } from './de';
import en from './en';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, type Locale } from './types';

type Vars = Record<string, string | number>;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
  ready: boolean;
};

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  de: de as Record<TranslationKey, string>,
  en,
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
        if (!cancelled && (stored === 'de' || stored === 'en')) {
          setLocaleState(stored);
        }
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch(() => {
      /* ignore */
    });
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Vars) => {
      const dict = dictionaries[locale] ?? dictionaries.de;
      const raw = dict[key] ?? dictionaries.de[key] ?? String(key);
      return format(raw, vars);
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useT() {
  return useLocale().t;
}

export type { Locale, TranslationKey };
export { LOCALES } from './types';
