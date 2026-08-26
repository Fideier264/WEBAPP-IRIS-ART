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

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/lib/auth';
import { LOCALES, useLocale, type Locale } from '@/lib/i18n';

export default function AccountScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme ?? 'light'];
  const muted = scheme === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';
  const { user, loading, signInEmail, signUpEmail, signInGoogle, signOut } = useAuth();
  const { t, locale, setLocale } = useLocale();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const gradient = useMemo(
    () =>
      scheme === 'dark'
        ? (['rgba(124,92,255,0.22)', 'rgba(0,212,255,0.06)', 'rgba(5,6,10,0)'] as const)
        : (['rgba(91,92,255,0.12)', 'rgba(0,212,255,0.04)', 'rgba(247,248,255,0)'] as const),
    [scheme]
  );

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
          <Text style={[styles.hTitle, { color: c.text }]}>{t('account.title')}</Text>
          <View style={{ width: 72 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.language')}</Text>
            <Text style={[styles.body, { color: muted }]}>{t('account.languageHint')}</Text>
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

          {loading ? (
            <ActivityIndicator color={c.tint} />
          ) : user ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.signedIn')}</Text>
              <Text style={[styles.body, { color: muted }]}>{user.email ?? user.id}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => run(async () => signOut())}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed || busy ? 0.85 : 1 },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>{t('account.signOut')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{t('account.saveGalleryTitle')}</Text>
              <Text style={[styles.body, { color: muted }]}>{t('account.saveGalleryBody')}</Text>

              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={t('account.email')}
                placeholderTextColor={muted}
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
              />
              <TextInput
                secureTextEntry
                placeholder={t('account.password')}
                placeholderTextColor={muted}
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

          {busy ? <ActivityIndicator color={c.tint} style={{ marginTop: 12 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {info ? <Text style={[styles.info, { color: muted }]}>{info}</Text> : null}
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
  error: { color: '#FF6B7A', fontSize: 13.5, lineHeight: 19 },
  info: { fontSize: 13.5, lineHeight: 19 },
});
