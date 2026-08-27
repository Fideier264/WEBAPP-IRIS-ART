import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';

import type { ArtTemplate } from './artTemplates';

export type RgbColor = { r: number; g: number; b: number };

const irisColorCache = new Map<string, RgbColor>();

type Hs = { h: number; s: number };
/** polar[angleBin][radialBin] */
type PolarHsMap = { angles: number; radials: number; cells: Hs[][]; fallback: Hs };

const irisPolarCache = new Map<string, PolarHsMap>();

const MULTI_ANGLE_BINS = 48;
const MULTI_RADIAL_BINS = 3;

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
 * Mild polish of extracted iris color for tinting.
 * Keep hue/lightness close to the real eye — avoid neon/overbright results.
 */
export function vividTintColor(c: RgbColor): RgbColor {
  let { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  s = Math.min(0.7, Math.max(0.2, s * 1.1));
  l = Math.min(0.48, Math.max(0.26, l));
  return hslToRgb(h, s, l);
}

/** Alias kept for older imports */
export function matchTintColor(c: RgbColor): RgbColor {
  return vividTintColor(c);
}

/**
 * Average iris RGB, ignoring transparent + near-black (pupil).
 * Midtones with higher saturation are weighted more for a vibrant tint.
 */
export function extractAverageIrisColor(iris: HTMLImageElement, cacheKey?: string): RgbColor {
  const cacheId = cacheKey ? `v1:${cacheKey}` : undefined;
  if (cacheId) {
    const hit = irisColorCache.get(cacheId);
    if (hit) return hit;
  }

  const iw = iris.naturalWidth || iris.width;
  const ih = iris.naturalHeight || iris.height;
  const fallback = { r: 140, g: 105, b: 75 };
  if (!iw || !ih) return fallback;

  const maxSide = 256;
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

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let wSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a < 16) continue;

    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    if (max < 36) continue; // pupil / void
    if (min > 245) continue; // specular

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max === 0 ? 0 : (max - min) / max;
    const weight = (a / 255) * (0.4 + sat * 1.8) * Math.min(1, lum / 70);

    rSum += r * weight;
    gSum += g * weight;
    bSum += b * weight;
    wSum += weight;
  }

  const color =
    wSum < 1e-6
      ? fallback
      : {
          r: Math.round(Math.min(255, Math.max(0, rSum / wSum))),
          g: Math.round(Math.min(255, Math.max(0, gSum / wSum))),
          b: Math.round(Math.min(255, Math.max(0, bSum / wSum))),
        };

  if (cacheId) irisColorCache.set(cacheId, color);
  return color;
}

/**
 * Colorize grayscale template with iris color; preserve PNG alpha (iris hole).
 * `color` blend keeps template shading and applies iris hue/sat without blowing highlights.
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
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available.');

  const tint = vividTintColor(color);
  const fill = `rgb(${tint.r}, ${tint.g}, ${tint.b})`;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(grayscale, 0, 0, width, height);

  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(grayscale, 0, 0, width, height);

  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/**
 * Build a polar hue/sat map from the iris (angular wedges × radial rings).
 * Skips pupil + near-black so multi-colored eyes keep local hues (amber vs brown etc.).
 */
export function extractIrisPolarHsMap(
  iris: HTMLImageElement,
  cacheKey?: string,
  angleBins = MULTI_ANGLE_BINS,
  radialBins = MULTI_RADIAL_BINS
): PolarHsMap {
  const cacheId = cacheKey ? `polar:${angleBins}x${radialBins}:${cacheKey}` : undefined;
  if (cacheId) {
    const hit = irisPolarCache.get(cacheId);
    if (hit) return hit;
  }

  const fallbackHs: Hs = (() => {
    const t = vividTintColor({ r: 140, g: 105, b: 75 });
    const hsl = rgbToHsl(t.r, t.g, t.b);
    return { h: hsl.h, s: hsl.s };
  })();

  const iw = iris.naturalWidth || iris.width;
  const ih = iris.naturalHeight || iris.height;
  if (!iw || !ih) {
    const empty: PolarHsMap = {
      angles: angleBins,
      radials: radialBins,
      cells: Array.from({ length: angleBins }, () =>
        Array.from({ length: radialBins }, () => ({ ...fallbackHs }))
      ),
      fallback: fallbackHs,
    };
    return empty;
  }

  const maxSide = 360;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));
  const sample = document.createElement('canvas');
  sample.width = sw;
  sample.height = sh;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      angles: angleBins,
      radials: radialBins,
      cells: Array.from({ length: angleBins }, () =>
        Array.from({ length: radialBins }, () => ({ ...fallbackHs }))
      ),
      fallback: fallbackHs,
    };
  }

  ctx.drawImage(iris, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);
  const cx = (sw - 1) / 2;
  const cy = (sh - 1) / 2;
  const maxR = Math.hypot(cx, cy);

  const sums = Array.from({ length: angleBins }, () =>
    Array.from({ length: radialBins }, () => ({ r: 0, g: 0, b: 0, w: 0 }))
  );

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const a = data[i + 3]!;
      if (a < 16) continue;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy) / maxR;
      // Iris tissue: skip pupil + outer frame
      if (dist < 0.16 || dist > 0.82) continue;

      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 36 || min > 245) continue;

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = max === 0 ? 0 : (max - min) / max;
      const weight = (a / 255) * (0.4 + sat * 1.8) * Math.min(1, lum / 70);
      if (weight <= 0) continue;

      let ang = Math.atan2(dy, dx); // -PI..PI
      if (ang < 0) ang += Math.PI * 2;
      const aBin = Math.min(angleBins - 1, Math.floor((ang / (Math.PI * 2)) * angleBins));
      // Map iris ring 0.16..0.82 → radial bins
      const rNorm = Math.min(1, Math.max(0, (dist - 0.16) / (0.82 - 0.16)));
      const rBin = Math.min(radialBins - 1, Math.floor(rNorm * radialBins));

      const cell = sums[aBin]![rBin]!;
      cell.r += r * weight;
      cell.g += g * weight;
      cell.b += b * weight;
      cell.w += weight;
    }
  }

  // Global fallback from all samples
  let gr = 0;
  let gg = 0;
  let gb = 0;
  let gw = 0;
  for (const row of sums) {
    for (const cell of row) {
      gr += cell.r;
      gg += cell.g;
      gb += cell.b;
      gw += cell.w;
    }
  }
  const globalFb =
    gw > 0
      ? vividTintColor({
          r: Math.round(gr / gw),
          g: Math.round(gg / gw),
          b: Math.round(gb / gw),
        })
      : vividTintColor({ r: 140, g: 105, b: 75 });
  const globalHs = rgbToHsl(globalFb.r, globalFb.g, globalFb.b);
  const fallback: Hs = { h: globalHs.h, s: globalHs.s };

  const cells: Hs[][] = Array.from({ length: angleBins }, (_, ai) =>
    Array.from({ length: radialBins }, (_, ri) => {
      const cell = sums[ai]![ri]!;
      if (cell.w < 1e-6) return { ...fallback };
      const tint = vividTintColor({
        r: Math.round(cell.r / cell.w),
        g: Math.round(cell.g / cell.w),
        b: Math.round(cell.b / cell.w),
      });
      const hsl = rgbToHsl(tint.r, tint.g, tint.b);
      return { h: hsl.h, s: hsl.s };
    })
  );

  // Fill empty bins from angular neighbors
  for (let ri = 0; ri < radialBins; ri++) {
    for (let ai = 0; ai < angleBins; ai++) {
      if (sums[ai]![ri]!.w >= 1e-6) continue;
      for (let d = 1; d < angleBins; d++) {
        const left = sums[(ai - d + angleBins) % angleBins]![ri]!;
        const right = sums[(ai + d) % angleBins]![ri]!;
        if (left.w >= 1e-6) {
          cells[ai]![ri] = { ...cells[(ai - d + angleBins) % angleBins]![ri]! };
          break;
        }
        if (right.w >= 1e-6) {
          cells[ai]![ri] = { ...cells[(ai + d) % angleBins]![ri]! };
          break;
        }
      }
    }
  }

  const map: PolarHsMap = { angles: angleBins, radials: radialBins, cells, fallback };
  if (cacheId) irisPolarCache.set(cacheId, map);
  return map;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * t;
}

function samplePolarHs(map: PolarHsMap, angleRad: number, rNorm: number): Hs {
  let ang = angleRad;
  if (ang < 0) ang += Math.PI * 2;
  const aFloat = (ang / (Math.PI * 2)) * map.angles;
  const a0 = Math.floor(aFloat) % map.angles;
  const a1 = (a0 + 1) % map.angles;
  const at = aFloat - Math.floor(aFloat);

  const rClamped = Math.min(0.999, Math.max(0, rNorm));
  const rFloat = rClamped * map.radials;
  const r0 = Math.min(map.radials - 1, Math.floor(rFloat));
  const r1 = Math.min(map.radials - 1, r0 + 1);
  const rt = rFloat - r0;

  const c00 = map.cells[a0]![r0] ?? map.fallback;
  const c10 = map.cells[a1]![r0] ?? map.fallback;
  const c01 = map.cells[a0]![r1] ?? map.fallback;
  const c11 = map.cells[a1]![r1] ?? map.fallback;

  const h0 = lerpAngle(c00.h, c10.h, at);
  const h1 = lerpAngle(c01.h, c11.h, at);
  const s0 = c00.s * (1 - at) + c10.s * at;
  const s1 = c01.s * (1 - at) + c11.s * at;

  return {
    h: lerpAngle(h0, h1, rt),
    s: s0 * (1 - rt) + s1 * rt,
  };
}

/**
 * Multi-color tint: map iris hues around the hole (angle + radius) onto the grayscale overlay.
 * Template shading (luminosity) stays; hue/sat vary like the real eye.
 */
export function tintGrayscaleTemplateMulti(
  grayscale: HTMLImageElement,
  iris: HTMLImageElement,
  hole: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
  cacheKey?: string
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not available.');

  const polar = extractIrisPolarHsMap(iris, cacheKey);
  const cx = (hole.x + hole.w / 2) * width;
  const cy = (hole.y + hole.h / 2) * height;
  const holeR = Math.max(1, (Math.min(hole.w * width, hole.h * height) / 2) * 0.92);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(grayscale, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = d[i + 3]!;
      if (a < 2) continue;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      // Outside the iris hole: map distance into iris radial bins (near hole = inner stroma, far = outer)
      const rNorm = Math.min(1, Math.max(0, (dist - holeR * 0.15) / (holeR * 2.8)));
      const hs = samplePolarHs(polar, angle, rNorm);

      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Match average-tint feel: pull L slightly toward the vividTint mid range via color-blend-like look
      // Keep grayscale luminosity (structure), apply local iris H/S
      const out = hslToRgb(hs.h, hs.s, lum);
      d[i] = out.r;
      d[i + 1] = out.g;
      d[i + 2] = out.b;
    }
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
      if (template.multiColorTint) {
        const tinted = tintGrayscaleTemplateMulti(
          overlay,
          iris,
          template.irisHole,
          width,
          height,
          textureUri
        );
        ctx.drawImage(tinted, 0, 0, width, height);
        return extractAverageIrisColor(iris, textureUri);
      }
      const irisColor = extractAverageIrisColor(iris, textureUri);
      const tinted = tintGrayscaleTemplate(overlay, irisColor, width, height);
      ctx.drawImage(tinted, 0, 0, width, height);
      return irisColor;
    }
    ctx.drawImage(overlay, 0, 0, width, height);
  }

  return null;
}
