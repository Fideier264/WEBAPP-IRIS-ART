import { supabase, supabaseAnonKey } from './supabase';

function extractStatus(err: unknown): number | undefined {
  const anyErr = err as { context?: { status?: number }; status?: number } | null;
  if (typeof anyErr?.context?.status === 'number') return anyErr.context.status;
  if (typeof anyErr?.status === 'number') return anyErr.status;
  return undefined;
}

/**
 * Invoke a public Edge Function with a gateway-valid JWT.
 * Logged-in user access tokens can 401 on Functions (JWT signing / verify_jwt);
 * the anon key is accepted for these public endpoints.
 */
export async function invokeEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: unknown | null }> {
  if (!supabaseAnonKey) {
    return { data: null, error: new Error('Missing Supabase anon key for Edge Function call.') };
  }

  const anonHeaders = {
    Authorization: `Bearer ${supabaseAnonKey}`,
    apikey: supabaseAnonKey,
  };

  let result = await supabase.functions.invoke(name, {
    body,
    headers: anonHeaders,
  });

  // Rare: if anon key is rejected but a session JWT works, retry once with session.
  if (result.error && extractStatus(result.error) === 401) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token;
    if (token) {
      result = await supabase.functions.invoke(name, {
        body,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      });
    }
  }

  return result as { data: T | null; error: unknown | null };
}

export { extractStatus };
