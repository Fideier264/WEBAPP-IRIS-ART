import React, { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ArtTemplate } from '@/lib/artTemplates';
import { getTemplateCanvasBackground } from '@/lib/artTemplates';
import { paintArtComposite } from '@/lib/artCompositeTint.web';

type Props = {
  textureUri: string;
  textureUri2?: string;
  template: ArtTemplate;
  /** Layout-Breite; Höhe = width / aspectRatio */
  width: number;
  /** When false, overlay tint omits secondary iris hue. */
  secondaryColorTint?: boolean;
};

/**
 * Web preview: same dynamic iris-color tinting as the checkout print export,
 * so customers see what they will order.
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    // Clear immediately so a slower previous paint can't leave a stale frame visible
    const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));
    canvas.width = pw;
    canvas.height = ph;
    const clearCtx = canvas.getContext('2d');
    if (clearCtx) {
      clearCtx.fillStyle = canvasBg;
      clearCtx.fillRect(0, 0, pw, ph);
    }

    const run = async () => {
      setBusy(true);
      setFailed(false);
      try {
        // Paint offscreen — only blit if this effect is still current (avoids race
        // when switching templates: old galaxyblue finishing after doublegalaxy).
        const offscreen = document.createElement('canvas');
        offscreen.width = pw;
        offscreen.height = ph;
        const ctx = offscreen.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D not available.');

        await paintArtComposite(ctx, {
          textureUri,
          textureUri2,
          template,
          width: pw,
          height: ph,
          secondaryColorTint,
        });

        if (cancelled) return;

        const dest = canvasRef.current;
        if (!dest) return;
        dest.width = pw;
        dest.height = ph;
        const dctx = dest.getContext('2d');
        if (!dctx) throw new Error('Canvas 2D not available.');
        dctx.drawImage(offscreen, 0, 0);
        setBusy(false);
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
      {createElement('canvas', {
        ref: canvasRef,
        style: {
          width,
          height,
          display: 'block',
          borderRadius: 14,
        },
      })}
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
    backgroundColor: '#07060c',
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
