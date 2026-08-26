import React, { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ArtTemplate } from '@/lib/artTemplates';
import { paintArtComposite } from '@/lib/artCompositeTint.web';

type Props = {
  textureUri: string;
  template: ArtTemplate;
  /** Layout-Breite; Höhe = width / aspectRatio */
  width: number;
};

/**
 * Web preview: same dynamic iris-color tinting as the checkout print export,
 * so customers see what they will order.
 */
export function ArtTemplateComposite({ textureUri, template, width }: Props) {
  const height = width / template.aspectRatio;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    const run = async () => {
      setBusy(true);
      setFailed(false);
      try {
        const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
        const pw = Math.max(1, Math.round(width * dpr));
        const ph = Math.max(1, Math.round(height * dpr));
        canvas.width = pw;
        canvas.height = ph;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D not available.');

        await paintArtComposite(ctx, {
          textureUri,
          template,
          width: pw,
          height: ph,
        });

        if (!cancelled) setBusy(false);
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
  }, [textureUri, template, width, height]);

  return (
    <View style={[styles.root, { width, height }]}>
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
