import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import Colors from '@/constants/Colors';

export type BackgroundTheme = 'light' | 'dark';

const STORAGE_KEY = 'irisart_background_theme';

export type AppColorSet = {
  text: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  /** Muted text on light cards/surfaces */
  muted: string;
  /** Text on page background (outside cards) */
  pageText: string;
  pageMuted: string;
  /** Pills/chips directly on the page background */
  chipBg: string;
  chipBgActive: string;
  chipText: string;
  chipTextActive: string;
  chipBorder: string;
  chipBorderActive: string;
  /** Form field labels on the page background */
  formLabel: string;
  inputPlaceholder: string;
  isDarkPage: boolean;
  pageGradient: readonly [string, string, string];
};

function buildColors(backgroundTheme: BackgroundTheme): AppColorSet {
  const card = Colors.light;
  const muted = 'rgba(10,11,16,0.72)';
  if (backgroundTheme === 'light') {
    return {
      ...card,
      muted,
      pageText: card.text,
      pageMuted: 'rgba(10,11,16,0.62)',
      chipBg: card.surfaceAlt,
      chipBgActive: 'rgba(124,92,255,0.16)',
      chipText: card.text,
      chipTextActive: card.text,
      chipBorder: card.border,
      chipBorderActive: card.tint,
      formLabel: card.text,
      inputPlaceholder: 'rgba(10,11,16,0.45)',
      isDarkPage: false,
      pageGradient: ['rgba(91,92,255,0.12)', 'rgba(0,212,255,0.04)', 'rgba(247,248,255,0)'],
    };
  }
  return {
    ...card,
    background: Colors.dark.background,
    tint: Colors.dark.tint,
    tabIconSelected: Colors.dark.tint,
    muted,
    pageText: Colors.dark.text,
    pageMuted: 'rgba(243,245,255,0.62)',
    chipBg: 'rgba(255,255,255,0.10)',
    chipBgActive: card.surface,
    chipText: Colors.dark.text,
    chipTextActive: card.text,
    chipBorder: 'rgba(243,245,255,0.18)',
    chipBorderActive: Colors.dark.tint,
    formLabel: Colors.dark.text,
    inputPlaceholder: 'rgba(10,11,16,0.45)',
    isDarkPage: true,
    pageGradient: ['rgba(124,92,255,0.22)', 'rgba(0,212,255,0.06)', 'rgba(5,6,10,0)'],
  };
}

type ThemeContextValue = {
  backgroundTheme: BackgroundTheme;
  setBackgroundTheme: (theme: BackgroundTheme) => void;
  colors: AppColorSet;
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [backgroundTheme, setBackgroundThemeState] = useState<BackgroundTheme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (stored === 'light' || stored === 'dark')) {
          setBackgroundThemeState(stored);
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

  const setBackgroundTheme = useCallback((next: BackgroundTheme) => {
    setBackgroundThemeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      /* ignore */
    });
  }, []);

  const colors = useMemo(() => buildColors(backgroundTheme), [backgroundTheme]);

  const value = useMemo(
    () => ({ backgroundTheme, setBackgroundTheme, colors, ready }),
    [backgroundTheme, setBackgroundTheme, colors, ready]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}

/** Card + page colors (background-only dark mode). */
export function useAppColors(): AppColorSet {
  return useAppTheme().colors;
}

export const BACKGROUND_THEMES: { id: BackgroundTheme; labelKey: 'account.bg.light' | 'account.bg.dark' }[] = [
  { id: 'light', labelKey: 'account.bg.light' },
  { id: 'dark', labelKey: 'account.bg.dark' },
];
