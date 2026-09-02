import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { useAuth } from '@/lib/auth';
import { authErrorMessageKey } from '@/lib/authErrors';
import { useT } from '@/lib/i18n';

export default function ResetPasswordScreen() {
  const c = useAppColors();
  const { updatePassword, clearRecoveryMode } = useAuth();
  const { t } = useT();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setErrorKey(null);
    if (password.length < 6) {
      setErrorKey('account.error.weakPassword');
      return;
    }
    if (password !== password2) {
      setErrorKey('account.error.passwordMismatch');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      clearRecoveryMode();
      setDone(true);
    } catch (e) {
      setErrorKey(authErrorMessageKey(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={[...c.pageGradient]}
        start={{ x: 0.15, y: 0.05 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: c.pageText }]}>{t('account.resetPasswordTitle')}</Text>
          <Text style={[styles.body, { color: c.pageMuted }]}>{t('account.resetPasswordBody')}</Text>

          {done ? (
            <>
              <View style={[styles.banner, styles.bannerOk, { borderColor: 'rgba(52,199,89,0.35)' }]}>
                <Text style={[styles.bannerText, { color: '#2E7D32' }]}>{t('account.resetPasswordDone')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/account')}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
                ]}>
                <Text style={styles.primaryText}>{t('account.signIn')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                secureTextEntry
                placeholder={t('account.newPassword')}
                placeholderTextColor={c.muted}
                value={password}
                onChangeText={setPassword}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
              />
              <TextInput
                secureTextEntry
                placeholder={t('account.newPasswordConfirm')}
                placeholderTextColor={c.muted}
                value={password2}
                onChangeText={setPassword2}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.surfaceAlt }]}
              />
              {errorKey ? (
                <View style={[styles.banner, styles.bannerErr]}>
                  <Text style={styles.bannerText}>{t(errorKey)}</Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void submit()}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed || busy ? 0.9 : 1 },
                ]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{t('account.resetPasswordCta')}</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18 },
  scroll: { gap: 14, paddingVertical: 24 },
  title: { fontSize: 22, fontWeight: '800' },
  body: { fontSize: 14.5, lineHeight: 21 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '850' },
  banner: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  bannerErr: {
    backgroundColor: 'rgba(255,107,122,0.12)',
    borderColor: 'rgba(255,107,122,0.45)',
  },
  bannerOk: {
    backgroundColor: 'rgba(52,199,89,0.1)',
  },
  bannerText: { color: '#FF6B7A', fontSize: 14, lineHeight: 20, fontWeight: '650' },
});
