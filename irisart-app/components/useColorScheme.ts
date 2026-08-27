import { useAppColors } from '@/lib/appTheme';

/** @deprecated Prefer useAppColors() — kept for gradual migration. */
export function useColorScheme(): 'light' | 'dark' {
  return useAppColors().isDarkPage ? 'dark' : 'light';
}

export { useAppColors } from '@/lib/appTheme';
