import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, PixelRatio, StyleSheet, Text, View } from 'react-native';

import type { ArtTemplate } from '@/lib/artTemplates';
import { getTemplateCanvasBackground } from '@/lib/artTemplates';
import { paintArtComposite } from '@/lib/artCompositeTint.native';
import { persistJpegDataUri, toImageDisplayUri } from '@/lib/artRgba.native';

type Props = {
  textureUri: string;
  textureUri2?: string;
  template: ArtTemplate;
  /** Layout-Breite; Höhe = width / aspectRatio */
  width: number;
  secondaryColorTint?: boolean;
};

/**
 * Native preview: same dynamic iris-color tinting as web preview and print export.
 */
export function ArtTemplateComposite({
  textureUri,
  textureUri2,
  template,
  width,
  secondaryColorTint = true,
}: Props) {
  const height = width / template.aspectRatio;
  const canvasBg = getTemplateCanvasBackground(template);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  const textureKey = useMemo(
    () => textureUri.replace(/[^a-zA-Z0-9]/g, '').slice(-28),
    [textureUri]
  );

  useEffect(() => {
    let cancelled = false;
    if (width <= 0) return;

    const dpr = Math.min(2, PixelRatio.get());
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));

    const run = async () => {
      setBusy(true);
      setFailed(false);
      setDisplayUri(null);
      try {
        const { dataUri: painted } = await paintArtComposite({
          textureUri,
          textureUri2,
          template,
          width: pw,
          height: ph,
          secondaryColorTint,
        });
        const cacheKey = `${template.id}_${textureKey}_${pw}x${ph}_${secondaryColorTint ? '1' : '0'}`;
        const fileUri = await persistJpegDataUri(painted, cacheKey);
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
  }, [textureUri, textureUri2, template, template.id, textureKey, width, height, secondaryColorTint]);

  return (
    <View style={[styles.root, { width, height, backgroundColor: canvasBg }]}>
      {displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={{ width, height, borderRadius: 14 }}
          resizeMode="stretch"
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
          <ActivityIndicator color="#7c5cff" />
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
