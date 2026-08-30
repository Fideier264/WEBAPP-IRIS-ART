import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { ACCOUNT_HEADER_CLEARANCE } from '@/constants/Layout';
import type { LegalDocument } from '@/lib/legalDocuments';
import { useLocale } from '@/lib/i18n';

export function LegalDocumentScreen({
  document,
  backLabel,
}: {
  document: LegalDocument;
  backLabel: string;
}) {
  const c = useAppColors();
  const { locale } = useLocale();
  const doc = useMemo(() => document, [document, locale]);

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
            <Text style={[styles.chipText, { color: c.text }]}>{backLabel}</Text>
          </Pressable>
          <Text style={[styles.hTitle, { color: c.pageText }]} numberOfLines={2}>
            {doc.title}
          </Text>
          <View style={{ width: ACCOUNT_HEADER_CLEARANCE }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.intro, { color: c.muted }]}>{doc.intro}</Text>
            {doc.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={[styles.heading, { color: c.text }]}>{section.heading}</Text>
                {section.paragraphs.map((p, i) => (
                  <Text key={`${section.heading}-${i}`} style={[styles.para, { color: c.muted }]}>
                    {p}
                  </Text>
                ))}
              </View>
            ))}
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
  hTitle: { flex: 1, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  scroll: { gap: 12, paddingBottom: 40 },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 18,
  },
  intro: { fontSize: 13.5, lineHeight: 20 },
  section: { gap: 8 },
  heading: { fontSize: 14.5, fontWeight: '850' },
  para: { fontSize: 13, lineHeight: 19 },
});
