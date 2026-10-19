import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { BootLoadingScreen } from '@/components/BootLoadingScreen';

import de, { type TranslationKey } from './de';
import en from './en';
import { DEFAULT_LOCALE, detectDeviceLocale, LOCALE_STORAGE_KEY, type Locale } from './types';

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

function isLocale(value: string | null | undefined): value is Locale {
  return value === 'de' || value === 'en';
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // null until AsyncStorage (or device default) resolves — avoids flashing German over English.
  const [locale, setLocaleState] = useState<Locale | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: Locale = DEFAULT_LOCALE;
      try {
        const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
        if (isLocale(stored)) {
          next = stored;
        } else {
          next = detectDeviceLocale();
          // Persist so the next cold start matches what we showed.
          void AsyncStorage.setItem(LOCALE_STORAGE_KEY, next).catch(() => {});
        }
      } catch {
        next = detectDeviceLocale();
      }
      if (!cancelled) setLocaleState(next);
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
      const active = locale ?? DEFAULT_LOCALE;
      const dict = dictionaries[active] ?? dictionaries.de;
      const raw = dict[key] ?? dictionaries.de[key] ?? String(key);
      return format(raw, vars);
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale: locale ?? DEFAULT_LOCALE,
      setLocale,
      t,
      ready: locale !== null,
    }),
    [locale, setLocale, t]
  );

  if (locale === null) {
    return <BootLoadingScreen />;
  }

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
