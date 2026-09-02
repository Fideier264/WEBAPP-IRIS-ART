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
import { useAppColors } from '@/lib/appTheme';
import { ACCOUNT_HEADER_CLEARANCE, BOTTOM_BAR_CLEARANCE, HEADER_BACK_CHIP_MIN_WIDTH } from '@/constants/Layout';
import { ART_TEMPLATES, filterTemplatesByEyeFamilies, getArtTemplateHoles, isDualEyeTemplate } from '@/lib/artTemplates';
import {
  analyzeIris,
  peekIrisAnalysisByStableKey,
  peekIrisAnalysisCache,
  seedIrisAnalysisCache,
  withIrisPaletteFromImage,
  type IrisAnalysis,
} from '@/lib/analyzeIris';
import { useT } from '@/lib/i18n';
import { inferEyeColorFamilies } from '@/lib/irisColorFamily';
import { resolveEnhancedIrisUri } from '@/lib/aiIrisInpaint';
import { saveUserIrisAnalysis } from '@/lib/userIrisLibrary';

export default function ArtGalleryScreen() {
  const c = useAppColors();
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
  const [resolvedTextureUri, setResolvedTextureUri] = useState<string | undefined>(textureUri);
  const [resolvedTextureUri2, setResolvedTextureUri2] = useState<string | undefined>(textureUri2);
  const effectiveTextureUri = resolvedTextureUri ?? textureUri;
  const effectiveTextureUri2 = resolvedTextureUri2 ?? textureUri2;
  const analysisUri = sourceUri ?? effectiveTextureUri;
  const paletteUri = effectiveTextureUri ?? sourceUri;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const primary = await resolveEnhancedIrisUri({ fingerprint: irisFingerprint, fallbackUri: textureUri });
      const secondary = textureUri2 ? await resolveEnhancedIrisUri({ fallbackUri: textureUri2 }) : undefined;
      if (!cancelled) {
        setResolvedTextureUri(primary);
        setResolvedTextureUri2(secondary);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [textureUri, textureUri2, irisFingerprint]);

  const [analysis, setAnalysis] = useState<IrisAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [showAll, setShowAll] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [secondaryColorTint, setSecondaryColorTint] = useState(true);

  const screenW = Dimensions.get('window').width;
  const cardWidth = Math.min(360, screenW - 36);
  const templateCols = 3;
  const gridGap = 8;
  const thumbWidth = Math.floor((screenW - 36 - gridGap * (templateCols - 1)) / templateCols);

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

    const finish = async (result: IrisAnalysis) => {
      const ready = await withIrisPaletteFromImage(result, paletteUri);
      await persistAccount(ready);
      if (!cancelled) {
        setAnalysis(ready);
        setAnalysisStatus('ready');
      }
    };

    const run = async () => {
      if (!analysisUri) return;
      if (irisFingerprint) {
        const byKey = peekIrisAnalysisByStableKey(irisFingerprint);
        if (byKey) {
          seedIrisAnalysisCache(analysisUri, byKey, irisFingerprint);
          await finish(byKey);
          return;
        }
      }
      const cached = peekIrisAnalysisCache(analysisUri);
      if (cached) {
        if (irisFingerprint) seedIrisAnalysisCache(analysisUri, cached, irisFingerprint);
        await finish(cached);
        return;
      }
      try {
        setAnalysisStatus('loading');
        const res = await analyzeIris(analysisUri, { stableKey: irisFingerprint, paletteUri });
        if (irisFingerprint) seedIrisAnalysisCache(analysisUri, res, irisFingerprint);
        await finish(res);
      } catch {
        if (cancelled) return;
        setAnalysisStatus('error');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [analysisUri, paletteUri, irisFingerprint]);

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
  const canOrder = Boolean(selected && effectiveTextureUri && (!selectedIsDual || effectiveTextureUri2));
  const showSecondaryToggle = Boolean(selected?.multiColorTint);

  useEffect(() => {
    if (!visibleTemplates.length) return;
    if (visibleTemplates.find((tmpl) => tmpl.id === selectedId)) return;
    const dual = effectiveTextureUri2 ? visibleTemplates.find((tmpl) => isDualEyeTemplate(tmpl)) : undefined;
    setSelectedId(dual?.id ?? visibleTemplates[0]!.id);
  }, [visibleTemplates, selectedId, effectiveTextureUri2]);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={c.pageGradient}
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
          <Text style={[styles.hTitle, { color: c.pageText }]} numberOfLines={1}>
            {t('shop.title')}
          </Text>
          <View style={{ width: ACCOUNT_HEADER_CLEARANCE }} />
        </View>

        {!effectiveTextureUri ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('shop.noTexture')}</Text>
            <Text style={[styles.cardBody, { color: c.muted }]}>{t('shop.noTextureBody')}</Text>
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
                    textureUri: effectiveTextureUri,
                    ...(effectiveTextureUri2 ? { textureUri2: effectiveTextureUri2 } : {}),
                    templateId: selected?.id ?? visibleTemplates[0]?.id ?? '',
                    secondaryColorTint: secondaryColorTint ? '1' : '0',
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
                  : selectedIsDual && !effectiveTextureUri2
                    ? t('shop.orderSubNeedSecond')
                    : t('shop.orderSub', { title: selected.title })}
              </Text>
            </Pressable>

            <Text style={[styles.sub, { color: c.pageMuted }]}>{t('shop.intro')}</Text>

            <View style={styles.filterRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAll(false)}
                style={({ pressed }) => [
                  styles.filterPill,
                  {
                    borderColor: !showAll ? c.chipBorderActive : c.chipBorder,
                    backgroundColor: !showAll ? c.chipBgActive : c.chipBg,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <Text style={[styles.filterText, { color: !showAll ? c.chipTextActive : c.chipText }]}>
                  {t('shop.filterMatch')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAll(true)}
                style={({ pressed }) => [
                  styles.filterPill,
                  {
                    borderColor: showAll ? c.chipBorderActive : c.chipBorder,
                    backgroundColor: showAll ? c.chipBgActive : c.chipBg,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}>
                <Text style={[styles.filterText, { color: showAll ? c.chipTextActive : c.chipText }]}>
                  {t('shop.filterAll')}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{t('shop.families')}</Text>
              {analysisStatus === 'loading' ? (
                <View style={styles.rowCenter}>
                  <ActivityIndicator color={c.tint} />
                  <Text style={[styles.cardBody, { color: c.muted }]}> {t('shop.familiesLoading')}</Text>
                </View>
              ) : analysisStatus === 'error' ? (
                <Text style={[styles.cardBody, { color: c.muted }]}>{t('shop.familiesError')}</Text>
              ) : (
                <Text style={[styles.cardBody, { color: c.muted }]}>{familyLabel}</Text>
              )}
            </View>

            {selected && effectiveTextureUri ? (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  {t('shop.preview', { title: selected.title })}
                </Text>
                {showSecondaryToggle ? (
                  <View style={styles.secondaryRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.secondaryLabel, { color: c.text }]}>{t('shop.secondaryColor')}</Text>
                      <Text style={[styles.secondaryHint, { color: c.muted }]}>{t('shop.secondaryColorHint')}</Text>
                    </View>
                    <View style={styles.secondaryToggle}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: secondaryColorTint }}
                        onPress={() => setSecondaryColorTint(true)}
                        style={({ pressed }) => [
                          styles.secondaryChip,
                          {
                            borderColor: secondaryColorTint ? c.tint : c.border,
                            backgroundColor: secondaryColorTint ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                            opacity: pressed ? 0.9 : 1,
                          },
                        ]}>
                        <Text style={[styles.secondaryChipText, { color: c.text }]}>{t('shop.secondaryColorOn')}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: !secondaryColorTint }}
                        onPress={() => setSecondaryColorTint(false)}
                        style={({ pressed }) => [
                          styles.secondaryChip,
                          {
                            borderColor: !secondaryColorTint ? c.tint : c.border,
                            backgroundColor: !secondaryColorTint ? 'rgba(124,92,255,0.16)' : c.surfaceAlt,
                            opacity: pressed ? 0.9 : 1,
                          },
                        ]}>
                        <Text style={[styles.secondaryChipText, { color: c.text }]}>{t('shop.secondaryColorOff')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                <View style={{ alignItems: 'center', marginTop: 8 }}>
                  <ArtTemplateComposite
                    key={`preview:${selected.id}:${effectiveTextureUri}:${effectiveTextureUri2 ?? ''}:${secondaryColorTint ? '1' : '0'}`}
                    textureUri={effectiveTextureUri}
                    textureUri2={effectiveTextureUri2}
                    template={selected}
                    width={cardWidth}
                    secondaryColorTint={secondaryColorTint}
                  />
                </View>
                {selectedIsDual && !effectiveTextureUri2 ? (
                  <View style={{ gap: 8, marginTop: 10 }}>
                    <Text style={[styles.cardBody, { color: c.muted }]}>{t('shop.dualNeedSecond')}</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname: '/library',
                          params: { pickDual: '1', textureUri: effectiveTextureUri },
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
                {__DEV__ ? (
                  <Text style={[styles.meta, { color: c.muted }]}>
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
                ) : null}
              </View>
            ) : null}

            <Text style={[styles.sectionLabel, { color: c.pageText }]}>{t('shop.templates')}</Text>
            <View style={[styles.grid, { justifyContent: 'flex-start', gap: gridGap }]}>
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
                    {effectiveTextureUri ? (
                      <ArtTemplateComposite
                        key={`${tmpl.id}:${effectiveTextureUri}:${secondaryColorTint ? '1' : '0'}`}
                        textureUri={effectiveTextureUri}
                        textureUri2={effectiveTextureUri2}
                        template={tmpl}
                        width={thumbWidth - 2}
                        secondaryColorTint={secondaryColorTint}
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
              <Text style={[styles.cardBody, { color: c.pageMuted, textAlign: 'center', paddingVertical: 20 }]}>
                {t('shop.noTemplates')}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/results',
                  params: {
                    uri: effectiveTextureUri,
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
        <AppBottomBar
          active="shop"
          shopTextureUri={effectiveTextureUri}
          shopIrisFingerprint={irisFingerprint}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 8, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: HEADER_BACK_CHIP_MIN_WIDTH,
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
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumbWrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: 4,
    gap: 4,
  },
  thumbTitle: { fontSize: 10.5, fontWeight: '750', paddingHorizontal: 4, textAlign: 'center' },
  secondaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secondaryLabel: { fontSize: 13.5, fontWeight: '800' },
  secondaryHint: { fontSize: 11.5, lineHeight: 16 },
  secondaryToggle: { flexDirection: 'row', gap: 6 },
  secondaryChip: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  secondaryChipText: { fontSize: 12.5, fontWeight: '750' },
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
