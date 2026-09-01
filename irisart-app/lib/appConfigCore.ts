import Constants from 'expo-constants';

export type PublicAppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  appOrigin: string;
};

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  appOrigin?: string;
};

export function configFromBuildExtra(): PublicAppConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  return {
    supabaseUrl: extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    appOrigin: extra.appOrigin ?? process.env.EXPO_PUBLIC_APP_ORIGIN ?? 'https://irisart.app',
  };
}

export function missingConfigKeys(config: PublicAppConfig): string[] {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!config.supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return missing;
}

export function isPublicAppConfigReady(config: PublicAppConfig): boolean {
  return missingConfigKeys(config).length === 0;
}
