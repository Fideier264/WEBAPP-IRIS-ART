import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { AppBottomBar } from '@/components/AppBottomBar';

export default function OnboardingScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={
          scheme === 'dark'
            ? ['rgba(124,92,255,0.30)', 'rgba(0,212,255,0.10)', 'rgba(5,6,10,0)']
            : ['rgba(91,92,255,0.18)', 'rgba(0,212,255,0.06)', 'rgba(247,248,255,0)']
        }
        start={{ x: 0.1, y: 0.05 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.hero}>
          <Text style={[styles.brand, { color: c.text }]}>IrisArt</Text>
          <Text style={[styles.tagline, { color: c.text }]}>Science of Your Eye</Text>
          <Text style={[styles.sub, { color: scheme === 'dark' ? 'rgba(243,245,255,0.72)' : 'rgba(10,11,16,0.70)' }]}>
            Capture a macro iris photo. We’ll extract dominant colors and generate a rarity profile—then transform your
            iris into premium digital art.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row title="Macro capture guide" body="Align your iris inside the ring for best color accuracy." scheme={scheme} />
          <Row
            title="Color profile"
            body="Primary + secondary HEX palette from the iris core (mocked in Phase 2)."
            scheme={scheme}
          />
          <Row title="Artwork → Canvas" body="Preview styles, then order a physical print (Phase 4)." scheme={scheme} />
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
          <Text style={styles.ctaText}>Begin Iris Scan</Text>
        </Pressable>

        <Text
          style={[
            styles.foot,
            { color: scheme === 'dark' ? 'rgba(243,245,255,0.46)' : 'rgba(10,11,16,0.46)' },
          ]}>
          Tip: For best lighting, use the rear camera + flashlight and a mirror.
        </Text>
        <AppBottomBar active="scan" />
      </SafeAreaView>
    </View>
  );
}

function Row({
  title,
  body,
  scheme,
}: {
  title: string;
  body: string;
  scheme: 'light' | 'dark';
}) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.dot,
          {
            backgroundColor:
              scheme === 'dark' ? 'rgba(124,92,255,0.18)' : 'rgba(91,92,255,0.16)',
            borderColor: scheme === 'dark' ? 'rgba(124,92,255,0.45)' : 'rgba(91,92,255,0.40)',
          },
        ]}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: scheme === 'dark' ? 'rgba(243,245,255,0.95)' : 'rgba(10,11,16,0.92)' }]}>
          {title}
        </Text>
        <Text style={[styles.rowBody, { color: scheme === 'dark' ? 'rgba(243,245,255,0.70)' : 'rgba(10,11,16,0.68)' }]}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14 },
  hero: { gap: 10, paddingTop: 14 },
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
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 999, marginTop: 6, borderWidth: 1 },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14.5, fontWeight: '650' },
  rowBody: { fontSize: 13.5, lineHeight: 19 },
  cta: {
    marginTop: 'auto',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  foot: { marginTop: 12, fontSize: 12.5, textAlign: 'center' },
});

