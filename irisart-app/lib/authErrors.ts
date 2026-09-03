import type { AuthError } from '@supabase/supabase-js';

type AuthMessageKey =
  | 'account.error.invalidCredentials'
  | 'account.error.emailNotConfirmed'
  | 'account.error.userAlreadyRegistered'
  | 'account.error.weakPassword'
  | 'account.error.invalidEmail'
  | 'account.error.rateLimit'
  | 'account.error.network'
  | 'account.error.googleCancelled'
  | 'account.error.appleCancelled'
  | 'account.error.passwordMismatch'
  | 'account.error.generic';

function codeOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as AuthError & { error_description?: string };
    if (typeof e.code === 'string' && e.code) return e.code;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.error_description === 'string') return e.error_description;
  }
  return '';
}

/** Maps Supabase auth errors to i18n keys for user-facing German/English messages. */
export function authErrorMessageKey(error: unknown): AuthMessageKey {
  const code = codeOf(error).toLowerCase();

  if (code.includes('invalid login credentials') || code === 'invalid_credentials') {
    return 'account.error.invalidCredentials';
  }
  if (code.includes('email not confirmed') || code === 'email_not_confirmed') {
    return 'account.error.emailNotConfirmed';
  }
  if (
    code.includes('user already registered') ||
    code === 'user_already_exists' ||
    code.includes('already been registered')
  ) {
    return 'account.error.userAlreadyRegistered';
  }
  if (code.includes('password') && (code.includes('weak') || code.includes('short'))) {
    return 'account.error.weakPassword';
  }
  if (code.includes('invalid email') || code === 'validation_failed') {
    return 'account.error.invalidEmail';
  }
  if (code.includes('rate limit') || code.includes('too many') || code === 'over_email_send_rate_limit') {
    return 'account.error.rateLimit';
  }
  if (code.includes('fetch') || code.includes('network')) {
    return 'account.error.network';
  }
  if (code.includes('cancel')) {
    if (code.includes('apple')) return 'account.error.appleCancelled';
    return 'account.error.googleCancelled';
  }

  return 'account.error.generic';
}

export type SignUpResult =
  | { kind: 'session' }
  | { kind: 'confirmEmail' };
