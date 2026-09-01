import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { PublicAppConfig } from './appConfigCore';
import { configFromBuildExtra, isPublicAppConfigReady } from './appConfigCore';

const baked = configFromBuildExtra();

export const supabaseUrl = baked.supabaseUrl;
export let supabaseAnonKey = baked.supabaseAnonKey;

let supabaseClient: SupabaseClient | null = null;

export function isSupabaseConfigured(config?: PublicAppConfig): boolean {
  const cfg = config ?? baked;
  return isPublicAppConfigReady(cfg);
}

export function initSupabase(config: PublicAppConfig): SupabaseClient {
  if (!isPublicAppConfigReady(config)) {
    throw new Error('Cannot init Supabase without URL and anon key.');
  }
  supabaseAnonKey = config.supabaseAnonKey;
  supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    throw new Error('Supabase is not initialized yet.');
  }
  return supabaseClient;
}

/** Backward-compatible export — call after `initSupabase`. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    const value = (client as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
