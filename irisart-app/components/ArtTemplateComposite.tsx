import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, PixelRatio, StyleSheet, View } from 'react-native';

import type { ArtTemplate } from '@/lib/artTemplates';
import { getTemplateCanvasBackground } from '@/lib/artTemplates';
import { paintArtComposite } from '@/lib/artCompositeTint.native';

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
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (width <= 0) return;

    const dpr = Math.min(2, PixelRatio.get());
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));

    const run = async () => {
      setBusy(true);
      setFailed(false);
      setDataUri(null);
      try {
        const { dataUri: painted } = await paintArtComposite({
          textureUri,
          textureUri2,
          template,
          width: pw,
          height: ph,
          secondaryColorTint,
        });
        if (!cancelled) {
          setDataUri(painted);
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
  }, [textureUri, textureUri2, template, template.id, width, height, secondaryColorTint]);

  return (
    <View style={[styles.root, { width, height, backgroundColor: canvasBg }]}>
      {dataUri ? (
        <Image source={{ uri: dataUri }} style={{ width, height, borderRadius: 14 }} resizeMode="stretch" />
      ) : null}
      {busy ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#7c5cff" />
        </View>
      ) : null}
      {failed && !busy ? <View style={styles.failed} /> : null}
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
    backgroundColor: 'rgba(220,80,80,0.12)',
  },
});
