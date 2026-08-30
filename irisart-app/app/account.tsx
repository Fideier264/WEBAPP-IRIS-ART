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
import { BACKGROUND_THEMES, useAppColors, useAppTheme } from '@/lib/appTheme';
import { useAuth } from '@/lib/auth';
import { requestDeleteOwnAccount } from '@/lib/deleteAccount';
import { LOCALES, useLocale, type Locale } from '@/lib/i18n';

export default function AccountScreen() {
  const c = useAppColors();
  const { backgroundTheme, setBackgroundTheme } = useAppTheme();
  const { user, loading, signInEmail, signUpEmail, signInGoogle, signOut } = useAuth();
  const { t, locale, setLocale } = useLocale();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const gradient = useMemo(() => c.pageGradient, [c.pageGradient]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.errorGeneric'));
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
                        setInfo(t('account.deletedInfo'));
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
                    setError(null);
                    setInfo(null);
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

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await signInEmail(email, password);
                    setInfo(t('account.signedInInfo'));
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
                    await signUpEmail(email, password);
                    setInfo(t('account.createdInfo'));
                  })
                }
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed || busy ? 0.85 : 1 },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.createAccount')}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => run(async () => signInGoogle())}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed || busy ? 0.85 : 1 },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.continueGoogle')}</Text>
              </Pressable>
            </View>
          )}

          <LegalDisclaimer variant="account" />

          {busy ? <ActivityIndicator color={c.tint} style={{ marginTop: 12 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={[styles.info, { color: c.pageMuted }]}>{info}</Text> : null}
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
  error: { color: '#FF6B7A', fontSize: 13.5, lineHeight: 19 },
  info: { fontSize: 13.5, lineHeight: 19 },
});
