import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';

import * as FileSystem from '@/lib/platformFileSystem';

import type { ArtTemplate } from './artTemplates';

export type RenderArtCompositeInput = {
  textureUri: string;
  template: ArtTemplate;
  /** Output width in px; height follows template aspect ratio */
  outputWidth?: number;
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

/** Render iris + template overlay to a local virtual file URI (web). */
export async function renderArtCompositeToLocalUri(input: RenderArtCompositeInput): Promise<string> {
  const outputWidth = input.outputWidth ?? 2048;
  const outputHeight = Math.max(1, Math.round(outputWidth / input.template.aspectRatio));

  const [iris, overlaySrc] = await Promise.all([
    loadImage(input.textureUri),
    input.template.overlayImage ? resolveImageUrl(input.template.overlayImage) : Promise.resolve(null),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available.');

  ctx.fillStyle = '#07060c';
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  drawIrisInSlot(ctx, iris, input.template, outputWidth, outputHeight);

  if (overlaySrc) {
    const overlay = await loadImage(overlaySrc);
    ctx.drawImage(overlay, 0, 0, outputWidth, outputHeight);
  }

  const base64 = await canvasToBase64(canvas);
  const localUri = `${FileSystem.cacheDirectory}checkout_print_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return localUri;
}
