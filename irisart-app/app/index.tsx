import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { AppBottomBar } from '@/components/AppBottomBar';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import { BOTTOM_BAR_CLEARANCE } from '@/constants/Layout';
import { useT } from '@/lib/i18n';

export default function OnboardingScreen() {
  const c = useAppColors();
  const t = useT();
  const { height: windowH } = useWindowDimensions();
  const compact = windowH < 760;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={[...c.pageGradient]}
        start={{ x: 0.1, y: 0.05 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.content, { paddingBottom: BOTTOM_BAR_CLEARANCE }]}>
          <View style={[styles.hero, compact && styles.heroCompact]}>
            <Text style={[styles.brand, compact && styles.brandCompact, { color: c.pageText }]}>
              IrisArt
            </Text>
            <Text style={[styles.tagline, compact && styles.taglineCompact, { color: c.pageText }]}>
              {t('home.tagline')}
            </Text>
            <Text
              style={[styles.sub, compact && styles.subCompact, { color: c.pageMuted }]}
              numberOfLines={compact ? 3 : 4}>
              {t('home.sub')}
            </Text>
          </View>

          <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Row title={t('home.tip1Title')} body={t('home.tip1Body')} compact={compact} darkPage={c.isDarkPage} />
            <Row title={t('home.tip2Title')} body={t('home.tip2Body')} compact={compact} darkPage={c.isDarkPage} />
            <Row title={t('home.tip3Title')} body={t('home.tip3Body')} compact={compact} darkPage={c.isDarkPage} />
          </View>

          <LegalDisclaimer variant="home" compact />

          <View style={styles.footer}>
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

            <Text style={[styles.foot, compact && styles.footCompact, { color: c.pageMuted }]}>
              {t('home.foot')}
            </Text>
            <View style={styles.legalRow}>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/privacy')}
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
                <Text style={[styles.legalLink, { color: c.pageMuted }]}>{t('home.legalPrivacy')}</Text>
              </Pressable>
              <Text style={[styles.legalSep, { color: c.pageMuted }]}>·</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/terms')}
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
                <Text style={[styles.legalLink, { color: c.pageMuted }]}>{t('home.legalTerms')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <AppBottomBar active="scan" />
      </SafeAreaView>
    </View>
  );
}

function Row({
  title,
  body,
  compact,
  darkPage,
}: {
  title: string;
  body: string;
  compact?: boolean;
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
        <Text style={[styles.rowTitle, compact && styles.rowTitleCompact, { color: '#0A0B10' }]}>
          {title}
        </Text>
        <Text
          style={[styles.rowBody, compact && styles.rowBodyCompact, { color: 'rgba(10,11,16,0.68)' }]}
          numberOfLines={2}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
  },
  hero: { gap: 8, paddingTop: 6, paddingRight: 88 },
  heroCompact: { gap: 5, paddingTop: 2 },
  brand: { fontSize: 40, fontWeight: '700', letterSpacing: 0.2 },
  brandCompact: { fontSize: 34 },
  tagline: { fontSize: 17, fontWeight: '600', letterSpacing: 0.2 },
  taglineCompact: { fontSize: 15.5 },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  subCompact: { fontSize: 13, lineHeight: 18 },
  card: {
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  cardCompact: { padding: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 3, borderWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '750' },
  rowTitleCompact: { fontSize: 13.5 },
  rowBody: { fontSize: 12.5, lineHeight: 17 },
  rowBodyCompact: { fontSize: 12, lineHeight: 16 },
  footer: { gap: 8, paddingTop: 2 },
  cta: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '850' },
  foot: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  footCompact: { fontSize: 11.5, lineHeight: 15 },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  legalLink: { fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  legalSep: { fontSize: 12 },
});
