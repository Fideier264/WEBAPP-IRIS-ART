import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { AppBottomBar } from '@/components/AppBottomBar';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import { BOTTOM_BAR_CLEARANCE } from '@/constants/Layout';
import { useT } from '@/lib/i18n';

export default function OnboardingScreen() {
  const c = useAppColors();
  const t = useT();

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={[...c.pageGradient]}
        start={{ x: 0.1, y: 0.05 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={[styles.brand, { color: c.pageText }]}>IrisArt</Text>
          <Text style={[styles.tagline, { color: c.pageText }]}>{t('home.tagline')}</Text>
          <Text style={[styles.sub, { color: c.pageMuted }]}>
            {t('home.sub')}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row title={t('home.tip1Title')} body={t('home.tip1Body')} darkPage={c.isDarkPage} />
          <Row title={t('home.tip2Title')} body={t('home.tip2Body')} darkPage={c.isDarkPage} />
          <Row title={t('home.tip3Title')} body={t('home.tip3Body')} darkPage={c.isDarkPage} />
        </View>

        <View style={styles.disclaimerWrap}>
          <LegalDisclaimer variant="home" />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/capture')}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: c.tint,
              opacity: pressed ? 0.88 : 1,
            },
          ]}>
          <Text style={styles.ctaText}>{t('home.cta')}</Text>
        </Pressable>

        <Text style={[styles.foot, { color: c.pageMuted }]}>
          {t('home.foot')}
        </Text>
        </ScrollView>
        <AppBottomBar active="scan" />
      </SafeAreaView>
    </View>
  );
}

function Row({
  title,
  body,
  darkPage,
}: {
  title: string;
  body: string;
  darkPage: boolean;
}) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor: darkPage ? 'rgba(124,92,255,0.18)' : 'rgba(91,92,255,0.16)',
            borderColor: darkPage ? 'rgba(124,92,255,0.45)' : 'rgba(91,92,255,0.40)',
          },
        ]}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: '#0A0B10' }]}>
          {title}
        </Text>
        <Text style={[styles.rowBody, { color: 'rgba(10,11,16,0.68)' }]}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: BOTTOM_BAR_CLEARANCE, gap: 0 },
  hero: { gap: 10, paddingTop: 14, paddingRight: 88 },
  brand: { fontSize: 44, fontWeight: '700', letterSpacing: 0.2 },
  tagline: { fontSize: 18, fontWeight: '600', letterSpacing: 0.25 },
  sub: { fontSize: 14.5, lineHeight: 21, marginTop: 6 },
  card: {
    marginTop: 22,
    padding: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  disclaimerWrap: { marginTop: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, borderWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14.5, fontWeight: '750' },
  rowBody: { fontSize: 13, lineHeight: 18 },
  cta: {
    marginTop: 18,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16.5, fontWeight: '850' },
  foot: { marginTop: 14, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
});
