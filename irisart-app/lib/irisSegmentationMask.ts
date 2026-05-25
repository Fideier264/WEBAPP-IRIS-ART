import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from '@/lib/platformFileSystem';
import jpeg from 'jpeg-js';
import { Buffer } from 'buffer';

export type DetectedIrisCircle = { cx: number; cy: number; r: number };
export type NormalizedCircle = { cxNorm: number; cyNorm: number; rNorm: number };

type CreateMaskResult = {
  maskedImageUri: string;
  maskImageUri: string;
  cropUri: string;
  circle: DetectedIrisCircle;
  size: number;
};

type DecodeResult = { width: number; height: number; data: Uint8Array };

function decodeJpegBase64(base64: string): DecodeResult {
  const bin = Buffer.from(base64, 'base64');
  const decoded = jpeg.decode(bin, { useTArray: true });
  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error('Failed to decode image data.');
  }
  return { width: decoded.width, height: decoded.height, data: decoded.data as Uint8Array };
}

function encodeJpegRgbaToBase64(rgba: Uint8Array, width: number, height: number, quality = 92) {
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
  samples = 72
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

function detectIrisCircle(rgba: Uint8Array, w: number, h: number): DetectedIrisCircle {
  const g = grayscale(rgba);
  const mag = sobelMagnitude(g, w, h);

  // Iris radius bounds in our square crop (tuned for typical eye shots).
  // Prefer the outer iris boundary (avoid picking the pupil boundary).
  const minR = Math.round(Math.min(w, h) * 0.25);
  const maxR = Math.round(Math.min(w, h) * 0.40);

  // We previously assumed (cx, cy) = center of the crop.
  // In real photos, the iris can be slightly off-center even with the alignment guide.
  // Search over a small offset window and pick the best (cx, cy, r) by ring-edge score.
  const baseCx = Math.round(w / 2);
  const baseCy = Math.round(h / 2);
  const maxOffset = Math.round(Math.min(w, h) * 0.16); // allow more center drift
  const step = 4;
  const minSafeCx = maxR + 2;
  const maxSafeCx = w - (maxR + 2);
  const minSafeCy = maxR + 2;
  const maxSafeCy = h - (maxR + 2);

  let bestCx = baseCx;
  let bestCy = baseCy;
  let bestR = Math.round((minR + maxR) / 2);
  let bestScore = -Infinity;

  for (let dy = -maxOffset; dy <= maxOffset; dy += step) {
    for (let dx = -maxOffset; dx <= maxOffset; dx += step) {
      const cx = Math.max(minSafeCx, Math.min(maxSafeCx, baseCx + dx));
      const cy = Math.max(minSafeCy, Math.min(maxSafeCy, baseCy + dy));

      // Radius scan for this candidate center
      let localBestR = bestR;
      let localBestScore = -Infinity;
      for (let r = minR; r <= maxR; r += 2) {
        const score = sampleRingScore(mag, w, h, cx, cy, r, 72);
        if (score > localBestScore) {
          localBestScore = score;
          localBestR = r;
        }
      }

      if (localBestScore > bestScore) {
        bestScore = localBestScore;
        bestCx = cx;
        bestCy = cy;
        bestR = localBestR;
      }
    }
  }

  // Shrink slightly to reduce sclera/eyelid bleed.
  const finalR = Math.max(14, Math.round(bestR * 0.92));
  return { cx: bestCx, cy: bestCy, r: finalR };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function makeRingMaskValue(dist: number, innerR: number, outerR: number, feather: number) {
  // Unused after switching to hard-edge masking, but kept for future tuning.
  const innerSoft0 = innerR - feather;
  const innerSoft1 = innerR + feather;
  const outerSoft0 = outerR - feather;
  const outerSoft1 = outerR + feather;

  const inInner = smoothstep(innerSoft0, innerSoft1, dist);
  const inOuter = 1 - smoothstep(outerSoft0, outerSoft1, dist);
  const v = inInner * inOuter;
  return Math.round(v * 255);
}

export async function segmentIrisAndCreateMaskAndMaskedImage(
  uri: string,
  size = 512,
  overrideCircle?: NormalizedCircle
): Promise<CreateMaskResult> {
  // 1) Center square crop + resize to a predictable size for stable diffusion.
  const base = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
  const w0 = base.width ?? 0;
  const h0 = base.height ?? 0;
  if (!w0 || !h0) throw new Error('Could not read image dimensions.');

  const sq = Math.min(w0, h0);
  const originX = Math.max(0, Math.floor((w0 - sq) / 2));
  const originY = Math.max(0, Math.floor((h0 - sq) / 2));

  const cropped = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX, originY, width: sq, height: sq } },
      { resize: { width: size, height: size } },
    ],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.92, base64: true }
  );

  if (!cropped.base64) throw new Error('Failed to get cropped image base64.');

  const decoded = decodeJpegBase64(cropped.base64);

  // Auto mode: detect iris circle from edges.
  // Manual mode: use user-selected circle on the preview (scaled into this 512x512 crop).
  const circle = (() => {
    if (!overrideCircle) return detectIrisCircle(decoded.data, decoded.width, decoded.height);
    const w = decoded.width;
    const h = decoded.height;

    const r = Math.max(8, Math.round(overrideCircle.rNorm * w));
    const cx = Math.round(overrideCircle.cxNorm * w);
    const cy = Math.round(overrideCircle.cyNorm * h);

    // Clamp to avoid going out of bounds (keeps mask creation stable).
    const margin = Math.max(4, Math.round(r * 0.08));
    return {
      cx: Math.max(margin, Math.min(w - margin, cx)),
      cy: Math.max(margin, Math.min(h - margin, cy)),
      r: Math.max(8, Math.min(Math.round(Math.min(w, h) * 0.48), r)),
    };
  })();

  // 2) Build a binary iris region mask that excludes pupil + sclera.
  // Inpainting quality depends heavily on mask coverage:
  // - too thin => only a ring gets reconstructed
  // - too wide  => eyelids/sclera artifacts
  // Tune the bounds and use a hard edge mask (no feather) for consistency.
  // circle.r is treated as the outer iris boundary.
  // Inner radius removes most of the pupil region, but we keep more of the inner iris
  // to avoid “cutting out” valuable texture.
  // Inpaint (generate) most of the iris to preserve fine fibers/texture.
  // Keep a smaller inner exclusion to avoid pupil/sclera artifacts.
  // Also allow slightly expanding beyond the detected boundary to avoid a black rim.
  const innerR = Math.round(circle.r * 0.20);
  const outerR = Math.round(circle.r * 1.07);
  const maxR = Math.round(Math.min(decoded.width, decoded.height) * 0.49);
  const outerRClamped = Math.min(maxR, outerR);
  const feather = Math.max(2, Math.round(circle.r * 0.035));

  const masked = new Uint8Array(decoded.data.length);
  const mask = new Uint8Array(decoded.data.length);

  // Recentering: shift image content so the selected/detected iris center
  // becomes the center of the output texture. This fixes “iris not centered”.
  const w = decoded.width;
  const h = decoded.height;
  const cx = circle.cx;
  const cy = circle.cy;
  const outCx = Math.round(w / 2);
  const outCy = Math.round(h / 2);

  const shiftX = outCx - cx; // output samples from (x - shiftX)
  const shiftY = outCy - cy;

  // Clamp shift so we don't move the iris completely out of frame.
  const margin = Math.max(6, outerRClamped + 2);
  const shiftXClamped = Math.max(-cx + margin, Math.min(w - margin - cx, shiftX));
  const shiftYClamped = Math.max(-cy + margin, Math.min(h - margin - cy, shiftY));

  // Glare/reflection handling: add bright pixels inside the iris to the inpaint mask.
  // This helps remove specular reflections that otherwise remain.
  const glareThreshold = 200; // luma threshold

  // 3) Apply mask: black background outside iris ring
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pxOut = y * w + x;
      const iOut = pxOut * 4;

      // Sample from shifted source coordinates.
      const sx = x - shiftXClamped;
      const sy = y - shiftYClamped;

      const srcInside = sx >= 0 && sx < w && sy >= 0 && sy < h;
      const pxSrc = srcInside ? sy * w + sx : -1;
      const iSrc = pxSrc >= 0 ? pxSrc * 4 : -1;

      // Mask distance is computed around the output center.
      const dx = x - outCx;
      const dy = y - outCy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Base inpaint band
      let mv = makeRingMaskValue(dist, innerR, outerRClamped, feather);

      // Optional glare expansion: if source pixel is bright, force it into the mask.
      if (srcInside && mv < 255) {
        const r = decoded.data[iSrc]!;
        const g = decoded.data[iSrc + 1]!;
        const b = decoded.data[iSrc + 2]!;
        const luma = (r * 299 + g * 587 + b * 114) / 1000;
        if (luma >= glareThreshold && dist <= outerRClamped) {
          mv = 255;
        }
      }

      const alpha = mv / 255;

      // masked input image (black outside mask)
      if (!srcInside) {
        masked[iOut] = 0;
        masked[iOut + 1] = 0;
        masked[iOut + 2] = 0;
        masked[iOut + 3] = 255;
      } else {
        masked[iOut] = Math.round(decoded.data[iSrc]! * alpha);
        masked[iOut + 1] = Math.round(decoded.data[iSrc + 1]! * alpha);
        masked[iOut + 2] = Math.round(decoded.data[iSrc + 2]! * alpha);
        masked[iOut + 3] = 255;
      }

      // mask image itself (white inpaint, black preserve)
      mask[iOut] = mv;
      mask[iOut + 1] = mv;
      mask[iOut + 2] = mv;
      mask[iOut + 3] = 255;
    }
  }

  // 4) Persist temp files in cache so we can upload blobs.
  const maskedB64 = encodeJpegRgbaToBase64(masked, decoded.width, decoded.height, 92);
  const maskB64 = encodeJpegRgbaToBase64(mask, decoded.width, decoded.height, 100);

  const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  const ts = Date.now();
  const maskedImageUri = `${cacheDir}iris_masked_${ts}.jpg`;
  const maskImageUri = `${cacheDir}iris_mask_${ts}.jpg`;

  // SDK/runtime differences: `FileSystem.EncodingType` may be undefined in some Expo versions.
  const base64Encoding =
    (FileSystem as any).EncodingType?.Base64 ?? (FileSystem as any).EncodingType?.base64 ?? 'base64';

  await Promise.all([
    FileSystem.writeAsStringAsync(maskedImageUri, maskedB64, { encoding: base64Encoding as any }),
    FileSystem.writeAsStringAsync(maskImageUri, maskB64, { encoding: base64Encoding as any }),
  ]);

  // Fail fast if either output ended up empty.
  const maskedInfo = await FileSystem.getInfoAsync(maskedImageUri);
  const maskInfo = await FileSystem.getInfoAsync(maskImageUri);
  if (!maskedInfo.exists || (maskedInfo.size ?? 0) <= 0) {
    throw new Error(`Masked image write failed or is empty (uri=${maskedImageUri}).`);
  }
  if (!maskInfo.exists || (maskInfo.size ?? 0) <= 0) {
    throw new Error(`Mask image write failed or is empty (uri=${maskImageUri}).`);
  }

  // cropped.uri is the temporary processed file URI from ImageManipulator.
  const cropUri = cropped.uri;
  return { maskedImageUri, maskImageUri, cropUri, circle, size: decoded.width };
}

