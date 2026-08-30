import { extractStatus } from './invokeEdgeFunction';
import { supabase, supabaseAnonKey } from './supabase';

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

async function messageFromInvokeError(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === 'string' && e.trim()) return e.trim();
  }

  const anyErr = error as {
    message?: string;
    context?: { json?: () => Promise<unknown>; text?: () => Promise<string> };
  } | null;

  const ctx = anyErr?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string; message?: string };
      if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
      if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
    } catch {
      /* ignore */
    }
  }
  if (ctx && typeof ctx.text === 'function') {
    try {
      const text = await ctx.text();
      if (text?.trim()) return text.trim().slice(0, 400);
    } catch {
      /* ignore */
    }
  }

  const status = extractStatus(error);
  if (status === 404) {
    return 'Edge Function delete-account nicht gefunden. Bitte deployen.';
  }
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message.trim();
  return 'Konto konnte nicht gelöscht werden.';
}

/**
 * Permanently delete the signed-in user and their gallery data.
 * Requires Edge Function `delete-account` (JWT of the current user).
 */
export async function requestDeleteOwnAccount(): Promise<DeleteAccountResult> {
  if (!supabaseAnonKey) {
    return { ok: false, error: 'Missing Supabase anon key.' };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData.session?.access_token;
  if (!token) {
    const refreshed = await supabase.auth.refreshSession();
    token = refreshed.data.session?.access_token;
  }
  if (!token) {
    return { ok: false, error: 'AUTH_REQUIRED' };
  }

  const invokeOnce = (accessToken: string) =>
    supabase.functions.invoke<{ ok?: boolean; error?: string }>('delete-account', {
      body: {},
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
    });

  let result = await invokeOnce(token);
  if (result.error && extractStatus(result.error) === 401) {
    const refreshed = await supabase.auth.refreshSession();
    const next = refreshed.data.session?.access_token;
    if (next) result = await invokeOnce(next);
  }

  if (result.error) {
    return { ok: false, error: await messageFromInvokeError(result.error, result.data) };
  }

  if (!result.data?.ok) {
    return { ok: false, error: result.data?.error ?? 'Konto konnte nicht gelöscht werden.' };
  }

  // Session is invalid after the auth user is gone — drop local tokens.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {
    /* ignore */
  });

  return { ok: true };
}
