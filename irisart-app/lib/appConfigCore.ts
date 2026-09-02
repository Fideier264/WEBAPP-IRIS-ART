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

/** Wrong key type causes "Invalid API key" / "Invalid Compact JWS" on native + Edge Functions. */
export function supabaseAnonKeyIssue(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('sb_publishable_')) {
    return 'Der Publishable Key (sb_publishable_…) funktioniert nicht. Nutze den legacy anon JWT (beginnt mit eyJ…).';
  }
  if (!trimmed.startsWith('eyJ')) {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY muss ein JWT sein (beginnt mit eyJ…).';
  }
  return null;
}

export function isPublicAppConfigReady(config: PublicAppConfig): boolean {
  return missingConfigKeys(config).length === 0 && !supabaseAnonKeyIssue(config.supabaseAnonKey);
}
