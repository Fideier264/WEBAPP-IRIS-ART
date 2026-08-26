import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';

import type { ArtTemplate } from './artTemplates';

export type RgbColor = { r: number; g: number; b: number };

const irisColorCache = new Map<string, RgbColor>();

export async function resolveImageUrl(source: string | ImageSourcePropType): Promise<string> {
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

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let url = src;
      let revoke: string | undefined;
      try {
        // Absolute http(s) or protocol-relative — fetch as blob to avoid CORS taint when possible
        if (/^https?:\/\//i.test(src) || src.startsWith('//')) {
          const abs = src.startsWith('//') ? `${window.location.protocol}${src}` : src;
          const res = await fetch(abs);
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
      // Relative /assets/… paths from Expo work as-is on same origin
      img.src = url;
    })();
  });
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      default:
        h = ((rn - gn) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round(Math.min(255, Math.max(0, (rp + m) * 255))),
    g: Math.round(Math.min(255, Math.max(0, (gp + m) * 255))),
    b: Math.round(Math.min(255, Math.max(0, (bp + m) * 255))),
  };
}

/**
 * Prefer the characteristic midtone iris hue (golden fibers etc.), not a muddy global mean.
 * Samples an annulus (skips pupil + outer rim) and averages the top saturated candidates.
 */
export function extractAverageIrisColor(iris: HTMLImageElement, cacheKey?: string): RgbColor {
  const cacheId = cacheKey ? `v2:${cacheKey}` : undefined;
  if (cacheId) {
    const hit = irisColorCache.get(cacheId);
    if (hit) return hit;
  }

  const iw = iris.naturalWidth || iris.width;
  const ih = iris.naturalHeight || iris.height;
  const fallback = { r: 150, g: 110, b: 70 };
  if (!iw || !ih) return fallback;

  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));

  const sample = document.createElement('canvas');
  sample.width = sw;
  sample.height = sh;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;

  ctx.drawImage(iris, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  type Cand = { r: number; g: number; b: number; score: number };
  const cands: Cand[] = [];
  const cx = (sw - 1) / 2;
  const cy = (sh - 1) / 2;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const a = data[i + 3]!;
      if (a < 20) continue;

      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const rad = Math.hypot(dx, dy);
      // Iris tissue ring — skip pupil core and outer limbal/black frame
      if (rad < 0.18 || rad > 0.78) continue;

      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 40) continue;
      if (min > 240) continue;

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 35 || lum > 220) continue;

      const sat = max === 0 ? 0 : (max - min) / max;
      // Prefer colorful midtones (amber fibers), not dark muddy averages
      const score = sat * 2.2 + (lum / 255) * 0.55;
      cands.push({ r, g, b, score });
    }
  }

  if (!cands.length) {
    if (cacheId) irisColorCache.set(cacheId, fallback);
    return fallback;
  }

  cands.sort((a, b) => b.score - a.score);
  const topN = Math.max(24, Math.floor(cands.length * 0.28));
  const top = cands.slice(0, topN);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let wSum = 0;
  for (const p of top) {
    const w = 0.35 + p.score;
    rSum += p.r * w;
    gSum += p.g * w;
    bSum += p.b * w;
    wSum += w;
  }

  const color = {
    r: Math.round(Math.min(255, Math.max(0, rSum / wSum))),
    g: Math.round(Math.min(255, Math.max(0, gSum / wSum))),
    b: Math.round(Math.min(255, Math.max(0, bSum / wSum))),
  };

  if (cacheId) irisColorCache.set(cacheId, color);
  return color;
}

/** Slight chroma lift only — keep hue/lightness of the sampled iris midtones. */
export function matchTintColor(c: RgbColor): RgbColor {
  let { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  s = Math.min(0.78, s * 1.12);
  l = Math.min(0.55, Math.max(0.32, l));
  return hslToRgb(h, s, l);
}

/** @deprecated use matchTintColor */
export function vividTintColor(c: RgbColor): RgbColor {
  return matchTintColor(c);
}

/**
 * Colorize grayscale template: keep each pixel's lightness from the PNG,
 * apply hue/saturation from the iris sample. Blacks stay black; brights keep punch.
 */
export function tintGrayscaleTemplate(
  grayscale: HTMLImageElement,
  color: RgbColor,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not available.');

  const tint = matchTintColor(color);
  const { h, s } = rgbToHsl(tint.r, tint.g, tint.b);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(grayscale, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a < 2) continue;
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    // Relative luminance of the grayscale artwork
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const out = hslToRgb(h, s, lum);
    d[i] = out.r;
    d[i + 1] = out.g;
    d[i + 2] = out.b;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function drawIrisInSlot(
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

/** Paint iris + dynamically tinted grayscale template into an existing canvas context. */
export async function paintArtComposite(
  ctx: CanvasRenderingContext2D,
  opts: {
    textureUri: string;
    template: ArtTemplate;
    width: number;
    height: number;
    background?: string;
  }
): Promise<RgbColor | null> {
  const { textureUri, template, width, height, background = '#07060c' } = opts;

  const [iris, overlaySrc] = await Promise.all([
    loadImage(textureUri),
    template.overlayImage ? resolveImageUrl(template.overlayImage) : Promise.resolve(null),
  ]);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  drawIrisInSlot(ctx, iris, template, width, height);

  if (overlaySrc) {
    const overlay = await loadImage(overlaySrc);
    if (template.tintWithIrisColor) {
      const irisColor = extractAverageIrisColor(iris, textureUri);
      const tinted = tintGrayscaleTemplate(overlay, irisColor, width, height);
      ctx.drawImage(tinted, 0, 0, width, height);
      return irisColor;
    }
    ctx.drawImage(overlay, 0, 0, width, height);
  }

  return null;
}
