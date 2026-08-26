import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';

import * as FileSystem from '@/lib/platformFileSystem';

import type { ArtTemplate } from './artTemplates';

export type RenderArtCompositeInput = {
  textureUri: string;
  template: ArtTemplate;
  /** Longest edge in px (default 2048). Final size follows outputAspectRatio. */
  outputWidth?: number;
  /**
   * Product print aspect ratio (width / height), e.g. 1 for square canvas.
   * Must match the MerchOne SKU variant. Template artwork is fitted (cover) into this frame.
   */
  outputAspectRatio?: number;
};

async function resolveImageUrl(source: string | ImageSourcePropType): Promise<string> {
  if (typeof source === 'string') return source;
  if (typeof source === 'number') {
    const asset = Asset.fromModule(source);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('Template asset URI missing.');
    return uri;
  }
  if (source && typeof source === 'object' && 'uri' in source && typeof source.uri === 'string') {
    return source.uri;
  }
  throw new Error('Unsupported image source.');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let url = src;
      let revoke: string | undefined;
      try {
        if (src.startsWith('http://') || src.startsWith('https://')) {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          revoke = URL.createObjectURL(blob);
          url = revoke;
        }
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (revoke) URL.revokeObjectURL(revoke);
        resolve(img);
      };
      img.onerror = () => {
        if (revoke) URL.revokeObjectURL(revoke);
        reject(new Error(`Failed to load image: ${src.slice(0, 120)}`));
      };
      img.src = url;
    })();
  });
}

function drawIrisInSlot(
  ctx: CanvasRenderingContext2D,
  iris: HTMLImageElement,
  template: ArtTemplate,
  canvasW: number,
  canvasH: number
) {
  const hole = template.irisHole;
  const left = hole.x * canvasW;
  const top = hole.y * canvasH;
  const slotW = Math.max(1, hole.w * canvasW);
  const slotH = Math.max(1, hole.h * canvasH);
  const resizeMode = template.irisResizeMode ?? 'contain';
  const irisScale = template.irisScale ?? 1;
  const slotBg = template.irisSlotBackground ?? '#000000';

  ctx.fillStyle = slotBg;
  ctx.fillRect(left, top, slotW, slotH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, slotW, slotH);
  ctx.clip();

  const iw = iris.naturalWidth || iris.width;
  const ih = iris.naturalHeight || iris.height;
  if (!iw || !ih) {
    ctx.restore();
    return;
  }

  let scale = resizeMode === 'cover' ? Math.max(slotW / iw, slotH / ih) : Math.min(slotW / iw, slotH / ih);
  scale *= irisScale;

  const dw = iw * scale;
  const dh = ih * scale;
  const dx = left + (slotW - dw) / 2;
  const dy = top + (slotH - dh) / 2;

  ctx.drawImage(iris, dx, dy, dw, dh);
  ctx.restore();
}

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
  // Keep the longer edge ≈ outputWidth so square and non-square get enough resolution.
  if (ar >= 1) {
    const width = outputWidth;
    const height = Math.max(1, Math.round(width / ar));
    return { width, height };
  }
  const height = outputWidth;
  const width = Math.max(1, Math.round(height * ar));
  return { width, height };
}

/** Render iris + template overlay into a local file sized for the MerchOne product aspect ratio. */
export async function renderArtCompositeToLocalUri(input: RenderArtCompositeInput): Promise<string> {
  const longEdge = input.outputWidth ?? 2048;
  const productAspect =
    typeof input.outputAspectRatio === 'number' && input.outputAspectRatio > 0
      ? input.outputAspectRatio
      : 1; // MerchOne square canvases (e.g. CVS0200201…) expect 1:1

  const { width: outW, height: outH } = resolveOutputSize(longEdge, productAspect);

  const [iris, overlaySrc] = await Promise.all([
    loadImage(input.textureUri),
    input.template.overlayImage ? resolveImageUrl(input.template.overlayImage) : Promise.resolve(null),
  ]);

  // 1) Compose at the template's native aspect ratio (hole coords + overlay stay correct).
  const templateAr = input.template.aspectRatio > 0 ? input.template.aspectRatio : 1;
  const designLong = Math.max(outW, outH);
  const { width: designW, height: designH } = resolveOutputSize(designLong, templateAr);

  const design = document.createElement('canvas');
  design.width = designW;
  design.height = designH;
  const designCtx = design.getContext('2d');
  if (!designCtx) throw new Error('Canvas 2D not available.');

  designCtx.fillStyle = '#07060c';
  designCtx.fillRect(0, 0, designW, designH);
  drawIrisInSlot(designCtx, iris, input.template, designW, designH);

  if (overlaySrc) {
    const overlay = await loadImage(overlaySrc);
    designCtx.drawImage(overlay, 0, 0, designW, designH);
  }

  // 2) Fit (cover) onto the product print canvas so MerchOne gets the exact SKU aspect ratio.
  const product = document.createElement('canvas');
  product.width = outW;
  product.height = outH;
  const productCtx = product.getContext('2d');
  if (!productCtx) throw new Error('Canvas 2D not available.');

  productCtx.fillStyle = '#07060c';
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
