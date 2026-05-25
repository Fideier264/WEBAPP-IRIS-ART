import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from '@/lib/platformFileSystem';
import jpeg from 'jpeg-js';
import { Buffer } from 'buffer';

import type { RGB } from './color';

export type IrisCircle = { cx: number; cy: number; r: number };

export type IrisEnhanceResult = {
  enhancedUri: string;
  circle: IrisCircle;
};

function decodeJpegBase64(base64: string) {
  const bin = Buffer.from(base64, 'base64');
  const decoded = jpeg.decode(bin, { useTArray: true });
  if (!decoded?.data || !decoded.width || !decoded.height) throw new Error('Failed to decode image.');
  return { width: decoded.width, height: decoded.height, data: decoded.data as Uint8Array };
}

function encodeJpegBase64(rgba: Uint8Array, width: number, height: number, quality = 90) {
  const raw = { data: rgba, width, height };
  const encoded = jpeg.encode(raw, quality);
  return Buffer.from(encoded.data).toString('base64');
}

function grayscale(rgba: Uint8Array) {
  const g = new Float32Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const r = rgba[i]!;
    const gg = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    g[p] = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  }
  return g;
}

function sobelMagnitude(gray: Float32Array, w: number, h: number) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1]!;
      const tc = gray[i - w]!;
      const tr = gray[i - w + 1]!;
      const ml = gray[i - 1]!;
      const mr = gray[i + 1]!;
      const bl = gray[i + w - 1]!;
      const bc = gray[i + w]!;
      const br = gray[i + w + 1]!;

      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

function sampleRingScore(
  mag: Float32Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  samples = 64
) {
  let sum = 0;
  let n = 0;
  for (let k = 0; k < samples; k++) {
    const t = (k / samples) * Math.PI * 2;
    const x = Math.round(cx + r * Math.cos(t));
    const y = Math.round(cy + r * Math.sin(t));
    if (x <= 1 || x >= w - 2 || y <= 1 || y >= h - 2) continue;
    sum += mag[y * w + x]!;
    n++;
  }
  return n ? sum / n : 0;
}

function detectIrisCircle(rgba: Uint8Array, w: number, h: number): IrisCircle {
  // Assumption: user aligned iris near center using our ring overlay.
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);

  const g = grayscale(rgba);
  const mag = sobelMagnitude(g, w, h);

  // Search radii that plausibly match an iris boundary in our crop
  const minR = Math.round(Math.min(w, h) * 0.18);
  const maxR = Math.round(Math.min(w, h) * 0.42);

  let bestR = Math.round((minR + maxR) / 2);
  let bestScore = -1;

  for (let r = minR; r <= maxR; r += 2) {
    const score = sampleRingScore(mag, w, h, cx, cy, r, 72);
    if (score > bestScore) {
      bestScore = score;
      bestR = r;
    }
  }

  // Slight shrink to avoid eyelids/skin when cropping the iris core
  const finalR = Math.max(12, Math.round(bestR * 0.92));
  return { cx, cy, r: finalR };
}

function boxBlurRGBA(src: Uint8Array, w: number, h: number, radius: number) {
  const dst = new Uint8Array(src.length);
  const rs = radius;
  const area = (2 * rs + 1) * (2 * rs + 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let dy = -rs; dy <= rs; dy++) {
        const yy = Math.max(0, Math.min(h - 1, y + dy));
        for (let dx = -rs; dx <= rs; dx++) {
          const xx = Math.max(0, Math.min(w - 1, x + dx));
          const i = (yy * w + xx) * 4;
          r += src[i]!;
          g += src[i + 1]!;
          b += src[i + 2]!;
          a += src[i + 3]!;
        }
      }
      const o = (y * w + x) * 4;
      dst[o] = (r / area) | 0;
      dst[o + 1] = (g / area) | 0;
      dst[o + 2] = (b / area) | 0;
      dst[o + 3] = (a / area) | 0;
    }
  }
  return dst;
}

function enhanceRGBA(src: Uint8Array, w: number, h: number) {
  // Unsharp mask + mild contrast boost
  const blur = boxBlurRGBA(src, w, h, 1);
  const out = new Uint8Array(src.length);
  const amount = 1.35;
  const contrast = 1.08;

  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = src[i + c]!;
      const b = blur[i + c]!;
      let v = orig + amount * (orig - b);
      v = (v - 128) * contrast + 128;
      out[i + c] = Math.max(0, Math.min(255, v)) | 0;
    }
    out[i + 3] = src[i + 3]!;
  }

  return out;
}

export async function detectAndEnhanceIris(uri: string): Promise<IrisEnhanceResult> {
  // Work on a square center crop so our ring alignment assumption holds.
  const base = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
  const w0 = base.width ?? 0;
  const h0 = base.height ?? 0;
  if (!w0 || !h0) throw new Error('Could not read image dimensions.');

  const size0 = Math.min(w0, h0);
  const originX0 = Math.max(0, Math.floor((w0 - size0) / 2));
  const originY0 = Math.max(0, Math.floor((h0 - size0) / 2));

  // Downscale for detection (fast)
  const detSize = 320;
  const det = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX: originX0, originY: originY0, width: size0, height: size0 } },
      { resize: { width: detSize, height: detSize } },
    ],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.92, base64: true }
  );
  if (!det.base64) throw new Error('Failed to get image data for detection.');

  const decoded = decodeJpegBase64(det.base64);
  const circle = detectIrisCircle(decoded.data, decoded.width, decoded.height);

  // Crop around detected iris with padding; then upscale a bit for nicer output
  const pad = Math.round(circle.r * 0.25);
  const cropR = circle.r + pad;
  const cropX = Math.max(0, Math.round(circle.cx - cropR));
  const cropY = Math.max(0, Math.round(circle.cy - cropR));
  const cropW = Math.min(decoded.width - cropX, cropR * 2);
  const cropH = Math.min(decoded.height - cropY, cropR * 2);

  // Create enhanced crop from decoded pixels (avoid another full decode)
  const cropPx = new Uint8Array(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const srcRow = ((cropY + y) * decoded.width + cropX) * 4;
    const dstRow = y * cropW * 4;
    cropPx.set(decoded.data.subarray(srcRow, srcRow + cropW * 4), dstRow);
  }

  const enhancedPx = enhanceRGBA(cropPx, cropW, cropH);
  const enhancedBase64 = encodeJpegBase64(enhancedPx, cropW, cropH, 92);

  const outUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}irisart_enhanced_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(outUri, enhancedBase64, { encoding: FileSystem.EncodingType.Base64 });

  // Circle coordinates returned in detection-space; still useful for UI overlay.
  return { enhancedUri: outUri, circle };
}

