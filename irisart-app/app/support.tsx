import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { ACCOUNT_HEADER_CLEARANCE } from '@/constants/Layout';
import { getLegalOperator } from '@/lib/legalOperator';
import { useT } from '@/lib/i18n';

export default function SupportScreen() {
  const c = useAppColors();
  const t = useT();
  const op = getLegalOperator();
  const mailHref = `mailto:${op.contactEmail}?subject=${encodeURIComponent('IrisArt Support')}`;

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
          <Text style={[styles.hTitle, { color: c.pageText }]} numberOfLines={1}>
            {t('support.title')}
          </Text>
          <View style={{ width: ACCOUNT_HEADER_CLEARANCE }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.heading, { color: c.text }]}>{t('support.heading')}</Text>
            <Text style={[styles.body, { color: c.muted }]}>{t('support.body')}</Text>

            <Text style={[styles.label, { color: c.text }]}>{t('support.emailLabel')}</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(mailHref)}
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
              <Text style={[styles.email, { color: c.tint }]}>{op.contactEmail}</Text>
            </Pressable>

            <Text style={[styles.label, { color: c.text }]}>{t('support.operatorLabel')}</Text>
            <Text style={[styles.body, { color: c.muted }]}>{op.operatorName}</Text>
            <Text style={[styles.body, { color: c.muted }]}>{op.addressLine}</Text>

            <Pressable
              accessibilityRole="button"
              onPress={() => void Linking.openURL(mailHref)}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={styles.primaryText}>{t('support.emailCta')}</Text>
            </Pressable>

            <View style={styles.links}>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/privacy')}
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
                <Text style={[styles.link, { color: c.tint }]}>{t('account.privacy')}</Text>
              </Pressable>
              <Text style={{ color: c.muted }}>·</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/terms')}
                style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}>
                <Text style={[styles.link, { color: c.tint }]}>{t('account.terms')}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 10 },
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
    gap: 10,
  },
  heading: { fontSize: 18, fontWeight: '850' },
  body: { fontSize: 14, lineHeight: 21 },
  label: { marginTop: 8, fontSize: 13, fontWeight: '800' },
  email: { fontSize: 16, fontWeight: '750' },
  primaryBtn: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  links: { marginTop: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  link: { fontSize: 14, fontWeight: '700' },
});
