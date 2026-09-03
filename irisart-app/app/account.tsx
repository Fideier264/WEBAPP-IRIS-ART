import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import { SocialSignInButtons } from '@/components/SocialSignInButtons';
import { BACKGROUND_THEMES, useAppColors, useAppTheme } from '@/lib/appTheme';
import { useAuth } from '@/lib/auth';
import { authErrorMessageKey } from '@/lib/authErrors';
import { requestDeleteOwnAccount } from '@/lib/deleteAccount';
import { LOCALES, useLocale, type Locale } from '@/lib/i18n';

type AuthMode = 'login' | 'forgot';

function AuthBanner({ message, tone }: { message: string; tone: 'error' | 'info' | 'success' }) {
  const styles =
    tone === 'error'
      ? { bg: 'rgba(255,107,122,0.12)', border: 'rgba(255,107,122,0.45)', text: '#FF6B7A' }
      : tone === 'success'
        ? { bg: 'rgba(52,199,89,0.1)', border: 'rgba(52,199,89,0.35)', text: '#2E7D32' }
        : { bg: 'rgba(124,92,255,0.1)', border: 'rgba(124,92,255,0.28)', text: '#5B45C9' };

  return (
    <View style={[bannerStyles.root, { backgroundColor: styles.bg, borderColor: styles.border }]}>
      <Text style={[bannerStyles.text, { color: styles.text }]}>{message}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  root: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  text: { fontSize: 14, lineHeight: 20, fontWeight: '650' },
});

export default function AccountScreen() {
  const c = useAppColors();
  const { backgroundTheme, setBackgroundTheme } = useAppTheme();
  const {
    user,
    loading,
    signInEmail,
    signUpEmail,
    signInGoogle,
    signInApple,
    signOut,
    resetPasswordForEmail,
  } = useAuth();
  const { t, locale, setLocale } = useLocale();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const gradient = useMemo(() => c.pageGradient, [c.pageGradient]);

  const clearMessages = () => {
    setErrorKey(null);
    setInfoKey(null);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    clearMessages();
    try {
      await fn();
    } catch (e) {
      setErrorKey(authErrorMessageKey(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient colors={[...gradient]} start={{ x: 0.15, y: 0.05 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: c.border, backgroundColor: c.surface },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={[styles.chipText, { color: c.text }]}>{t('common.back')}</Text>
          </Pressable>
          <Text style={[styles.hTitle, { color: c.pageText }]}>{t('account.title')}</Text>
          <View style={{ width: 72 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.language')}</Text>
            <Text style={[styles.body, { color: c.muted }]}>{t('account.languageHint')}</Text>
            <View style={styles.langRow}>
              {LOCALES.map((opt) => {
                const active = locale === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setLocale(opt.id as Locale)}
                    style={({ pressed }) => [
                      styles.langChip,
                      {
                        borderColor: active ? c.tint : c.border,
                        backgroundColor: active ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}>
                    <Text style={[styles.langChipText, { color: c.text }]}>
                      {opt.id === 'de' ? t('account.lang.de') : t('account.lang.en')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.background')}</Text>
            <Text style={[styles.body, { color: c.muted }]}>{t('account.backgroundHint')}</Text>
            <View style={styles.langRow}>
              {BACKGROUND_THEMES.map((opt) => {
                const active = backgroundTheme === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setBackgroundTheme(opt.id)}
                    style={({ pressed }) => [
                      styles.langChip,
                      {
                        borderColor: active ? c.tint : c.border,
                        backgroundColor: active ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}>
                    <Text style={[styles.langChipText, { color: c.text }]}>{t(opt.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={c.tint} />
          ) : user ? (
            <>
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.signedIn')}</Text>
                <Text style={[styles.body, { color: c.muted }]}>{user.email ?? user.id}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() =>
                    run(async () => {
                      setConfirmDelete(false);
                      await signOut();
                    })
                  }
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed || busy ? 0.85 : 1 },
                  ]}>
                  <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.signOut')}</Text>
                </Pressable>
              </View>

              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: c.surface,
                    borderColor: confirmDelete ? 'rgba(220,80,80,0.45)' : c.border,
                  },
                ]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.deleteTitle')}</Text>
                <Text style={[styles.body, { color: c.muted }]}>
                  {confirmDelete ? t('account.deleteConfirmBody') : t('account.deleteBody')}
                </Text>
                {confirmDelete ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() =>
                        run(async () => {
                          const res = await requestDeleteOwnAccount();
                          if (!res.ok) {
                            throw new Error(
                              res.error === 'AUTH_REQUIRED' ? t('account.deleteFailed') : res.error
                            );
                          }
                          setConfirmDelete(false);
                          setInfoKey('account.deletedInfo');
                          router.replace('/');
                        })
                      }
                      style={({ pressed }) => [
                        styles.dangerBtn,
                        { opacity: pressed || busy ? 0.88 : 1 },
                      ]}>
                      <Text style={styles.dangerText}>
                        {busy ? t('account.deleteBusy') : t('account.deleteConfirmCta')}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setConfirmDelete(false)}
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed || busy ? 0.85 : 1 },
                      ]}>
                      <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.deleteCancel')}</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      clearMessages();
                      setConfirmDelete(true);
                    }}
                    style={({ pressed }) => [
                      styles.dangerOutlineBtn,
                      { borderColor: 'rgba(220,80,80,0.55)', opacity: pressed || busy ? 0.85 : 1 },
                    ]}>
                    <Text style={styles.dangerOutlineText}>{t('account.deleteCta')}</Text>
                  </Pressable>
                )}
              </View>
            </>
          ) : authMode === 'forgot' ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.forgotPasswordTitle')}</Text>
              <Text style={[styles.body, { color: c.muted }]}>{t('account.forgotPasswordBody')}</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('account.email')}
                placeholderTextColor={c.muted}
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
              />
              {errorKey ? <AuthBanner message={t(errorKey)} tone="error" /> : null}
              {infoKey ? <AuthBanner message={t(infoKey)} tone="info" /> : null}
              <Pressable
                accessibilityRole="button"
                disabled={busy || !email.trim()}
                onPress={() =>
                  run(async () => {
                    await resetPasswordForEmail(email);
                    setInfoKey('account.forgotPasswordSent');
                  })
                }
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed || busy || !email.trim() ? 0.9 : 1 },
                ]}>
                <Text style={styles.primaryText}>{t('account.forgotPasswordCta')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAuthMode('login');
                  clearMessages();
                }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.85 : 1 },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.signIn')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.saveGalleryTitle')}</Text>
              <Text style={[styles.body, { color: c.muted }]}>{t('account.saveGalleryBody')}</Text>

              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('account.email')}
                placeholderTextColor={c.muted}
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
              />
              <TextInput
                secureTextEntry
                placeholder={t('account.password')}
                placeholderTextColor={c.muted}
                value={password}
                onChangeText={setPassword}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
              />

              {errorKey ? <AuthBanner message={t(errorKey)} tone="error" /> : null}
              {infoKey ? (
                <AuthBanner
                  message={t(infoKey)}
                  tone={infoKey === 'account.signedInInfo' ? 'success' : 'info'}
                />
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await signInEmail(email, password);
                    setInfoKey('account.signedInInfo');
                  })
                }
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed || busy ? 0.9 : 1 },
                ]}>
                <Text style={styles.primaryText}>{t('account.signIn')}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    const result = await signUpEmail(email, password);
                    setInfoKey(
                      result.kind === 'confirmEmail'
                        ? 'account.confirmEmailSent'
                        : 'account.signedInInfo'
                    );
                  })
                }
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed || busy ? 0.85 : 1 },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.createAccount')}</Text>
              </Pressable>

              <SocialSignInButtons
                disabled={busy}
                onApple={() =>
                  run(async () => {
                    await signInApple();
                    setInfoKey('account.signedInInfo');
                  })
                }
                onGoogle={() =>
                  run(async () => {
                    await signInGoogle();
                    setInfoKey('account.signedInInfo');
                  })
                }
              />

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  clearMessages();
                  setAuthMode('forgot');
                }}
                style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.75 }]}>
                <Text style={[styles.linkText, { color: c.tint }]}>{t('account.forgotPassword')}</Text>
              </Pressable>
            </View>
          )}

          <LegalDisclaimer variant="account" />

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.legalTitle')}</Text>
            <Text style={[styles.body, { color: c.muted }]}>{t('account.legalBody')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/privacy')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.privacy')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/terms')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.terms')}</Text>
            </Pressable>
          </View>

          {busy ? <ActivityIndicator color={c.tint} style={{ marginTop: 12 }} /> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 72,
    alignItems: 'center',
  },
  chipText: { fontSize: 13.5, fontWeight: '650' },
  hTitle: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  scroll: { gap: 12, paddingBottom: 40 },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '850' },
  body: { fontSize: 13.5, lineHeight: 19 },
  langRow: { flexDirection: 'row', gap: 10 },
  langChip: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    alignItems: 'center',
  },
  langChipText: { fontSize: 14.5, fontWeight: '800' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '850' },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 15, fontWeight: '750' },
  linkBtn: { alignItems: 'center', paddingVertical: 4 },
  linkText: { fontSize: 14, fontWeight: '750' },
  dangerOutlineBtn: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(220,80,80,0.08)',
  },
  dangerOutlineText: { fontSize: 15, fontWeight: '800', color: '#C43A4A' },
  dangerBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#C43A4A',
  },
  dangerText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '850' },
});
