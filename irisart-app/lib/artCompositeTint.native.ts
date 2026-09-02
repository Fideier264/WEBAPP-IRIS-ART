import type { ImageSourcePropType } from 'react-native';

import type { ArtTemplate } from './artTemplates';
import { getArtTemplateHoles, getTemplateCanvasBackground } from './artTemplates';
import { loadRgba, resolveImageUrl, encodeRgbaToJpegDataUri } from './artRgba.native';
import {
  blitRgbaOver,
  createRgba,
  drawIrisInSlot,
  extractAverageIrisColor,
  tintGrayscaleTemplateDual,
  type RgbColor,
} from './artTintShared';

export type { RgbColor };

export async function paintArtComposite(opts: {
  textureUri: string;
  textureUri2?: string;
  template: ArtTemplate;
  width: number;
  height: number;
  background?: string;
  secondaryColorTint?: boolean;
}): Promise<{ dataUri: string; primaryColor: RgbColor | null }> {
  const {
    textureUri,
    textureUri2,
    template,
    width,
    height,
    background: backgroundOpt,
    secondaryColorTint = true,
  } = opts;

  const background = backgroundOpt ?? getTemplateCanvasBackground(template);
  const holes = getArtTemplateHoles(template);
  const textureUris = [textureUri, textureUri2].filter(
    (u): u is string => typeof u === 'string' && u.length > 0
  );

  const irisImages = await Promise.all(
    holes.map((_, i) => {
      const uri = textureUris[Math.min(i, textureUris.length - 1)] ?? textureUri;
      return loadRgba(uri);
    })
  );

  const canvas = createRgba(width, height, background);

  const holeCenters = holes.map((h) => ({
    cx: (h.x + h.w / 2) * width,
    cy: (h.y + h.h / 2) * height,
  }));

  for (let i = 0; i < holes.length; i++) {
    const others = holeCenters.filter((_, j) => j !== i);
    drawIrisInSlot(canvas, irisImages[i]!, holes[i]!, template, width, height, {
      skipSlotFill: holes.length > 1,
      otherCenters: holes.length > 1 ? others : undefined,
    });
  }

  let primaryColor: RgbColor | null = null;

  if (template.overlayImage) {
    const overlayUri = await resolveImageUrl(template.overlayImage as string | ImageSourcePropType);
    const overlay = await loadRgba(overlayUri, width, height);

    if (template.tintWithIrisColor) {
      const slots = holes.map((hole, i) => {
        const key = textureUris[Math.min(i, textureUris.length - 1)] ?? textureUri;
        return {
          iris: irisImages[i]!,
          hole,
          cacheKey: key,
          color: extractAverageIrisColor(irisImages[i]!, key),
        };
      });
      const tinted = tintGrayscaleTemplateDual(
        overlay,
        slots,
        width,
        height,
        Boolean(template.multiColorTint),
        secondaryColorTint
      );
      blitRgbaOver(canvas, tinted, 0, 0, width, height);
      primaryColor = slots[0]?.color ?? null;
    } else {
      blitRgbaOver(canvas, overlay, 0, 0, width, height);
    }
  }

  return {
    dataUri: encodeRgbaToJpegDataUri(canvas),
    primaryColor,
  };
}
