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
import { ACCOUNT_HEADER_CLEARANCE, BOTTOM_BAR_CLEARANCE } from '@/constants/Layout';
import { ART_TEMPLATES, filterTemplatesByEyeFamilies, getArtTemplateHoles, isDualEyeTemplate } from '@/lib/artTemplates';
import {
  analyzeIris,
  peekIrisAnalysisByStableKey,
  peekIrisAnalysisCache,
  seedIrisAnalysisCache,
  type IrisAnalysis,
} from '@/lib/analyzeIris';
import { useT } from '@/lib/i18n';
import { inferEyeColorFamilies } from '@/lib/irisColorFamily';
import { saveUserIrisAnalysis } from '@/lib/userIrisLibrary';

export default function ArtGalleryScreen() {
  const scheme = useColorScheme();
  const cs = scheme ?? 'light';
  const c = Colors[cs];
  const muted = cs === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';
  const t = useT();
  const params = useLocalSearchParams<{
    textureUri?: string;
    textureUri2?: string;
    sourceUri?: string;
    irisFingerprint?: string;
  }>();
  const textureUri = typeof params.textureUri === 'string' ? params.textureUri : undefined;
  const textureUri2 = typeof params.textureUri2 === 'string' ? params.textureUri2 : undefined;
  const sourceUri = typeof params.sourceUri === 'string' ? params.sourceUri : undefined;
  const irisFingerprint = typeof params.irisFingerprint === 'string' ? params.irisFingerprint : undefined;
  const analysisUri = sourceUri ?? textureUri;

  const [analysis, setAnalysis] = useState<IrisAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [showAll, setShowAll] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const screenW = Dimensions.get('window').width;
  const cardWidth = Math.min(360, screenW - 36);
  const thumbWidth = (screenW - 36 - 10) / 2;

  useEffect(() => {
    let cancelled = false;
    const persistAccount = async (result: IrisAnalysis) => {
      if (!irisFingerprint) return;
      try {
        await saveUserIrisAnalysis({ fingerprint: irisFingerprint }, result);
      } catch (e) {
        console.warn('save analysis to account failed', e instanceof Error ? e.message : String(e));
      }
    };

    const run = async () => {
      if (!analysisUri) return;
      if (irisFingerprint) {
        const byKey = peekIrisAnalysisByStableKey(irisFingerprint);
        if (byKey) {
          seedIrisAnalysisCache(analysisUri, byKey, irisFingerprint);
          await persistAccount(byKey);
          if (!cancelled) {
            setAnalysis(byKey);
            setAnalysisStatus('ready');
          }
          return;
        }
      }
      const cached = peekIrisAnalysisCache(analysisUri);
      if (cached) {
        if (irisFingerprint) seedIrisAnalysisCache(analysisUri, cached, irisFingerprint);
        await persistAccount(cached);
        if (!cancelled) {
          setAnalysis(cached);
          setAnalysisStatus('ready');
        }
        return;
      }
      try {
        setAnalysisStatus('loading');
        const res = await analyzeIris(analysisUri, { stableKey: irisFingerprint });
        if (irisFingerprint) seedIrisAnalysisCache(analysisUri, res, irisFingerprint);
        await persistAccount(res);
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
  }, [analysisUri, irisFingerprint]);

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
    () => visibleTemplates.find((tmpl) => tmpl.id === selectedId) ?? visibleTemplates[0] ?? null,
    [visibleTemplates, selectedId]
  );

  const selectedIsDual = selected ? isDualEyeTemplate(selected) : false;
  const canOrder = Boolean(selected && textureUri && (!selectedIsDual || textureUri2));

  useEffect(() => {
    if (!visibleTemplates.length) return;
    if (visibleTemplates.find((tmpl) => tmpl.id === selectedId)) return;
    const dual = textureUri2 ? visibleTemplates.find((tmpl) => isDualEyeTemplate(tmpl)) : undefined;
    setSelectedId(dual?.id ?? visibleTemplates[0]!.id);
  }, [visibleTemplates, selectedId, textureUri2]);

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
            <Text style={[styles.chipText, { color: c.text }]}>{t('shop.back')}</Text>
          </Pressable>
          <Text style={[styles.hTitle, { color: c.text }]} numberOfLines={1}>
            {t('shop.title')}
          </Text>
          <View style={{ width: ACCOUNT_HEADER_CLEARANCE }} />
        </View>

        {!textureUri ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('shop.noTexture')}</Text>
            <Text style={[styles.cardBody, { color: muted }]}>{t('shop.noTextureBody')}</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}>
            <Pressable
              accessibilityRole="button"
              disabled={!canOrder}
              onPress={() =>
                router.push({
                  pathname: '/checkout',
                  params: {
                    textureUri,
                    ...(textureUri2 ? { textureUri2 } : {}),
                    templateId: selected?.id ?? visibleTemplates[0]?.id ?? '',
                  },
                })
              }
              style={({ pressed }) => [
                styles.primaryCta,
                {
                  backgroundColor: c.tint,
                  opacity: !canOrder ? 0.45 : pressed ? 0.9 : 1,
                },
              ]}>
              <Text style={styles.primaryCtaText}>{t('shop.orderCanvas')}</Text>
              <Text style={styles.primaryCtaSub}>
                {!selected
                  ? t('shop.orderSubPick')
                  : selectedIsDual && !textureUri2
                    ? t('shop.orderSubNeedSecond')
                    : t('shop.orderSub', { title: selected.title })}
              </Text>
            </Pressable>

            <Text style={[styles.sub, { color: muted }]}>{t('shop.intro')}</Text>

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
                <Text style={[styles.filterText, { color: c.text }]}>{t('shop.filterMatch')}</Text>
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
                <Text style={[styles.filterText, { color: c.text }]}>{t('shop.filterAll')}</Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{t('shop.families')}</Text>
              {analysisStatus === 'loading' ? (
                <View style={styles.rowCenter}>
                  <ActivityIndicator color={c.tint} />
                  <Text style={[styles.cardBody, { color: muted }]}> {t('shop.familiesLoading')}</Text>
                </View>
              ) : analysisStatus === 'error' ? (
                <Text style={[styles.cardBody, { color: muted }]}>{t('shop.familiesError')}</Text>
              ) : (
                <Text style={[styles.cardBody, { color: muted }]}>{familyLabel}</Text>
              )}
            </View>

            {selected && textureUri ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  {t('shop.preview', { title: selected.title })}
                </Text>
                <View style={{ alignItems: 'center', marginTop: 8 }}>
                  <ArtTemplateComposite
                    textureUri={textureUri}
                    textureUri2={textureUri2}
                    template={selected}
                    width={cardWidth}
                  />
                </View>
                {selectedIsDual && !textureUri2 ? (
                  <View style={{ gap: 8, marginTop: 10 }}>
                    <Text style={[styles.cardBody, { color: muted }]}>{t('shop.dualNeedSecond')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname: '/library',
                          params: { pickDual: '1', textureUri },
                        })
                      }
                      style={({ pressed }) => [
                        styles.secondaryBtn,
                        { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.9 : 1 },
                      ]}>
                      <Text style={[styles.secondaryText, { color: c.text }]}>{t('shop.dualPickSecond')}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <Text style={[styles.meta, { color: muted }]}>
                  {isDualEyeTemplate(selected)
                    ? t('shop.holeMetaDual', {
                        count: getArtTemplateHoles(selected).length,
                        mode: selected.irisResizeMode ?? 'contain',
                        scale: selected.irisScale ?? 1,
                      })
                    : t('shop.holeMeta', {
                        x: selected.irisHole.x.toFixed(2),
                        y: selected.irisHole.y.toFixed(2),
                        w: selected.irisHole.w.toFixed(2),
                        h: selected.irisHole.h.toFixed(2),
                        mode: selected.irisResizeMode ?? 'contain',
                        scale: selected.irisScale ?? 1,
                      })}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.sectionLabel, { color: c.text }]}>{t('shop.templates')}</Text>
            <View style={[styles.grid, { justifyContent: 'flex-start' }]}>
              {visibleTemplates.map((tmpl) => {
                const active = tmpl.id === (selectedId ?? selected?.id);
                const dual = isDualEyeTemplate(tmpl);
                return (
                  <Pressable
                    key={tmpl.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedId(tmpl.id)}
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
                      <ArtTemplateComposite
                        textureUri={textureUri}
                        textureUri2={textureUri2}
                        template={tmpl}
                        width={thumbWidth}
                      />
                    ) : null}
                    <Text style={[styles.thumbTitle, { color: c.text }]} numberOfLines={1}>
                      {tmpl.title}
                      {dual ? ` · ${t('shop.dualBadge')}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {visibleTemplates.length === 0 ? (
              <Text style={[styles.cardBody, { color: muted, textAlign: 'center', paddingVertical: 20 }]}>
                {t('shop.noTemplates')}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/results',
                  params: {
                    uri: textureUri,
                    sourceUri: analysisUri,
                    ...(irisFingerprint ? { irisFingerprint } : {}),
                  },
                })
              }
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={[styles.secondaryText, { color: c.text }]}>{t('shop.colorAnalyzer')}</Text>
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
  scroll: { paddingBottom: BOTTOM_BAR_CLEARANCE, gap: 14 },
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
