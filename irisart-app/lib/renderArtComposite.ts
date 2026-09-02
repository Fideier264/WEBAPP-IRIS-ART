import * as FileSystem from '@/lib/platformFileSystem';

import { paintArtComposite } from './artCompositeTint.native';
import type { ArtTemplate } from './artTemplates';
import {
  blitRgbaOver,
  createRgba,
  fillRgbaRect,
} from './artTintShared';
import { dataUriToBase64, decodeJpegDataUri, encodeRgbaToJpegDataUri } from './artRgba.native';
import { getTemplateCanvasBackground } from './artTemplates';

export type RenderArtCompositeInput = {
  textureUri: string;
  textureUri2?: string;
  template: ArtTemplate;
  outputWidth?: number;
  outputAspectRatio?: number;
  secondaryColorTint?: boolean;
};

function resolveOutputSize(outputWidth: number, aspectRatio: number): { width: number; height: number } {
  const ar = aspectRatio > 0 ? aspectRatio : 1;
  if (ar >= 1) {
    const width = outputWidth;
    const height = Math.max(1, Math.round(width / ar));
    return { width, height };
  }
  const height = outputWidth;
  const width = Math.max(1, Math.round(height * ar));
  return { width, height };
}

/**
 * Render iris + dynamically color-tinted grayscale template into a local print file
 * sized for the MerchOne product aspect ratio.
 */
export async function renderArtCompositeToLocalUri(input: RenderArtCompositeInput): Promise<string> {
  const longEdge = input.outputWidth ?? 2048;
  const productAspect =
    typeof input.outputAspectRatio === 'number' && input.outputAspectRatio > 0
      ? input.outputAspectRatio
      : 1;

  const { width: outW, height: outH } = resolveOutputSize(longEdge, productAspect);

  const templateAr = input.template.aspectRatio > 0 ? input.template.aspectRatio : 1;
  const designLong = Math.max(outW, outH);
  const { width: designW, height: designH } = resolveOutputSize(designLong, templateAr);

  const { dataUri: designDataUri } = await paintArtComposite({
    textureUri: input.textureUri,
    textureUri2: input.textureUri2,
    template: input.template,
    width: designW,
    height: designH,
    secondaryColorTint: input.secondaryColorTint,
  });

  const design = decodeJpegDataUri(designDataUri);
  const product = createRgba(outW, outH);
  fillRgbaRect(product, 0, 0, outW, outH, getTemplateCanvasBackground(input.template));

  const coverScale = Math.max(outW / designW, outH / designH);
  const dw = designW * coverScale;
  const dh = designH * coverScale;
  const dx = (outW - dw) / 2;
  const dy = (outH - dh) / 2;
  blitRgbaOver(product, design, dx, dy, dw, dh);

  const productDataUri = encodeRgbaToJpegDataUri(product, 94);
  const base64 = dataUriToBase64(productDataUri);
  const localUri = `${FileSystem.cacheDirectory}checkout_print_${outW}x${outH}_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return localUri;
}
