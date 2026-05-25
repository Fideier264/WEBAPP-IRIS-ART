import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { AppBottomBar } from '@/components/AppBottomBar';
import Colors from '@/constants/Colors';
import { enhanceIrisTextureWithInpaint } from '@/lib/aiIrisInpaint';

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; textureUrl: string; maskedImageUri: string; maskImageUri: string }
  | { kind: 'error'; message: string };

export default function IrisPrepScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const params = useLocalSearchParams<{ uri?: string; cropX?: string; cropY?: string; cropW?: string; cropH?: string }>();
  const uri = typeof params.uri === 'string' ? params.uri : undefined;
  const cropX = typeof params.cropX === 'string' ? Number(params.cropX) : undefined;
  const cropY = typeof params.cropY === 'string' ? Number(params.cropY) : undefined;
  const cropW = typeof params.cropW === 'string' ? Number(params.cropW) : undefined;
  const cropH = typeof params.cropH === 'string' ? Number(params.cropH) : undefined;

  const cropRect = useMemo(() => {
    if ([cropX, cropY, cropW, cropH].some((v) => typeof v !== 'number' || Number.isNaN(v as number))) return undefined;
    return { x: cropX as number, y: cropY as number, w: cropW as number, h: cropH as number };
  }, [cropX, cropY, cropW, cropH]);

  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [regenNonce, setRegenNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!uri) {
        setStatus({ kind: 'error', message: 'Missing photo.' });
        return;
      }
      try {
        setStatus({ kind: 'loading' });
        if (cancelled) return;
        const res = await enhanceIrisTextureWithInpaint(uri, { cropRect });
        if (cancelled) return;
        setStatus({
          kind: 'ready',
          textureUrl: res.outputUrl,
          maskedImageUri: res.seg.maskedImageUri,
          maskImageUri: res.seg.maskImageUri,
        });
      } catch (e) {
        if (cancelled) return;
        setStatus({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to enhance iris.',
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [uri, cropRect, regenNonce]);

  const title = useMemo(() => (status.kind === 'ready' ? 'Iris Refined' : 'AI Iris Enhancement'), [status.kind]);

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={
          scheme === 'dark'
            ? ['rgba(124,92,255,0.18)', 'rgba(0,212,255,0.06)', 'rgba(5,6,10,0)']
            : ['rgba(91,92,255,0.12)', 'rgba(0,212,255,0.04)', 'rgba(247,248,255,0)']
        }
        start={{ x: 0.15, y: 0.05 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 20, gap: 14 }}>
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

          <View style={[styles.stage, { backgroundColor: c.surface, borderColor: c.border }]}>
            {status.kind === 'ready' ? (
              <Image source={{ uri: status.textureUrl }} style={styles.preview} resizeMode="contain" />
            ) : uri ? <Image source={{ uri }} style={styles.preview} resizeMode="cover" /> : null}

            {status.kind === 'loading' ? (
              <View style={styles.center}>
                <ActivityIndicator color={c.tint} />
                <Text
                  style={[
                    styles.body,
                    { color: scheme === 'dark' ? 'rgba(243,245,255,0.70)' : 'rgba(10,11,16,0.68)' },
                  ]}>
                Generating Clean Iris...
                </Text>
              </View>
            ) : status.kind === 'error' ? (
              <View style={styles.center}>
                <Text style={[styles.title, { color: c.text }]}>Enhancement failed</Text>
                <Text
                  style={[
                    styles.body,
                    { color: scheme === 'dark' ? 'rgba(243,245,255,0.70)' : 'rgba(10,11,16,0.68)' },
                  ]}>
                  {status.message}
                </Text>
              </View>
            ) : null}
          </View>

          {status.kind === 'ready' ? (
            <>
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.title, { color: c.text, fontSize: 14.5 }]}>Source Eye Crop</Text>
              <View style={{ borderRadius: 14, overflow: 'hidden', height: 130, backgroundColor: 'black' }}>
                <Image source={{ uri: status.maskedImageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
                <Text
                  style={[
                    styles.body,
                    { color: scheme === 'dark' ? 'rgba(243,245,255,0.65)' : 'rgba(10,11,16,0.65)' },
                  ]}>
                AI generates the clean iris artwork from this crop.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/shop', params: { textureUri: status.textureUrl, sourceUri: uri } })
                }
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
                ]}>
                <Text style={styles.primaryText}>Art Gallery</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRegenNonce((v) => v + 1)}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.92 : 1, marginTop: 10 },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>Neu generieren</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/results', params: { uri: status.textureUrl, sourceUri: uri } })
                }
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.92 : 1, marginTop: 10 },
                ]}>
                <Text style={[styles.secondaryText, { color: c.text }]}>Analyze Color Profile</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/capture')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.92 : 1 },
              ]}>
              <Text style={[styles.secondaryText, { color: c.text }]}>Retake Photo</Text>
            </Pressable>
          )}
        </ScrollView>
        <AppBottomBar active="scan" shopTextureUri={status.kind === 'ready' ? status.textureUrl : undefined} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 14 },

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

  stage: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    height: 260,
  },
  preview: { ...StyleSheet.absoluteFillObject },
  center: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18, gap: 10 },

  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: '850' },
  body: { fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  enhancedWrap: { borderRadius: 18, overflow: 'hidden', height: 180 },
  enhanced: { ...StyleSheet.absoluteFillObject },

  primaryBtn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '850' },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 'auto',
  },
  secondaryText: { fontSize: 15, fontWeight: '750' },

  canvasMeta: { fontSize: 12.5, lineHeight: 18, marginTop: 6 },
});

