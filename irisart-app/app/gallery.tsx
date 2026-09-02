import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { ART_TEMPLATES, getArtTemplateHoles, isDualEyeTemplate } from '@/lib/artTemplates';
import { useT } from '@/lib/i18n';
import { resolveEnhancedIrisUri } from '@/lib/aiIrisInpaint';

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [secondaryColorTint, setSecondaryColorTint] = useState(true);

  const screenW = Dimensions.get('window').width;
  const cardWidth = Math.min(280, screenW - 48);
  const templateCols = 3;
  const gridGap = 8;
  const thumbWidth = Math.floor((screenW - 36 - gridGap * (templateCols - 1)) / templateCols);

  const visibleTemplates = ART_TEMPLATES;

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
                    <ArtTemplateComposite
                      key={`${tmpl.id}:${effectiveTextureUri}:${secondaryColorTint ? '1' : '0'}`}
                      textureUri={effectiveTextureUri}
                      textureUri2={effectiveTextureUri2}
                      template={tmpl}
                      width={thumbWidth - 2}
                      secondaryColorTint={secondaryColorTint}
                      quality="thumb"
                    />
                    <Text style={[styles.thumbTitle, { color: c.text }]} numberOfLines={1}>
                      {tmpl.title}
                      {dual ? ` · ${t('shop.dualBadge')}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
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
                    quality="preview"
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
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '850' },
  cardBody: { fontSize: 13.5, lineHeight: 19 },
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
