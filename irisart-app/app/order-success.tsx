import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { ACCOUNT_HEADER_CLEARANCE } from '@/constants/Layout';
import { useT } from '@/lib/i18n';

export default function OrderSuccessScreen() {
  const c = useAppColors();
  const muted = c.pageMuted;
  const params = useLocalSearchParams<{ session_id?: string }>();
  const sessionId = typeof params.session_id === 'string' ? params.session_id : undefined;
  const t = useT();

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={[...c.pageGradient]}
        start={{ x: 0.15, y: 0.05 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={{ width: 72 }} />
          <Text style={[styles.hTitle, { color: c.pageText }]}>{t('orderSuccess.title')}</Text>
          <View style={{ width: ACCOUNT_HEADER_CLEARANCE }} />
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{t('orderSuccess.heading')}</Text>
          <Text style={[styles.body, { color: muted }]}>{t('orderSuccess.body')}</Text>
          {sessionId ? (
            <Text style={[styles.meta, { color: muted }]}>{t('orderSuccess.session', { id: sessionId })}</Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/library')}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
          ]}>
          <Text style={styles.primaryText}>{t('orderSuccess.toGallery')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.9 : 1 },
          ]}>
          <Text style={[styles.secondaryText, { color: c.text }]}>{t('orderSuccess.newScan')}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  hTitle: { flex: 1, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '850' },
  body: { fontSize: 14.5, lineHeight: 21 },
  meta: { fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  primaryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15.5, fontWeight: '850' },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 15, fontWeight: '750' },
});
