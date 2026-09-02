import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { Session, User } from '@supabase/supabase-js';

import type { SignUpResult } from './authErrors';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  recoveryMode: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<SignUpResult>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  clearRecoveryMode: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthRedirectTo(path = 'auth/callback') {
  return Linking.createURL(path);
}

async function createSessionFromUrl(url: string): Promise<'recovery' | 'default' | null> {
  const parsed = Linking.parse(url);
  const query = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;
  const hash = url.includes('#') ? url.split('#')[1] : '';
  const hashParams = new URLSearchParams(hash);

  const type =
    (typeof query.type === 'string' ? query.type : undefined) ??
    hashParams.get('type') ??
    undefined;

  const access_token =
    (typeof query.access_token === 'string' ? query.access_token : undefined) ??
    hashParams.get('access_token') ??
    undefined;
  const refresh_token =
    (typeof query.refresh_token === 'string' ? query.refresh_token : undefined) ??
    hashParams.get('refresh_token') ??
    undefined;
  const code =
    (typeof query.code === 'string' ? query.code : undefined) ?? hashParams.get('code') ?? undefined;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return type === 'recovery' ? 'recovery' : 'default';
  }

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return type === 'recovery' ? 'recovery' : 'default';
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        router.push('/auth/reset-password');
      }
    });

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void createSessionFromUrl(url)
        .then((kind) => {
          if (kind === 'recovery') {
            setRecoveryMode(true);
            router.push('/auth/reset-password');
          }
        })
        .catch(() => {
          /* ignore malformed deep links */
        });
    });

    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      void createSessionFromUrl(url).then((kind) => {
        if (kind === 'recovery') {
          setRecoveryMode(true);
          router.push('/auth/reset-password');
        }
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: getAuthRedirectTo('auth/callback'),
      },
    });
    if (error) throw error;
    if (data.session) return { kind: 'session' };
    return { kind: 'confirmEmail' };
  }, []);

  const signInGoogle = useCallback(async () => {
    const redirectTo = getAuthRedirectTo('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data.url) throw new Error('Google sign-in URL missing.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !('url' in result) || !result.url) {
      throw new Error('Google sign-in was cancelled.');
    }
    await createSessionFromUrl(result.url);
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getAuthRedirectTo('auth/reset-password'),
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const clearRecoveryMode = useCallback(() => {
    setRecoveryMode(false);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setRecoveryMode(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recoveryMode,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      resetPasswordForEmail,
      updatePassword,
      clearRecoveryMode,
    }),
    [
      session,
      loading,
      recoveryMode,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      resetPasswordForEmail,
      updatePassword,
      clearRecoveryMode,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
