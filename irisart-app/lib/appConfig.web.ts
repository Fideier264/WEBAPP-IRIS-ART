import {
  configFromBuildExtra,
  type PublicAppConfig,
} from './appConfigCore';

/**
 * Web production: prefer runtime config from Node server (/app-config.json).
 * Hostinger often injects env vars only at runtime, not during `expo export`.
 */
export async function loadPublicAppConfig(): Promise<PublicAppConfig> {
  const baked = configFromBuildExtra();
  if (baked.supabaseUrl && baked.supabaseAnonKey) return baked;

  try {
    const res = await fetch('/app-config.json', { cache: 'no-store' });
    if (res.ok) {
      const runtime = (await res.json()) as Partial<PublicAppConfig>;
      return {
        supabaseUrl: runtime.supabaseUrl?.trim() || baked.supabaseUrl,
        supabaseAnonKey: runtime.supabaseAnonKey?.trim() || baked.supabaseAnonKey,
        appOrigin: runtime.appOrigin?.trim() || baked.appOrigin,
      };
    }
  } catch {
    /* fall back to build-time values */
  }

  return baked;
}

export type { PublicAppConfig };
export { configFromBuildExtra, isPublicAppConfigReady, missingConfigKeys } from './appConfigCore';
