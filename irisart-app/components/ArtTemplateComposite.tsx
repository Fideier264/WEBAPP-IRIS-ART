import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, PixelRatio, StyleSheet, Text, View } from 'react-native';

import type { ArtTemplate } from '@/lib/artTemplates';
import { getTemplateCanvasBackground } from '@/lib/artTemplates';
import { paintArtComposite } from '@/lib/artCompositeTint.native';
import { persistJpegDataUri, toImageDisplayUri } from '@/lib/artRgba.native';
import { enqueuePaint } from '@/lib/paintQueue';

type Props = {
  textureUri: string;
  textureUri2?: string;
  template: ArtTemplate;
  /** Layout-Breite; Höhe = width / aspectRatio */
  width: number;
  secondaryColorTint?: boolean;
  /** thumb = fast low-res grid cell; preview = selected large view */
  quality?: 'thumb' | 'preview';
};

const memoryCache = new Map<string, string>();

function textureCacheKey(uri: string): string {
  return uri.replace(/[^a-zA-Z0-9]/g, '').slice(-28);
}

/** Prefer exact paint size; otherwise reuse a same-aspect preview already rendered for this motif. */
function lookupCachedUri(
  templateId: string,
  textureKey: string,
  secondaryColorTint: boolean,
  quality: 'thumb' | 'preview',
  pw: number,
  ph: number
): string | null {
  const tint = secondaryColorTint ? '1' : '0';
  const exact = `${templateId}_${textureKey}_${pw}x${ph}_${tint}_${quality}`;
  const hit = memoryCache.get(exact);
  if (hit) return hit;

  // Soft reuse only for preview, and only when aspect matches — otherwise stretch makes irises oval.
  if (quality !== 'preview' || pw < 1 || ph < 1) return null;

  const targetAspect = pw / ph;
  const prefix = `${templateId}_${textureKey}_`;
  const suffix = `_${tint}_preview`;
  let bestUri: string | null = null;
  let bestArea = 0;
  for (const [key, uri] of memoryCache) {
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
    const dims = key.slice(prefix.length, key.length - suffix.length);
    const m = /^(\d+)x(\d+)$/.exec(dims);
    if (!m) continue;
    const cw = Number(m[1]);
    const ch = Number(m[2]);
    if (cw < 1 || ch < 1) continue;
    if (Math.abs(cw / ch - targetAspect) > 0.02) continue;
    const area = cw * ch;
    if (area > bestArea) {
      bestArea = area;
      bestUri = uri;
    }
  }
  return bestUri;
}

/**
 * Native preview: same dynamic iris-color tinting as web preview and print export.
 */
export function ArtTemplateComposite({
  textureUri,
  textureUri2,
  template,
  width,
  secondaryColorTint = true,
  quality = 'preview',
}: Props) {
  const height = width / template.aspectRatio;
  const canvasBg = getTemplateCanvasBackground(template);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  const textureKey = useMemo(() => textureCacheKey(textureUri), [textureUri]);

  useEffect(() => {
    let cancelled = false;
    if (width <= 0) return;

    const dprCap = quality === 'thumb' ? 1 : Math.min(1.5, PixelRatio.get());
    const maxEdge = quality === 'thumb' ? 140 : 480;
    const layoutLong = Math.max(width, height);
    const scale = Math.min(dprCap, maxEdge / Math.max(1, layoutLong));
    const pw = Math.max(1, Math.round(width * scale));
    const ph = Math.max(1, Math.round(height * scale));
    const cacheKey = `${template.id}_${textureKey}_${pw}x${ph}_${secondaryColorTint ? '1' : '0'}_${quality}`;

    const cached = lookupCachedUri(template.id, textureKey, secondaryColorTint, quality, pw, ph);
    if (cached) {
      memoryCache.set(cacheKey, cached);
      setDisplayUri(cached);
      setBusy(false);
      setFailed(false);
      return;
    }

    const run = async () => {
      setBusy(true);
      setFailed(false);
      try {
        const { dataUri: painted } = await enqueuePaint(
          () =>
            paintArtComposite({
              textureUri,
              textureUri2,
              template,
              width: pw,
              height: ph,
              secondaryColorTint,
              jpegQuality: quality === 'thumb' ? 78 : 88,
            }),
          quality === 'preview' ? 'high' : 'normal'
        );
        if (cancelled) return;
        const fileUri = await persistJpegDataUri(painted, cacheKey);
        memoryCache.set(cacheKey, fileUri);
        if (!cancelled) {
          setDisplayUri(fileUri);
          setBusy(false);
        }
      } catch (e) {
        console.warn(
          'ArtTemplateComposite preview failed',
          e instanceof Error ? e.message : String(e)
        );
        if (!cancelled) {
          setFailed(true);
          setBusy(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [textureUri, textureUri2, template, template.id, textureKey, width, height, secondaryColorTint, quality]);

  return (
    <View style={[styles.root, { width, height, backgroundColor: canvasBg }]}>
      {displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={{ width, height, borderRadius: quality === 'thumb' ? 10 : 14 }}
          resizeMode="cover"
          onError={() => {
            setDisplayUri((cur) => {
              if (!cur) return cur;
              if (cur.startsWith('file://')) return cur.slice(7);
              return toImageDisplayUri(cur);
            });
          }}
        />
      ) : null}
      {busy ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#7c5cff" size={quality === 'thumb' ? 'small' : 'large'} />
        </View>
      ) : null}
      {failed && !busy ? (
        <View style={styles.failed}>
          <Text style={styles.failedText}>!</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,6,12,0.35)',
  },
  failed: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(220,80,80,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedText: { color: '#ffb4b4', fontSize: 18, fontWeight: '900' },
});
