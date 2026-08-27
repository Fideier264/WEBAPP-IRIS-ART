import { useAppColors } from '@/lib/appTheme';

export { useAppColors, useAppTheme } from '@/lib/appTheme';

export function useColorScheme(): 'light' | 'dark' {
  return useAppColors().isDarkPage ? 'dark' : 'light';
}
