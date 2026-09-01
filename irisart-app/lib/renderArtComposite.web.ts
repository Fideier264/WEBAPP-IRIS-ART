import * as FileSystem from '@/lib/platformFileSystem';

import {
  paintArtComposite,
  type RgbColor,
} from './artCompositeTint.web';
import type { ArtTemplate } from './artTemplates';
import { getTemplateCanvasBackground } from './artTemplates';

export type { RgbColor };

export type RenderArtCompositeInput = {
  textureUri: string;
  /** Second iris for dual-eye templates */
  textureUri2?: string;
  template: ArtTemplate;
  /** Longest edge in px (default 2048). Final size follows outputAspectRatio. */
  outputWidth?: number;
  /**
   * Product print aspect ratio (width / height), e.g. 1 for square canvas.
   * Must match the MerchOne SKU variant. Template artwork is fitted (cover) into this frame.
   */
  outputAspectRatio?: number;
  /** Blend secondary iris hue into multi-color templates (default true). */
  secondaryColorTint?: boolean;
};

function canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas export failed.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          if (typeof dataUrl !== 'string' || !dataUrl.includes(',')) {
            reject(new Error('Canvas read failed.'));
            return;
          }
          resolve(dataUrl.split(',')[1] ?? '');
        };
        reader.onerror = () => reject(new Error('Canvas read failed.'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      0.94
    );
  });
}

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
 * sized for the MerchOne product aspect ratio. Same tint pipeline as shop preview.
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

  const design = document.createElement('canvas');
  design.width = designW;
  design.height = designH;
  const designCtx = design.getContext('2d');
  if (!designCtx) throw new Error('Canvas 2D not available.');

  await paintArtComposite(designCtx, {
    textureUri: input.textureUri,
    textureUri2: input.textureUri2,
    template: input.template,
    width: designW,
    height: designH,
    secondaryColorTint: input.secondaryColorTint,
  });

  const product = document.createElement('canvas');
  product.width = outW;
  product.height = outH;
  const productCtx = product.getContext('2d');
  if (!productCtx) throw new Error('Canvas 2D not available.');

  productCtx.fillStyle = getTemplateCanvasBackground(input.template);
  productCtx.fillRect(0, 0, outW, outH);

  const coverScale = Math.max(outW / designW, outH / designH);
  const dw = designW * coverScale;
  const dh = designH * coverScale;
  const dx = (outW - dw) / 2;
  const dy = (outH - dh) / 2;
  productCtx.drawImage(design, dx, dy, dw, dh);

  const base64 = await canvasToBase64(product);
  const localUri = `${FileSystem.cacheDirectory}checkout_print_${outW}x${outH}_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return localUri;
}
