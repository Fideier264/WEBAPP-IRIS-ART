import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { ArtTemplate } from '@/lib/artTemplates';

type Props = {
  textureUri: string;
  template: ArtTemplate;
  /** Layout-Breite; Höhe = width / aspectRatio */
  width: number;
};

/**
 * Iris liegt **unten**, Template-PNG **oben**. Es gibt **keinen elliptischen App-Clip**:
 * Die sichtbare Form kommt nur aus der **Transparenz** deiner PNG.
 *
 * `irisHole` = rechteckige Bounding-Box desselben Lochs (0–1) — nur für Position & Slot-Größe.
 * `resizeMode contain`: komplettes Iris-Bild sichtbar; `cover`: Slot füllen, ggf. Ränder abschneiden.
 */
export function ArtTemplateComposite({ textureUri, template, width }: Props) {
  const height = width / template.aspectRatio;
  const hole = template.irisHole;
  const left = hole.x * width;
  const top = hole.y * height;
  const w = Math.max(1, hole.w * width);
  const h = Math.max(1, hole.h * height);
  const irisScale = template.irisScale ?? 1;
  const resizeMode = template.irisResizeMode ?? 'contain';
  const slotBg = template.irisSlotBackground ?? '#000000';

  // Platzhalter-Rahmen: optional noch „circular“ aus Metadaten
  const ringRadius = hole.circular ? Math.min(w, h) / 2 : 10;

  return (
    <View style={[styles.root, { width, height }]}>
      {/* Rechteckiger Slot — keine Ellipse. Form = nur PNG-Alpha. */}
      <View
        style={[
          styles.irisSlot,
          {
            left,
            top,
            width: w,
            height: h,
            backgroundColor: slotBg,
          },
        ]}>
        <Image
          source={{ uri: textureUri }}
          style={[
            { width: w, height: h },
            irisScale !== 1 ? { transform: [{ scale: irisScale }] } : null,
          ]}
          resizeMode={resizeMode}
        />
      </View>

      {template.overlayImage ? (
        <Image source={template.overlayImage} style={[styles.overlay, { width, height }]} resizeMode="stretch" />
      ) : (
        <View pointerEvents="none" style={[styles.overlay, { width, height, backgroundColor: 'transparent' }]}>
          <View
            style={[
              styles.placeholderRing,
              {
                left: left - 3,
                top: top - 3,
                width: w + 6,
                height: h + 6,
                borderRadius: ringRadius + 3,
              },
            ]}
          />
          <Text style={styles.placeholderHint}>Eigenes Overlay-PNG (Loch transparent)</Text>
        </View>
      )}
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
  irisSlot: {
    position: 'absolute',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  placeholderRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(124,92,255,0.55)',
    backgroundColor: 'transparent',
  },
  placeholderHint: {
    position: 'absolute',
    bottom: 10,
    left: 8,
    right: 8,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.38)',
  },
});
