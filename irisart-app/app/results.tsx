import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { AppBottomBar } from '@/components/AppBottomBar';
import Colors from '@/constants/Colors';
import { analyzeIris, peekIrisAnalysisCache, type IrisAnalysis } from '@/lib/analyzeIris';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; result: IrisAnalysis }
  | { kind: 'error'; message: string };

export default function ResultsScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const params = useLocalSearchParams<{ uri?: string; sourceUri?: string }>();

  const uri = typeof params.uri === 'string' ? params.uri : undefined;
  const sourceUri = typeof params.sourceUri === 'string' ? params.sourceUri : undefined;
  const analysisUri = sourceUri ?? uri;
  const [status, setStatus] = useState<Status>(() => {
    if (!analysisUri) return { kind: 'error', message: 'Missing photo.' };
    const cached = peekIrisAnalysisCache(analysisUri);
    if (cached) return { kind: 'ready', result: cached };
    return { kind: 'loading' };
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!analysisUri) {
        setStatus({ kind: 'error', message: 'Missing photo.' });
        return;
      }
      const cached = peekIrisAnalysisCache(analysisUri);
      if (cached) {
        setStatus({ kind: 'ready', result: cached });
        return;
      }
      try {
        setStatus({ kind: 'loading' });
        const result = await analyzeIris(analysisUri);
        if (cancelled) return;
        setStatus({ kind: 'ready', result });
      } catch (e) {
        if (cancelled) return;
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Analysis failed.' });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [analysisUri]);

  const title = useMemo(() => {
    if (status.kind !== 'ready') return 'Analyse';
    return 'Seltenheit & Farbprofil';
  }, [status.kind]);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={
          scheme === 'dark'
            ? ['rgba(124,92,255,0.26)', 'rgba(0,212,255,0.08)', 'rgba(5,6,10,0)']
            : ['rgba(91,92,255,0.16)', 'rgba(0,212,255,0.05)', 'rgba(247,248,255,0)']
        }
        start={{ x: 0.15, y: 0.05 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: c.border, backgroundColor: c.surface },
                pressed && { opacity: 0.85 },
              ]}>
              <Text style={[styles.chipText, { color: c.text }]}>Back</Text>
            </Pressable>
            <Text style={[styles.hTitle, { color: c.text }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={{ width: 56 }} />
          </View>

          {uri ? (
            <View style={[styles.previewCard, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
            </View>
          ) : null}

          {status.kind === 'loading' ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <ActivityIndicator color={c.tint} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: c.text }]}>Iris wird analysiert</Text>
                  <Text
                    style={[
                      styles.cardBody,
                      { color: scheme === 'dark' ? 'rgba(243,245,255,0.68)' : 'rgba(10,11,16,0.66)' },
                    ]}>
                    Wir analysieren dein Iris-Bild (einmal pro Bild; bei erneutem Öffnen aus Cache)…
                  </Text>
                </View>
              </View>
            </View>
          ) : status.kind === 'error' ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Analysis failed</Text>
              <Text
                style={[
                  styles.cardBody,
                  { color: scheme === 'dark' ? 'rgba(243,245,255,0.68)' : 'rgba(10,11,16,0.66)' },
                ]}>
                {status.message}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/capture')}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1, marginTop: 14 },
                ]}>
                <Text style={styles.primaryText}>Retake Photo</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>Auswertung (Gemini)</Text>
                <AnalysisBlock
                  title="Seltenheit der Grundfarbe"
                  body={status.result.gemini.baseColorRaritySentence}
                  percent={status.result.gemini.baseColorRarityPercent}
                  scheme={scheme}
                />
                <AnalysisBlock
                  title="Besonderheiten"
                  body={status.result.gemini.specialFeaturesSentence}
                  scheme={scheme}
                />
                <AnalysisBlock
                  title="Kombinierte Seltenheit"
                  body={`${status.result.gemini.combinedRaritySentences[0]} ${status.result.gemini.combinedRaritySentences[1]}`}
                  percent={status.result.gemini.combinedRarityPercent}
                  scheme={scheme}
                />
                <AnalysisBlock
                  title=""
                  body={status.result.gemini.uniqueStructureNote ?? 'Jede Iris weist einzigartige Strukturen auf.'}
                  scheme={scheme}
                  standalone
                />
                <AnalysisBlock
                  title="Wahrscheinlichkeit der Vererbung"
                  body={status.result.gemini.inheritanceSentence}
                  percent={status.result.gemini.inheritancePercent}
                  scheme={scheme}
                />

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/')}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.92 : 1 },
                  ]}>
                  <Text style={[styles.secondaryText, { color: c.text }]}>Analyze Another Eye</Text>
                </Pressable>
              </View>

              <View style={[styles.card, styles.paletteCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>Iris-Farbpalette</Text>
                <View style={styles.paletteGrid}>
                  {status.result.palette.map((p, idx) => (
                    <Swatch
                      key={`${p.hex}-${idx}`}
                      label={idx === 0 ? '1' : idx === 1 ? '2' : `${idx + 1}`}
                      hex={p.hex}
                      scheme={scheme}
                      compact
                    />
                  ))}
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  router.push({ pathname: '/shop', params: { textureUri: uri, sourceUri: analysisUri } });
                }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
                ]}>
                <Text style={styles.primaryText}>Zur Art Gallery</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
        <AppBottomBar active="shop" shopTextureUri={uri} />
      </SafeAreaView>
    </View>
  );
}

function AnalysisBlock({
  title,
  body,
  percent,
  scheme,
  standalone,
}: {
  title: string;
  body: string;
  percent?: string;
  scheme: 'light' | 'dark';
  standalone?: boolean;
}) {
  const muted = scheme === 'dark' ? 'rgba(243,245,255,0.55)' : 'rgba(10,11,16,0.52)';
  const textCol = scheme === 'dark' ? 'rgba(243,245,255,0.82)' : 'rgba(10,11,16,0.78)';
  const italicCol = scheme === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.60)';
  return (
    <View style={{ gap: 4 }}>
      {title ? <Text style={[styles.analysisTitle, { color: muted }]}>{title}</Text> : null}
      <Text style={[styles.rarity, { color: standalone ? italicCol : textCol, fontStyle: standalone ? 'italic' : 'normal' }]}>
        {body}
        {percent ? <Text style={{ color: muted }}>{` (${percent})`}</Text> : null}
      </Text>
    </View>
  );
}

function Swatch({ label, hex, scheme, compact }: { label: string; hex: string; scheme: 'light' | 'dark'; compact?: boolean }) {
  const border = scheme === 'dark' ? 'rgba(243,245,255,0.14)' : 'rgba(10,11,16,0.14)';
  return (
    <View style={compact ? styles.swatchCompact : styles.swatch}>
      <View style={[compact ? styles.colorCompact : styles.color, { backgroundColor: hex, borderColor: border }]} />
      <Text style={[compact ? styles.swatchLabelCompact : styles.swatchLabel, { color: scheme === 'dark' ? 'rgba(243,245,255,0.72)' : 'rgba(10,11,16,0.70)' }]}>
        {label}
      </Text>
      <Text style={[compact ? styles.hexCompact : styles.hex, { color: scheme === 'dark' ? 'rgba(243,245,255,0.92)' : 'rgba(10,11,16,0.92)' }]}>{hex}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 14 },
  scrollContent: { gap: 14, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    width: 56,
    alignItems: 'center',
  },
  chipText: { fontSize: 13.5, fontWeight: '650' },
  hTitle: { flex: 1, fontSize: 14.5, fontWeight: '750', textAlign: 'center' },

  previewCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    height: 180,
  },
  preview: { ...StyleSheet.absoluteFillObject },

  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardBody: { fontSize: 13.5, lineHeight: 19 },

  sectionTitle: { fontSize: 15.5, fontWeight: '850', letterSpacing: 0.2 },
  analysisTitle: { fontSize: 12.5, fontWeight: '750', letterSpacing: 0.15, textTransform: 'uppercase' },
  swatches: { flexDirection: 'row', gap: 12 },
  swatch: { width: 112, gap: 6 },
  swatchCompact: { width: 64, gap: 4 },
  color: { height: 56, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  colorCompact: { height: 32, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  swatchLabel: { fontSize: 12.5, fontWeight: '650' },
  swatchLabelCompact: { fontSize: 10, fontWeight: '600' },
  hex: { fontSize: 14, fontWeight: '850', letterSpacing: 0.6 },
  hexCompact: { fontSize: 10.5, fontWeight: '750', letterSpacing: 0.4 },

  cardBodySmall: { fontSize: 12.8, lineHeight: 18, marginTop: -6 },
  paletteCard: { padding: 12 },
  paletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  rarity: { fontSize: 13.5, lineHeight: 19.5 },

  primaryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 2 },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '850' },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  secondaryText: { fontSize: 15, fontWeight: '750' },
});

