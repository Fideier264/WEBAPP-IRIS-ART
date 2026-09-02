import { configFromBuildExtra, type PublicAppConfig } from './appConfigCore';

/** Native / default: build-time config from expo extra / env. */
export async function loadPublicAppConfig(): Promise<PublicAppConfig> {
  return configFromBuildExtra();
}

export type { PublicAppConfig };
export { configFromBuildExtra, isPublicAppConfigReady, missingConfigKeys, supabaseAnonKeyIssue } from './appConfigCore';
