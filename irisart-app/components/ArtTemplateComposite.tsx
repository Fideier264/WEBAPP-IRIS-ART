import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { ArtTemplate } from '@/lib/artTemplates';
import { getArtTemplateHoles } from '@/lib/artTemplates';
import { useT } from '@/lib/i18n';

type Props = {
  textureUri: string;
  /** Second iris for dual-eye templates */
  textureUri2?: string;
  template: ArtTemplate;
  /** Layout-Breite; Höhe = width / aspectRatio */
  width: number;
  secondaryColorTint?: boolean;
};

/**
 * Native fallback preview (no canvas tint). Web uses ArtTemplateComposite.web.tsx
 * with the same dynamic color-tinting as the print export.
 */
export function ArtTemplateComposite({
  textureUri,
  textureUri2,
  template,
  width,
  secondaryColorTint: _secondaryColorTint = true,
}: Props) {
  const t = useT();
  const height = width / template.aspectRatio;
  const holes = getArtTemplateHoles(template);
  const uris = [textureUri, textureUri2].filter((u): u is string => Boolean(u));
  const irisScale = template.irisScale ?? 1;
  const resizeMode = template.irisResizeMode ?? 'contain';
  const slotBg = template.irisSlotBackground ?? '#000000';

  return (
    <View style={[styles.root, { width, height }]}>
      {holes.map((hole, i) => {
        const left = hole.x * width;
        const top = hole.y * height;
        const w = Math.max(1, hole.w * width);
        const h = Math.max(1, hole.h * height);
        const uri = uris[Math.min(i, uris.length - 1)] ?? textureUri;
        return (
          <View
            key={`hole-${i}`}
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
              source={{ uri }}
              style={[
                { width: w, height: h },
                irisScale !== 1 ? { transform: [{ scale: irisScale }] } : null,
              ]}
              resizeMode={resizeMode}
            />
          </View>
        );
      })}

      {template.overlayImage ? (
        <Image source={template.overlayImage} style={[styles.overlay, { width, height }]} resizeMode="stretch" />
      ) : (
        <View pointerEvents="none" style={[styles.overlay, { width, height, backgroundColor: 'transparent' }]}>
          <Text style={styles.placeholderHint}>{t('shop.overlayPlaceholder')}</Text>
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
