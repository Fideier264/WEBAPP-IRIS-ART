import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { AppBottomBar } from '@/components/AppBottomBar';
import Colors from '@/constants/Colors';
import { ACCOUNT_HEADER_CLEARANCE, BOTTOM_BAR_CLEARANCE } from '@/constants/Layout';
import {
  analyzeIris,
  peekIrisAnalysisByStableKey,
  peekIrisAnalysisCache,
  seedIrisAnalysisCache,
  type IrisAnalysis,
} from '@/lib/analyzeIris';
import { useT } from '@/lib/i18n';
import { getUserIrisAnalysis, saveUserIrisAnalysis } from '@/lib/userIrisLibrary';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; result: IrisAnalysis }
  | { kind: 'error'; message: string };

export default function ResultsScreen() {
  const scheme = useColorScheme();
  const cs = scheme ?? 'light';
  const c = Colors[cs];
  const t = useT();
  const params = useLocalSearchParams<{
    uri?: string;
    sourceUri?: string;
    irisId?: string;
    irisFingerprint?: string;
  }>();

  const uri = typeof params.uri === 'string' ? params.uri : undefined;
  const sourceUri = typeof params.sourceUri === 'string' ? params.sourceUri : undefined;
  const irisId = typeof params.irisId === 'string' ? params.irisId : undefined;
  const irisFingerprint = typeof params.irisFingerprint === 'string' ? params.irisFingerprint : undefined;
  const analysisUri = sourceUri ?? uri;
  const stableKey = irisId ?? irisFingerprint;

  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<Status>(() => {
    if (!analysisUri && !stableKey) return { kind: 'error', message: 'Missing photo.' };
    if (stableKey) {
      const byKey = peekIrisAnalysisByStableKey(stableKey);
      if (byKey) return { kind: 'ready', result: byKey };
    }
    if (analysisUri) {
      const cached = peekIrisAnalysisCache(analysisUri);
      if (cached) return { kind: 'ready', result: cached };
    }
    return { kind: 'loading' };
  });

  useEffect(() => {
    let cancelled = false;
    const persistAccount = async (result: IrisAnalysis) => {
      if (!irisId && !irisFingerprint) return;
      try {
        await saveUserIrisAnalysis({ id: irisId, fingerprint: irisFingerprint }, result);
      } catch (e) {
        console.warn('save analysis to account failed', e instanceof Error ? e.message : String(e));
      }
    };

    const run = async () => {
      if (!analysisUri && !stableKey) {
        setStatus({ kind: 'error', message: t('results.missingPhoto') });
        return;
      }

      try {
        if (retryNonce === 0 && stableKey) {
          const local = peekIrisAnalysisByStableKey(stableKey);
          if (local) {
            if (analysisUri) seedIrisAnalysisCache(analysisUri, local, stableKey);
            await persistAccount(local);
            if (!cancelled) setStatus({ kind: 'ready', result: local });
            return;
          }

          const cloud = await getUserIrisAnalysis({
            id: irisId,
            fingerprint: irisId ? undefined : irisFingerprint,
          });
          if (cloud) {
            seedIrisAnalysisCache(analysisUri, cloud, stableKey);
            if (!cancelled) setStatus({ kind: 'ready', result: cloud });
            return;
          }
        }

        if (!analysisUri) {
          setStatus({ kind: 'error', message: t('results.missingPhoto') });
          return;
        }

        if (retryNonce === 0) {
          const cached = peekIrisAnalysisCache(analysisUri);
          if (cached) {
            if (stableKey) seedIrisAnalysisCache(analysisUri, cached, stableKey);
            await persistAccount(cached);
            if (!cancelled) setStatus({ kind: 'ready', result: cached });
            return;
          }
        }

        setStatus({ kind: 'loading' });
        const result = await analyzeIris(analysisUri, { stableKey });
        if (stableKey) seedIrisAnalysisCache(analysisUri, result, stableKey);
        await persistAccount(result);
        if (cancelled) return;
        setStatus({ kind: 'ready', result });
      } catch (e) {
        if (cancelled) return;
        setStatus({ kind: 'error', message: e instanceof Error ? e.message : t('results.failed') });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [analysisUri, stableKey, irisId, irisFingerprint, retryNonce]);

  const title = useMemo(() => {
    if (status.kind !== 'ready') return t('results.titleLoading');
    return t('results.titleReady');
  }, [status.kind, t]);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={
          cs === 'dark'
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
              <Text style={[styles.chipText, { color: c.text }]}>{t('results.back')}</Text>
            </Pressable>
            <Text style={[styles.hTitle, { color: c.text }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={{ width: ACCOUNT_HEADER_CLEARANCE }} />
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
                  <Text style={[styles.cardTitle, { color: c.text }]}>{t('results.analyzing')}</Text>
                  <Text
                    style={[
                      styles.cardBody,
                      { color: cs === 'dark' ? 'rgba(243,245,255,0.68)' : 'rgba(10,11,16,0.66)' },
                    ]}>
                    {t('results.analyzingBody')}
                  </Text>
                </View>
              </View>
            </View>
          ) : status.kind === 'error' ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{t('results.failed')}</Text>
              <Text
                style={[
                  styles.cardBody,
                  { color: cs === 'dark' ? 'rgba(243,245,255,0.68)' : 'rgba(10,11,16,0.66)' },
                ]}>
                {status.message}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRetryNonce((n) => n + 1)}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1, marginTop: 14 },
                ]}>
                <Text style={styles.primaryText}>{t('results.retry')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/capture')}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  {
                    borderColor: c.border,
                    backgroundColor: c.surfaceAlt,
                    opacity: pressed ? 0.9 : 1,
                    marginTop: 10,
                  },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>{t('results.retake')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>{t('results.geminiSection')}</Text>
                <AnalysisBlock
                  title={t('results.baseRarity')}
                  body={status.result.gemini.baseColorRaritySentence}
                  percent={status.result.gemini.baseColorRarityPercent}
                  scheme={cs}
                />
                <AnalysisBlock
                  title={t('results.features')}
                  body={status.result.gemini.specialFeaturesSentence}
                  scheme={cs}
                />
                <AnalysisBlock
                  title={t('results.combinedRarity')}
                  body={`${status.result.gemini.combinedRaritySentences[0]} ${status.result.gemini.combinedRaritySentences[1]}`}
                  percent={status.result.gemini.combinedRarityPercent}
                  scheme={cs}
                />
                <AnalysisBlock
                  title={t('results.uniqueStructure')}
                  body={status.result.gemini.uniqueStructureNote ?? t('results.uniqueStructureFallback')}
                  scheme={cs}
                  standalone
                />
                <AnalysisBlock
                  title={t('results.inheritance')}
                  body={status.result.gemini.inheritanceSentence}
                  percent={status.result.gemini.inheritancePercent}
                  scheme={cs}
                />

                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/')}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.92 : 1 },
                  ]}>
                  <Text style={[styles.secondaryText, { color: c.text }]}>{t('results.analyzeAnother')}</Text>
                </Pressable>
              </View>

              <View style={[styles.card, styles.paletteCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>{t('results.palette')}</Text>
                <View style={styles.paletteGrid}>
                  {status.result.palette.map((p, idx) => (
                    <Swatch
                      key={`${p.hex}-${idx}`}
                      label={idx === 0 ? '1' : idx === 1 ? '2' : `${idx + 1}`}
                      hex={p.hex}
                      scheme={cs}
                      compact
                    />
                  ))}
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  router.push({
                    pathname: '/shop',
                    params: {
                      textureUri: uri,
                      sourceUri: analysisUri,
                      ...(irisFingerprint ? { irisFingerprint } : {}),
                    },
                  });
                }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
                ]}>
                <Text style={styles.primaryText}>{t('results.toGallery')}</Text>
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
  scrollContent: { gap: 14, paddingBottom: BOTTOM_BAR_CLEARANCE },

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
