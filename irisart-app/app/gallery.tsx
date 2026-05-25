import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtTemplateComposite } from '@/components/ArtTemplateComposite';
import { AppBottomBar } from '@/components/AppBottomBar';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ART_TEMPLATES, filterTemplatesByEyeFamilies } from '@/lib/artTemplates';
import { analyzeIris, peekIrisAnalysisCache, type IrisAnalysis } from '@/lib/analyzeIris';
import { inferEyeColorFamilies } from '@/lib/irisColorFamily';

export default function ArtGalleryScreen() {
  const scheme = useColorScheme();
  const cs = scheme ?? 'light';
  const c = Colors[cs];
  const muted = cs === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';
  const params = useLocalSearchParams<{ textureUri?: string; sourceUri?: string }>();
  const textureUri = typeof params.textureUri === 'string' ? params.textureUri : undefined;
  const sourceUri = typeof params.sourceUri === 'string' ? params.sourceUri : undefined;
  const analysisUri = sourceUri ?? textureUri;

  const [analysis, setAnalysis] = useState<IrisAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const screenW = Dimensions.get('window').width;
  const cardWidth = Math.min(360, screenW - 36);
  const thumbWidth = (screenW - 36 - 10) / 2;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!analysisUri) return;
      const cached = peekIrisAnalysisCache(analysisUri);
      if (cached) {
        setAnalysis(cached);
        setAnalysisStatus('ready');
        return;
      }
      try {
        setAnalysisStatus('loading');
        const res = await analyzeIris(analysisUri);
        if (cancelled) return;
        setAnalysis(res);
        setAnalysisStatus('ready');
      } catch {
        if (cancelled) return;
        setAnalysisStatus('error');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [analysisUri]);

  const userFamilies = useMemo(() => {
    if (!analysis) return inferEyeColorFamilies('#8B7355', []);
    return inferEyeColorFamilies(
      analysis.primaryHex,
      analysis.palette.map((p) => p.hex)
    );
  }, [analysis]);

  const filteredTemplates = useMemo(
    () => filterTemplatesByEyeFamilies(userFamilies, ART_TEMPLATES),
    [userFamilies]
  );

  const visibleTemplates = showAll ? ART_TEMPLATES : filteredTemplates;

  const familyLabel = userFamilies.slice(0, 4).join(', ');

  const selected = useMemo(
    () => visibleTemplates.find((t) => t.id === selectedId) ?? visibleTemplates[0] ?? null,
    [visibleTemplates, selectedId]
  );

  useEffect(() => {
    if (visibleTemplates.length && !visibleTemplates.find((t) => t.id === selectedId)) {
      setSelectedId(visibleTemplates[0]!.id);
    }
  }, [visibleTemplates, selectedId]);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={
          cs === 'dark'
            ? ['rgba(124,92,255,0.22)', 'rgba(0,212,255,0.06)', 'rgba(5,6,10,0)']
            : ['rgba(91,92,255,0.12)', 'rgba(0,212,255,0.04)', 'rgba(247,248,255,0)']
        }
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
            <Text style={[styles.chipText, { color: c.text }]}>Back</Text>
          </Pressable>
          <Text style={[styles.hTitle, { color: c.text }]} numberOfLines={1}>
            Shop
          </Text>
          <View style={{ width: 56 }} />
        </View>

        {!textureUri ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Keine Iris-Textur</Text>
            <Text style={[styles.cardBody, { color: muted }]}>Bitte zuerst scannen und verfeinern.</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/checkout',
                  params: { textureUri },
                })
              }
              style={({ pressed }) => [
                styles.primaryCta,
                { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={styles.primaryCtaText}>Leinwand bestellen</Text>
              <Text style={styles.primaryCtaSub}>Native Kasse · Größe & Adresse in der App</Text>
            </Pressable>

            <Text style={[styles.sub, { color: muted }]}>
              Templates mit transparentem Loch legen sich über deine Nano-Banana-Iris — nur Skalierung &
              Position aus den Metadaten.
            </Text>

            <View style={styles.filterRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAll(false)}
                style={({ pressed }) => [
                  styles.filterPill,
                  {
                    borderColor: !showAll ? c.tint : c.border,
                    backgroundColor: !showAll ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <Text style={[styles.filterText, { color: c.text }]}>Passend zur Farbe</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAll(true)}
                style={({ pressed }) => [
                  styles.filterPill,
                  {
                    borderColor: showAll ? c.tint : c.border,
                    backgroundColor: showAll ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <Text style={[styles.filterText, { color: c.text }]}>Alle Templates</Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Erkannte Farbfamilien</Text>
              {analysisStatus === 'loading' ? (
                <View style={styles.rowCenter}>
                  <ActivityIndicator color={c.tint} />
                  <Text style={[styles.cardBody, { color: muted }]}> Analyse…</Text>
                </View>
              ) : analysisStatus === 'error' ? (
                <Text style={[styles.cardBody, { color: muted }]}>
                  Farb-Filter nicht verfügbar — „Alle Templates“ nutzen.
                </Text>
              ) : (
                <Text style={[styles.cardBody, { color: muted }]}>{familyLabel}</Text>
              )}
            </View>

            {selected && textureUri ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>Vorschau: {selected.title}</Text>
                <View style={{ alignItems: 'center', marginTop: 8 }}>
                  <ArtTemplateComposite textureUri={textureUri} template={selected} width={cardWidth} />
                </View>
                <Text style={[styles.meta, { color: muted }]}>
                  Loch: x {selected.irisHole.x.toFixed(2)} y {selected.irisHole.y.toFixed(2)} w{' '}
                  {selected.irisHole.w.toFixed(2)} h {selected.irisHole.h.toFixed(2)} ·{' '}
                  {selected.irisResizeMode ?? 'contain'} · scale {selected.irisScale ?? 1}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.sectionLabel, { color: c.text }]}>Vorlagen</Text>
            <View style={[styles.grid, { justifyContent: 'flex-start' }]}>
              {visibleTemplates.map((t) => {
                const active = t.id === (selectedId ?? selected?.id);
                return (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedId(t.id)}
                    style={({ pressed }) => [
                      styles.thumbWrap,
                      {
                        width: thumbWidth,
                        borderColor: active ? c.tint : c.border,
                        backgroundColor: c.surfaceAlt,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}>
                    {textureUri ? (
                      <ArtTemplateComposite textureUri={textureUri} template={t} width={thumbWidth} />
                    ) : null}
                    <Text style={[styles.thumbTitle, { color: c.text }]} numberOfLines={1}>
                      {t.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {visibleTemplates.length === 0 ? (
              <Text style={[styles.cardBody, { color: muted, textAlign: 'center', paddingVertical: 20 }]}>
                Kein Template für diese Farbe — „Alle Templates“ wählen oder neue Vorlagen in{' '}
                <Text style={{ fontWeight: '800' }}>lib/artTemplates.ts</Text> anlegen.
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/results',
                  params: { uri: textureUri, sourceUri: analysisUri },
                })
              }
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={[styles.secondaryText, { color: c.text }]}>Color Analyzer</Text>
            </Pressable>
          </ScrollView>
        )}
        <AppBottomBar active="shop" shopTextureUri={textureUri} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 8, gap: 10 },
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
  hTitle: { flex: 1, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  scroll: { paddingBottom: 36, gap: 14 },
  primaryCta: {
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 4,
  },
  primaryCtaText: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  primaryCtaSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12.5, textAlign: 'center' },
  sub: { fontSize: 13, lineHeight: 18.5 },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterPill: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  filterText: { fontSize: 13.5, fontWeight: '750' },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '850' },
  cardBody: { fontSize: 13.5, lineHeight: 19 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { fontSize: 15, fontWeight: '850', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: 8,
    gap: 6,
  },
  thumbTitle: { fontSize: 12.5, fontWeight: '750', paddingHorizontal: 8, textAlign: 'center' },
  meta: { fontSize: 11, marginTop: 8 },
  secondaryBtn: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 15, fontWeight: '750' },
});
