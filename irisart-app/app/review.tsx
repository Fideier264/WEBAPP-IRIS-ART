import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { analyzeIris, type IrisAnalysis } from '@/lib/analyzeIris';

type ArtStyleId = 'cosmic' | 'watercolor' | 'cyberpunk';

const ART_STYLES: Array<{
  id: ArtStyleId;
  name: string;
  subtitle: string;
  bg: [string, string, string];
  glow: string;
}> = [
  {
    id: 'cosmic',
    name: 'Cosmic',
    subtitle: 'Nebula glow + deep space contrast',
    bg: ['rgba(124,92,255,0.34)', 'rgba(0,212,255,0.12)', 'rgba(5,6,10,0)'],
    glow: 'rgba(124,92,255,0.55)',
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    subtitle: 'Soft pigment wash + gallery matte',
    bg: ['rgba(255,148,196,0.22)', 'rgba(0,212,255,0.08)', 'rgba(247,248,255,0)'],
    glow: 'rgba(255,148,196,0.45)',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    subtitle: 'Neon edge + high-tech frame',
    bg: ['rgba(0,255,179,0.18)', 'rgba(124,92,255,0.18)', 'rgba(5,6,10,0)'],
    glow: 'rgba(0,255,179,0.50)',
  },
];

export default function ReviewScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const params = useLocalSearchParams<{ textureUri?: string; sourceUri?: string; style?: string }>();

  const textureUri = typeof params.textureUri === 'string' ? params.textureUri : undefined;
  const sourceUri = typeof params.sourceUri === 'string' ? params.sourceUri : undefined;
  const analysisUri = sourceUri ?? textureUri;
  const initialStyle = ((): ArtStyleId => {
    const s = typeof params.style === 'string' ? params.style : '';
    return s === 'watercolor' || s === 'cyberpunk' || s === 'cosmic' ? s : 'cosmic';
  })();
  const [styleId, setStyleId] = useState<ArtStyleId>(initialStyle);
  const style = useMemo(() => ART_STYLES.find((x) => x.id === styleId) ?? ART_STYLES[0]!, [styleId]);

  const [analysis, setAnalysis] = useState<IrisAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [surfaceMode, setSurfaceMode] = useState<'black' | 'white'>('black');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!analysisUri) return;
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

  const subtitle = useMemo(() => 'Preview exactly what your enhanced iris looks like on print', []);
  const irisPaletteColors = useMemo(() => {
    const hexes = analysis?.palette?.slice(0, 5).map((p) => p.hex) ?? [];
    if (hexes.length >= 3) return hexes.slice(0, 3);
    // Fallback colors if analysis hasn't finished yet.
    return [style.glow, style.bg[0], style.bg[1]];
  }, [analysis, style]);

  const irisBadgeSize = 210;
  const artStageSize = 235;
  const irisImgScale = 3.2; // aggressive zoom so iris fills the circle

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={scheme === 'dark' ? style.bg : ['rgba(91,92,255,0.14)', 'rgba(0,212,255,0.04)', 'rgba(247,248,255,0)']}
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
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.hero}>
          <Text style={[styles.hTitle, { color: c.text }]}>Iris Texture Preview</Text>
          <Text
            style={[
              styles.sub,
              { color: scheme === 'dark' ? 'rgba(243,245,255,0.68)' : 'rgba(10,11,16,0.68)' },
            ]}>
            {subtitle}
          </Text>
        </View>

        {!textureUri ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Missing iris texture</Text>
            <Text style={[styles.cardBody, { color: c.text }]}>Go back and capture again.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Choose Art Style</Text>
              <View style={styles.styleRow}>
                {ART_STYLES.map((s) => {
                  const active = s.id === styleId;
                  return (
                    <Pressable
                      key={s.id}
                      accessibilityRole="button"
                      onPress={() => setStyleId(s.id)}
                      style={({ pressed }) => [
                        styles.stylePill,
                        {
                          borderColor: active ? c.tint : c.border,
                          backgroundColor: active ? 'rgba(124,92,255,0.14)' : c.surfaceAlt,
                          opacity: pressed ? 0.92 : 1,
                        },
                      ]}>
                      <Text style={[styles.stylePillTitle, { color: c.text }]}>{s.name}</Text>
                      <Text style={[styles.stylePillSub, { color: scheme === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)' }]} numberOfLines={1}>
                        {s.subtitle}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Artwork Preview</Text>
              <View style={styles.bgToggleRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSurfaceMode('black')}
                  style={({ pressed }) => [
                    styles.bgTogglePill,
                    {
                      borderColor: surfaceMode === 'black' ? c.tint : c.border,
                      backgroundColor: surfaceMode === 'black' ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}>
                  <Text style={[styles.bgToggleText, { color: c.text }]}>Black</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSurfaceMode('white')}
                  style={({ pressed }) => [
                    styles.bgTogglePill,
                    {
                      borderColor: surfaceMode === 'white' ? c.tint : c.border,
                      backgroundColor: surfaceMode === 'white' ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}>
                  <Text style={[styles.bgToggleText, { color: c.text }]}>White</Text>
                </Pressable>
              </View>
              <View style={[styles.posterFrame, { backgroundColor: surfaceMode }]}>
                {/* No gradient/background: keep the artwork surface as pure black/white. */}
                <View
                  style={[
                    styles.artStage,
                    { width: artStageSize, height: artStageSize, backgroundColor: surfaceMode === 'black' ? 'black' : 'white' },
                  ]}>
                  {/* Multi-color bloom just outside the iris circle */}
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const color = irisPaletteColors[i] ?? irisPaletteColors[0] ?? style.glow;
                    const factor = 1 + i * 0.13; // many larger layers
                    const layerSize = irisBadgeSize * factor;
                    const left = (artStageSize - layerSize) / 2;
                    const top = (artStageSize - layerSize) / 2;
                    const opacity = [0.34, 0.26, 0.18, 0.12, 0.08, 0.05][i] ?? 0.06;
                    return (
                      <View
                        key={i}
                        pointerEvents="none"
                        style={[
                          styles.bloomLayer,
                          {
                            width: layerSize,
                            height: layerSize,
                            left,
                            top,
                            backgroundColor: color,
                            opacity,
                          },
                        ]}
                      />
                    );
                  })}

                  {/* Iris fills the circle */}
                  <View style={styles.irisBadge}>
                    {analysisStatus === 'loading' ? (
                      <ActivityIndicator color={c.tint} />
                    ) : (
                      <Image
                        source={{ uri: textureUri }}
                        style={[styles.irisBadgeImg, { transform: [{ scale: irisImgScale }] }]}
                        resizeMode="cover"
                      />
                    )}
                  </View>
                </View>
              </View>
              <Text
                style={[
                  styles.canvasMeta,
                  { color: scheme === 'dark' ? 'rgba(243,245,255,0.60)' : 'rgba(10,11,16,0.60)' },
                ]}>
                Bloom comes from the iris palette; pick black or white background.
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>Clean Iris (isolated)</Text>
              <View style={styles.textureWrap}>
                <Image source={{ uri: textureUri }} style={styles.texture} resizeMode="contain" />
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>12×12 Canvas Mock</Text>
              <View style={styles.canvasFrame}>
                <View style={styles.canvasMat} />
                <Image source={{ uri: textureUri }} style={styles.canvasImage} resizeMode="cover" />
                <View pointerEvents="none" style={styles.canvasHighlight} />
              </View>
              <Text style={[styles.canvasMeta, { color: scheme === 'dark' ? 'rgba(243,245,255,0.60)' : 'rgba(10,11,16,0.60)' }]}>
                Includes black-backed texture for accurate print contrast.
              </Text>
            </View>
          </View>
        )}

        {textureUri ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/results',
                params: { uri: textureUri, sourceUri: analysisUri, style: styleId },
              })
            }
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
            ]}>
            <Text style={styles.primaryText}>Analyze Color Profile</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/capture')}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.92 : 1 },
          ]}>
          <Text style={[styles.secondaryText, { color: c.text }]}>Retake Photo</Text>
        </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 14 },
  scrollContent: { gap: 14, paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    width: 56,
    alignItems: 'center',
  },
  chipText: { fontSize: 13.5, fontWeight: '650' },

  hero: { gap: 6, paddingTop: 4 },
  hTitle: { fontSize: 18, fontWeight: '900' },
  sub: { fontSize: 13.5, lineHeight: 19 },

  grid: { flex: 1, gap: 12 },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 15.5, fontWeight: '850', letterSpacing: 0.2 },
  cardBody: { fontSize: 13.5, lineHeight: 19 },

  textureWrap: {
    flex: 1,
    minHeight: 170,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'black',
  },
  texture: { width: '100%', height: '100%' },

  canvasFrame: {
    height: 210,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  canvasMat: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    bottom: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  canvasImage: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    bottom: 14,
    borderRadius: 14,
    backgroundColor: 'black',
  },
  canvasHighlight: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 14,
    bottom: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    opacity: 0.9,
  },
  canvasMeta: { fontSize: 12.5, lineHeight: 18, marginTop: 6 },

  bgToggleRow: { flexDirection: 'row', gap: 10 },
  bgTogglePill: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bgToggleText: { fontSize: 14.5, fontWeight: '900' },

  styleRow: { flexDirection: 'column', gap: 10 },
  stylePill: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4 },
  stylePillTitle: { fontSize: 14.5, fontWeight: '900' },
  stylePillSub: { fontSize: 12.5, fontWeight: '650' },

  posterFrame: {
    height: 260,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artStage: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bloomLayer: {
    position: 'absolute',
    borderRadius: 9999,
  },
  irisBadge: {
    width: 210,
    height: 210,
    borderRadius: 210 / 2,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  irisBadgeImg: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' },

  primaryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '900' },

  secondaryBtn: { borderRadius: 16, paddingVertical: 13, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  secondaryText: { fontSize: 15, fontWeight: '750' },
});

