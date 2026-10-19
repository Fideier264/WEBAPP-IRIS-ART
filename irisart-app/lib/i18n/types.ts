export type Locale = 'de' | 'en';

export const LOCALES: { id: Locale; label: string; nativeLabel: string }[] = [
  { id: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { id: 'en', label: 'English', nativeLabel: 'English' },
];

export const DEFAULT_LOCALE: Locale = 'de';
export const LOCALE_STORAGE_KEY = 'irisart_locale';

/** Best-effort device language when the user has not chosen one yet. */
export function detectDeviceLocale(): Locale {
  try {
    const tags: string[] = [];
    if (typeof navigator !== 'undefined') {
      if (typeof navigator.language === 'string' && navigator.language) tags.push(navigator.language);
      if (Array.isArray(navigator.languages)) {
        for (const l of navigator.languages) {
          if (typeof l === 'string' && l) tags.push(l);
        }
      }
    }
    try {
      const intl = Intl.DateTimeFormat().resolvedOptions().locale;
      if (intl) tags.push(intl);
    } catch {
      /* ignore */
    }
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      if (lower.startsWith('en')) return 'en';
      if (lower.startsWith('de')) return 'de';
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}
