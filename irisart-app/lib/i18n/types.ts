export type Locale = 'de' | 'en';

export const LOCALES: { id: Locale; label: string; nativeLabel: string }[] = [
  { id: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { id: 'en', label: 'English', nativeLabel: 'English' },
];

export const DEFAULT_LOCALE: Locale = 'de';
export const LOCALE_STORAGE_KEY = 'irisart_locale';
