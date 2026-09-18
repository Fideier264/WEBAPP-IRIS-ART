import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { createSessionFromUrl } from '@/lib/auth';
import { useT } from '@/lib/i18n';

type Status = 'working' | 'signedIn' | 'confirmed' | 'error';

/**
 * Email confirm / OAuth landing page.
 * Prefer HTTPS (`https://irisart.app/auth/callback`) so the link works on any device/browser.
 */
export default function AuthCallbackScreen() {
  const c = useAppColors();
  const t = useT();
  const [status, setStatus] = useState<Status>('working');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const url =
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? window.location.href
            : (await Linking.getInitialURL()) ?? '';
        if (!url) {
          if (!cancelled) setStatus('confirmed');
          return;
        }
        const kind = await createSessionFromUrl(url);
        if (cancelled) return;
        if (kind === 'recovery') {
          router.replace('/auth/reset-password');
          return;
        }
        if (kind === 'default' || kind === 'signup') {
          // Session may or may not exist; signup confirm without tokens still means email is verified.
          setStatus(kind === 'signup' ? 'confirmed' : 'signedIn');
          return;
        }
        setStatus('confirmed');
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={[...c.pageGradient]}
        start={{ x: 0.15, y: 0.05 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {status === 'working' ? (
          <View style={styles.center}>
            <ActivityIndicator color={c.tint} size="large" />
            <Text style={[styles.body, { color: c.pageMuted }]}>{t('account.authCallbackWorking')}</Text>
          </View>
        ) : null}

        {status === 'signedIn' || status === 'confirmed' ? (
          <View style={styles.center}>
            <Text style={[styles.title, { color: c.pageText }]}>{t('account.authCallbackTitle')}</Text>
            <Text style={[styles.body, { color: c.pageMuted }]}>
              {status === 'signedIn' ? t('account.authCallbackSignedIn') : t('account.authCallbackConfirmed')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/account')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={styles.primaryText}>
                {status === 'signedIn' ? t('account.openAccount') : t('account.signIn')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'error' ? (
          <View style={styles.center}>
            <Text style={[styles.title, { color: c.pageText }]}>{t('account.authCallbackErrorTitle')}</Text>
            <Text style={[styles.body, { color: c.pageMuted }]}>
              {errorMsg?.trim() || t('account.authCallbackErrorBody')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/account')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={styles.primaryText}>{t('account.signIn')}</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  center: { gap: 14, alignItems: 'stretch' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
