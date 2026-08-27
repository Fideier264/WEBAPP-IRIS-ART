import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';

import type { ArtTemplate } from './artTemplates';
import { getArtTemplateHoles } from './artTemplates';

export type RgbColor = { r: number; g: number; b: number };

const irisColorCache = new Map<string, RgbColor>();

type Hs = { h: number; s: number; l: number };
/** polar[angleBin][radialBin] — ringWeights + hue shares for tint mixing */
type PolarHsMap = {
  angles: number;
  radials: number;
  cells: Hs[][];
  fallback: Hs;
  ringWeights: number[];
  /** Iris pixel share of secondary (non-dominant) hue — drives tint area */
  secondaryShare: number;
  primaryHs: Hs;
  secondaryHs: Hs;
  /** Per radial ring: belongs to secondary hue family */
  ringIsSecondary: boolean[];
};

const irisPolarCache = new Map<string, PolarHsMap>();

const MULTI_ANGLE_BINS = 64;
const MULTI_RADIAL_BINS = 4;

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
  // Don't force high sat on dark/low-chroma eyes (looks copper/orange vs brown iris)
  s = Math.min(0.62, Math.max(0.06, s * 1.05));
  l = Math.min(0.46, Math.max(0.22, l));
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

function hueDist(a: number, b: number): number {
  let d = Math.abs(b - a) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function isWarmHue(h: number): boolean {
  const hh = ((h % 360) + 360) % 360;
  return hh <= 75 || hh >= 330;
}

function isCoolHue(h: number): boolean {
  const hh = ((h % 360) + 360) % 360;
  return hh >= 155 && hh <= 275;
}

/**
 * Build a polar hue/sat map from the iris (angular wedges × radial rings).
 * Equal-ish pixel weights (no sat bias) so blue outer rings aren't drowned by amber flecks.
 */
export function extractIrisPolarHsMap(
  iris: HTMLImageElement,
  cacheKey?: string,
  angleBins = MULTI_ANGLE_BINS,
  radialBins = MULTI_RADIAL_BINS
): PolarHsMap {
  const fallbackHs: Hs = (() => {
    const hsl = rgbToHsl(140, 105, 75);
    return { h: hsl.h, s: Math.min(0.55, hsl.s), l: hsl.l };
  })();
  const evenWeights = Array.from({ length: radialBins }, () => 1 / radialBins);
  const emptyRingFlags = Array.from({ length: radialBins }, () => false);
  const emptyMap = (): PolarHsMap => ({
    angles: angleBins,
    radials: radialBins,
    cells: Array.from({ length: angleBins }, () =>
      Array.from({ length: radialBins }, () => ({ ...fallbackHs }))
    ),
    fallback: fallbackHs,
    ringWeights: evenWeights,
    secondaryShare: 0,
    primaryHs: fallbackHs,
    secondaryHs: fallbackHs,
    ringIsSecondary: emptyRingFlags,
  });

  const cacheId = cacheKey ? `polar6:${angleBins}x${radialBins}:${cacheKey}` : undefined;
  if (cacheId) {
    const hit = irisPolarCache.get(cacheId);
    if (hit) return hit;
  }

  const iw = iris.naturalWidth || iris.width;
  const ih = iris.naturalHeight || iris.height;
  if (!iw || !ih) return emptyMap();

  const maxSide = 400;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));
  const sample = document.createElement('canvas');
  sample.width = sw;
  sample.height = sh;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) return emptyMap();

  ctx.drawImage(iris, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);
  const cx = (sw - 1) / 2;
  const cy = (sh - 1) / 2;
  // Use min dimension so a circular iris in a square crop maps cleanly
  const maxR = Math.min(cx, cy);

  const sums = Array.from({ length: angleBins }, () =>
    Array.from({ length: radialBins }, () => ({ r: 0, g: 0, b: 0, w: 0 }))
  );

  let warmMass = 0;
  let coolMass = 0;
  let warmR = 0;
  let warmG = 0;
  let warmB = 0;
  let coolR = 0;
  let coolG = 0;
  let coolB = 0;

  const rInner = 0.14; // skip pupil
  const rOuter = 0.92; // skip black frame

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const a = data[i + 3]!;
      if (a < 16) continue;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy) / maxR;
      if (dist < rInner || dist > rOuter) continue;

      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max < 28 || min > 250) continue;

      // Balanced weight: do NOT favor high-sat amber over cool blue-grey stroma
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 18) continue;
      const weight = a / 255;
      if (weight <= 0) continue;

      const hslPx = rgbToHsl(r, g, b);
      if (isWarmHue(hslPx.h)) {
        warmMass += weight;
        warmR += r * weight;
        warmG += g * weight;
        warmB += b * weight;
      } else if (isCoolHue(hslPx.h)) {
        coolMass += weight;
        coolR += r * weight;
        coolG += g * weight;
        coolB += b * weight;
      }

      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;
      const aBin = Math.min(angleBins - 1, Math.floor((ang / (Math.PI * 2)) * angleBins));
      const rNorm = Math.min(1, Math.max(0, (dist - rInner) / (rOuter - rInner)));
      const rBin = Math.min(radialBins - 1, Math.floor(rNorm * radialBins));

      const cell = sums[aBin]![rBin]!;
      cell.r += r * weight;
      cell.g += g * weight;
      cell.b += b * weight;
      cell.w += weight;
    }
  }

  // Per-radial-ring fallback (preserves amber inner vs blue outer better than one global mean)
  const ringFb: Hs[] = Array.from({ length: radialBins }, (_, ri) => {
    let rr = 0;
    let gg = 0;
    let bb = 0;
    let ww = 0;
    for (let ai = 0; ai < angleBins; ai++) {
      const cell = sums[ai]![ri]!;
      rr += cell.r;
      gg += cell.g;
      bb += cell.b;
      ww += cell.w;
    }
    if (ww < 1e-6) return { ...fallbackHs };
    const hsl = rgbToHsl(Math.round(rr / ww), Math.round(gg / ww), Math.round(bb / ww));
    return { h: hsl.h, s: Math.min(0.6, hsl.s), l: hsl.l };
  });

  const cells: Hs[][] = Array.from({ length: angleBins }, (_, ai) =>
    Array.from({ length: radialBins }, (_, ri) => {
      const cell = sums[ai]![ri]!;
      if (cell.w < 1e-6) return { ...ringFb[ri]! };
      const hsl = rgbToHsl(
        Math.round(cell.r / cell.w),
        Math.round(cell.g / cell.w),
        Math.round(cell.b / cell.w)
      );
      // Cool stroma: mild lift so blue-grey stays visible; warm tones stay close to iris
      const cool = hsl.h >= 170 && hsl.h <= 280;
      const sat = cool
        ? Math.min(0.58, Math.max(0.08, hsl.s * 1.22 + 0.03))
        : Math.min(0.58, Math.max(0.06, hsl.s * 0.98));
      return { h: hsl.h, s: sat, l: hsl.l };
    })
  );

  // Fill empty bins from angular neighbors in the SAME radial ring
  for (let ri = 0; ri < radialBins; ri++) {
    for (let ai = 0; ai < angleBins; ai++) {
      if (sums[ai]![ri]!.w >= 1e-6) continue;
      for (let d = 1; d < angleBins; d++) {
        const li = (ai - d + angleBins) % angleBins;
        const ri2 = (ai + d) % angleBins;
        if (sums[li]![ri]!.w >= 1e-6) {
          cells[ai]![ri] = { ...cells[li]![ri]! };
          break;
        }
        if (sums[ri2]![ri]!.w >= 1e-6) {
          cells[ai]![ri] = { ...cells[ri2]![ri]! };
          break;
        }
      }
    }
  }

  // Area share per ring → dominant iris color appears more often when mixed into overlay
  const ringMass = Array.from({ length: radialBins }, (_, ri) => {
    let ww = 0;
    for (let ai = 0; ai < angleBins; ai++) ww += sums[ai]![ri]!.w;
    return ww;
  });
  const massSum = ringMass.reduce((a, b) => a + b, 0);
  const ringWeights =
    massSum > 1e-6
      ? ringMass.map((w) => w / massSum)
      : Array.from({ length: radialBins }, () => 1 / radialBins);

  const hueTotal = warmMass + coolMass;
  let secondaryShare = 0;
  let primaryHs = ringFb[Math.floor(radialBins / 2)] ?? fallbackHs;
  let secondaryHs = primaryHs;
  let secondaryIsWarm = false;

  if (hueTotal > 1e-6 && warmMass > 1e-6 && coolMass > 1e-6) {
    if (warmMass <= coolMass) {
      secondaryShare = warmMass / hueTotal;
      secondaryIsWarm = true;
      secondaryHs = (() => {
        const hsl = rgbToHsl(Math.round(warmR / warmMass), Math.round(warmG / warmMass), Math.round(warmB / warmMass));
        return { h: hsl.h, s: Math.min(0.65, Math.max(0.1, hsl.s * 1.08)), l: hsl.l };
      })();
      primaryHs = (() => {
        const hsl = rgbToHsl(Math.round(coolR / coolMass), Math.round(coolG / coolMass), Math.round(coolB / coolMass));
        return { h: hsl.h, s: Math.min(0.6, hsl.s), l: hsl.l };
      })();
    } else {
      secondaryShare = coolMass / hueTotal;
      secondaryIsWarm = false;
      secondaryHs = (() => {
        const hsl = rgbToHsl(Math.round(coolR / coolMass), Math.round(coolG / coolMass), Math.round(coolB / coolMass));
        return { h: hsl.h, s: Math.min(0.6, hsl.s), l: hsl.l };
      })();
      primaryHs = (() => {
        const hsl = rgbToHsl(Math.round(warmR / warmMass), Math.round(warmG / warmMass), Math.round(warmB / warmMass));
        return { h: hsl.h, s: Math.min(0.65, Math.max(0.1, hsl.s * 1.08)), l: hsl.l };
      })();
    }
  }

  const ringIsSecondary = ringFb.map((hs) =>
    secondaryIsWarm ? isWarmHue(hs.h) : isCoolHue(hs.h)
  );

  const map: PolarHsMap = {
    angles: angleBins,
    radials: radialBins,
    cells,
    fallback: primaryHs,
    ringWeights,
    secondaryShare,
    primaryHs,
    secondaryHs,
    ringIsSecondary,
  };
  if (cacheId) irisPolarCache.set(cacheId, map);
  return map;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * t;
}

/**
 * Blend two iris tint hues without RGB/HSL lerp through mud (blue + amber → green).
 * Cool/warm pairs pick one hue per pixel; only s/l soften at boundaries.
 */
function blendHsForTint(a: Hs, b: Hs, t: number): Hs {
  const dist = hueDist(a.h, b.h);
  const warmCool =
    dist > 48 && ((isWarmHue(a.h) && isCoolHue(b.h)) || (isCoolHue(a.h) && isWarmHue(b.h)));

  if (warmCool) {
    const dom = t < 0.5 ? a : b;
    const sub = t < 0.5 ? b : a;
    const edge = Math.min(1, Math.abs(t - 0.5) * 5);
    return {
      h: dom.h,
      s: dom.s * edge + sub.s * (1 - edge) * 0.2,
      l: dom.l * edge + sub.l * (1 - edge) * 0.2,
    };
  }

  if (dist > 110) {
    return t < 0.5 ? a : b;
  }

  return lerpHs(a, b, t);
}

/** Map extracted H/S (+ optional L) to RGB for canvas `color` tint layer. */
function hsToTintRgb(hs: Hs): RgbColor {
  const warm = isWarmHue(hs.h);
  let s = hs.s;
  if (warm) s = Math.min(0.7, Math.max(0.1, s * 1.1));
  return vividTintColor(hslToRgb(hs.h, s, hs.l));
}

/** Deterministic 0..1 hash for spatial mixing (stable across renders). */
function hash01(n: number): number {
  let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Continuous ring index via area CDF — soft transitions between iris colors. */
function continuousRingIndex(weights: number[], u: number): number {
  const uu = Math.min(0.999999, Math.max(0, u));
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(1e-9, weights[i]!);
    const next = acc + w;
    if (uu <= next) {
      const local = (uu - acc) / w;
      return i + local;
    }
    acc = next;
  }
  return Math.max(0, weights.length - 1);
}

/** Angular lerp within one radial ring. */
function samplePolarHsAtRing(map: PolarHsMap, angleRad: number, rBin: number): Hs {
  let ang = angleRad;
  if (ang < 0) ang += Math.PI * 2;
  const aFloat = (ang / (Math.PI * 2)) * map.angles;
  const a0 = Math.floor(aFloat) % map.angles;
  const a1 = (a0 + 1) % map.angles;
  const at = aFloat - Math.floor(aFloat);
  const ri = Math.min(map.radials - 1, Math.max(0, Math.floor(rBin)));
  const c0 = map.cells[a0]![ri] ?? map.fallback;
  const c1 = map.cells[a1]![ri] ?? map.fallback;
  return {
    h: lerpAngle(c0.h, c1.h, at),
    s: c0.s * (1 - at) + c1.s * at,
    l: c0.l * (1 - at) + c1.l * at,
  };
}

function samplePolarHsFrac(map: PolarHsMap, angleRad: number, rFloat: number): Hs {
  const rClamped = Math.min(map.radials - 1.0001, Math.max(0, rFloat));
  const r0 = Math.floor(rClamped);
  const r1 = Math.min(map.radials - 1, r0 + 1);
  const rt = smoothstep(rClamped - r0);
  return blendHsForTint(
    samplePolarHsAtRing(map, angleRad, r0),
    samplePolarHsAtRing(map, angleRad, r1),
    rt
  );
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Continuous 0..1 value noise (bilinear + smoothstep) — no hard chunk edges. */
function valueNoise01(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = smoothstep(fx - x0);
  const sy = smoothstep(fy - y0);
  const n00 = hash01(x0 * 73856093 ^ y0 * 19349663 ^ seed);
  const n10 = hash01((x0 + 1) * 73856093 ^ y0 * 19349663 ^ seed);
  const n01 = hash01(x0 * 73856093 ^ (y0 + 1) * 19349663 ^ seed);
  const n11 = hash01((x0 + 1) * 73856093 ^ (y0 + 1) * 19349663 ^ seed);
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  return nx0 * (1 - sy) + nx1 * sy;
}

function lerpHs(a: Hs, b: Hs, t: number): Hs {
  return {
    h: lerpAngle(a.h, b.h, t),
    s: a.s * (1 - t) + b.s * t,
    l: a.l * (1 - t) + b.l * t,
  };
}

function samplePolarHsFromRings(
  map: PolarHsMap,
  angleRad: number,
  x: number,
  y: number,
  secondary: boolean
): Hs {
  const n1 =
    valueNoise01(x, y, 88, secondary ? 0x71 : 0x51) * 0.55 +
    valueNoise01(x, y, 41, secondary ? 0xb3 : 0xa3) * 0.30 +
    valueNoise01(x, y, 19, secondary ? 0x3c : 0x2c) * 0.15;
  const ringIdx = continuousRingIndex(map.ringWeights, n1);
  const ri = Math.min(map.radials - 1, Math.max(0, Math.floor(ringIdx)));
  if (map.ringIsSecondary[ri] === secondary) {
    return samplePolarHsFrac(map, angleRad, ringIdx);
  }
  // Snap to nearest ring of requested hue family
  let best = ri;
  let bestD = map.radials;
  for (let r = 0; r < map.radials; r++) {
    if (map.ringIsSecondary[r] !== secondary) continue;
    const d = Math.abs(r - ringIdx);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return samplePolarHsAtRing(map, angleRad, best);
}

/**
 * Soft mixed multi-color sample: secondary area share matches iris pixel proportions.
 */
function samplePolarHsMixed(map: PolarHsMap, angleRad: number, x: number, y: number): Hs {
  const pick = valueNoise01(x, y, 54, 0x99);

  if (map.secondaryShare >= 0.035 && pick < map.secondaryShare) {
    const local = samplePolarHsFromRings(map, angleRad, x, y, true);
    return blendHsForTint(map.secondaryHs, local, 0.35);
  }

  if (map.secondaryShare >= 0.035 && pick >= map.secondaryShare) {
    const local = samplePolarHsFromRings(map, angleRad, x, y, false);
    return blendHsForTint(map.primaryHs, local, 0.35);
  }

  const n1 =
    valueNoise01(x, y, 88, 0x51) * 0.55 +
    valueNoise01(x, y, 41, 0xa3) * 0.30 +
    valueNoise01(x, y, 19, 0x2c) * 0.15;
  const n2 =
    valueNoise01(x + 17, y - 9, 64, 0x77) * 0.6 + valueNoise01(x, y, 27, 0xe1) * 0.4;

  const hsA = samplePolarHsFrac(map, angleRad, continuousRingIndex(map.ringWeights, n1));
  const hsB = samplePolarHsFrac(map, angleRad, continuousRingIndex(map.ringWeights, n2));
  return blendHsForTint(hsA, hsB, smoothstep(valueNoise01(x, y, 54, 0x99)));
}

/**
 * Multi-color tint: scatter iris hues across the overlay (mixed, not inner→outer bands).
 * Ring colors are picked by iris area share so the dominant eye color leads.
 * Uses canvas `color` blend so shading matches the preferred single-tint look.
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
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available.');

  const polar = extractIrisPolarHsMap(iris, cacheKey);
  const cx = (hole.x + hole.w / 2) * width;
  const cy = (hole.y + hole.h / 2) * height;

  const colorLayer = document.createElement('canvas');
  colorLayer.width = width;
  colorLayer.height = height;
  const cctx = colorLayer.getContext('2d', { willReadFrequently: true });
  if (!cctx) throw new Error('Canvas 2D not available.');

  const colorImg = cctx.createImageData(width, height);
  const cd = colorImg.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const angle = Math.atan2(y - cy, x - cx);
      const hs = samplePolarHsMixed(polar, angle, x, y);
      const rgb = hsToTintRgb(hs);
      cd[i] = rgb.r;
      cd[i + 1] = rgb.g;
      cd[i + 2] = rgb.b;
      cd[i + 3] = 255;
    }
  }
  cctx.putImageData(colorImg, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(grayscale, 0, 0, width, height);
  ctx.globalCompositeOperation = 'color';
  ctx.drawImage(colorLayer, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(grayscale, 0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

export function drawIrisInSlot(
  ctx: CanvasRenderingContext2D,
  iris: HTMLImageElement,
  hole: { x: number; y: number; w: number; h: number },
  template: ArtTemplate,
  canvasW: number,
  canvasH: number,
  opts?: {
    /** Skip black slot fill (dual: fill once via canvas background). */
    skipSlotFill?: boolean;
    /** Soft exclusive region vs other hole centers (avoids double-paint). */
    otherCenters?: { cx: number; cy: number }[];
  }
) {
  const left = hole.x * canvasW;
  const top = hole.y * canvasH;
  const slotW = Math.max(1, hole.w * canvasW);
  const slotH = Math.max(1, hole.h * canvasH);
  const resizeMode = template.irisResizeMode ?? 'contain';
  const irisScale = template.irisScale ?? 1;
  const slotBg = template.irisSlotBackground ?? '#000000';
  const cx = left + slotW / 2;
  const cy = top + slotH / 2;

  if (!opts?.skipSlotFill) {
    ctx.fillStyle = slotBg;
    ctx.fillRect(left, top, slotW, slotH);
  }

  const iw = iris.naturalWidth || iris.width;
  const ih = iris.naturalHeight || iris.height;
  if (!iw || !ih) return;

  let scale = resizeMode === 'cover' ? Math.max(slotW / iw, slotH / ih) : Math.min(slotW / iw, slotH / ih);
  scale *= irisScale;

  const dw = iw * scale;
  const dh = ih * scale;
  const dx = left + (slotW - dw) / 2;
  const dy = top + (slotH - dh) / 2;

  // Draw to offscreen so we can apply circular + Voronoi exclusivity
  const layer = document.createElement('canvas');
  layer.width = canvasW;
  layer.height = canvasH;
  const lctx = layer.getContext('2d');
  if (!lctx) return;

  lctx.save();
  lctx.beginPath();
  if (hole.circular) {
    lctx.ellipse(cx, cy, slotW / 2, slotH / 2, 0, 0, Math.PI * 2);
  } else {
    lctx.rect(left, top, slotW, slotH);
  }
  lctx.clip();
  lctx.drawImage(iris, dx, dy, dw, dh);
  lctx.restore();

  const others = opts?.otherCenters;
  if (others && others.length > 0) {
    const img = lctx.getImageData(0, 0, canvasW, canvasH);
    const d = img.data;
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        const i = (y * canvasW + x) * 4;
        if (d[i + 3]! < 1) continue;
        const myD = Math.hypot(x - cx, y - cy);
        let closerToOther = false;
        for (const o of others) {
          if (Math.hypot(x - o.cx, y - o.cy) + 0.5 < myD) {
            closerToOther = true;
            break;
          }
        }
        if (closerToOther) d[i + 3] = 0;
      }
    }
    lctx.putImageData(img, 0, 0);
  }

  ctx.drawImage(layer, 0, 0);
}

type DualTintSlot = {
  iris: HTMLImageElement;
  hole: { x: number; y: number; w: number; h: number };
  cacheKey?: string;
  color: RgbColor;
};

/**
 * Dual/multi-eye tint: each overlay region near a hole gets that iris's color
 * (soft Voronoi blend so the midline isn't harsh).
 */
export function tintGrayscaleTemplateDual(
  grayscale: HTMLImageElement,
  slots: DualTintSlot[],
  width: number,
  height: number,
  multiColor: boolean
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available.');

  if (slots.length === 0) {
    ctx.drawImage(grayscale, 0, 0, width, height);
    return canvas;
  }
  if (slots.length === 1) {
    const s = slots[0]!;
    if (multiColor) {
      return tintGrayscaleTemplateMulti(grayscale, s.iris, s.hole, width, height, s.cacheKey);
    }
    return tintGrayscaleTemplate(grayscale, s.color, width, height);
  }

  const centers = slots.map((s) => {
    const cx = (s.hole.x + s.hole.w / 2) * width;
    const cy = (s.hole.y + s.hole.h / 2) * height;
    const r = Math.max(1, (Math.min(s.hole.w * width, s.hole.h * height) / 2) * 0.95);
    return { cx, cy, r, slot: s };
  });

  // Narrow soft seam so each side clearly keeps its own iris color
  const blend = Math.hypot(width, height) * 0.04;

  const colorLayer = document.createElement('canvas');
  colorLayer.width = width;
  colorLayer.height = height;
  const cctx = colorLayer.getContext('2d', { willReadFrequently: true });
  if (!cctx) throw new Error('Canvas 2D not available.');
  const colorImg = cctx.createImageData(width, height);
  const cd = colorImg.data;

  const polarMaps = multiColor
    ? slots.map((s) => extractIrisPolarHsMap(s.iris, s.cacheKey))
    : null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      let w0 = 1;
      let w1 = 0;
      if (centers.length === 2) {
        const d0 = Math.hypot(x - centers[0]!.cx, y - centers[0]!.cy);
        const d1 = Math.hypot(x - centers[1]!.cx, y - centers[1]!.cy);
        // Closer to hole 0 → high w0 (was inverted before)
        const edge = smoothstep(0.5 + (d0 - d1) / (2 * Math.max(1, blend)));
        w0 = 1 - edge;
        w1 = edge;
      } else {
        // Fallback: nearest center wins with soft falloff
        const dists = centers.map((c) => Math.hypot(x - c.cx, y - c.cy));
        const nearest = dists.indexOf(Math.min(...dists));
        w0 = nearest === 0 ? 1 : 0;
        w1 = nearest === 1 ? 1 : 0;
      }

      const weights = centers.length === 2 ? [w0, w1] : centers.map((_, si) => (si === 0 ? w0 : w1));
      // For >2, pick nearest
      if (centers.length > 2) {
        const dists = centers.map((c) => Math.hypot(x - c.cx, y - c.cy));
        const nearest = dists.indexOf(Math.min(...dists));
        for (let si = 0; si < centers.length; si++) weights[si] = si === nearest ? 1 : 0;
      }

      let hs: Hs | null = null;
      if (polarMaps) {
        const hsList: Hs[] = [];
        const wList: number[] = [];
        for (let si = 0; si < slots.length; si++) {
          const wt = weights[si] ?? 0;
          if (wt < 1e-6) continue;
          const c = centers[si]!;
          const angle = Math.atan2(y - c.cy, x - c.cx);
          hsList.push(samplePolarHsMixed(polarMaps[si]!, angle, x, y));
          wList.push(wt);
        }
        if (hsList.length === 1) hs = hsList[0]!;
        else if (hsList.length === 2) {
          const wSum = wList[0]! + wList[1]!;
          hs = blendHsForTint(hsList[0]!, hsList[1]!, wList[1]! / Math.max(1e-6, wSum));
        } else if (hsList.length > 2) {
          let merged = hsList[0]!;
          let acc = wList[0]!;
          for (let k = 1; k < hsList.length; k++) {
            const t = acc / (acc + wList[k]!);
            merged = blendHsForTint(merged, hsList[k]!, t);
            acc += wList[k]!;
          }
          hs = merged;
        }
      }

      let r = 0;
      let g = 0;
      let b = 0;
      if (hs) {
        const rgb = hsToTintRgb(hs);
        r = rgb.r;
        g = rgb.g;
        b = rgb.b;
      } else {
        let wSum = 0;
        for (let si = 0; si < slots.length; si++) {
          const wt = weights[si] ?? 0;
          if (wt < 1e-6) continue;
          wSum += wt;
          const rgb = vividTintColor(slots[si]!.color);
          r += rgb.r * wt;
          g += rgb.g * wt;
          b += rgb.b * wt;
        }
        const inv = wSum > 0 ? 1 / wSum : 1;
        r = Math.round(r * inv);
        g = Math.round(g * inv);
        b = Math.round(b * inv);
      }
      cd[i] = Math.round(r);
      cd[i + 1] = Math.round(g);
      cd[i + 2] = Math.round(b);
      cd[i + 3] = 255;
    }
  }
  cctx.putImageData(colorImg, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(grayscale, 0, 0, width, height);
  ctx.globalCompositeOperation = 'color';
  ctx.drawImage(colorLayer, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(grayscale, 0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Paint iris + dynamically tinted grayscale template into an existing canvas context. */
export async function paintArtComposite(
  ctx: CanvasRenderingContext2D,
  opts: {
    textureUri: string;
    /** Second iris for dual-eye templates */
    textureUri2?: string;
    template: ArtTemplate;
    width: number;
    height: number;
    background?: string;
  }
): Promise<RgbColor | null> {
  const { textureUri, textureUri2, template, width, height, background = '#07060c' } = opts;
  const holes = getArtTemplateHoles(template);
  const textureUris = [textureUri, textureUri2].filter(
    (u): u is string => typeof u === 'string' && u.length > 0
  );

  const irisImages = await Promise.all(
    holes.map((_, i) => loadImage(textureUris[Math.min(i, textureUris.length - 1)] ?? textureUri))
  );
  const overlaySrc = template.overlayImage ? await resolveImageUrl(template.overlayImage) : null;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const holeCenters = holes.map((h) => ({
    cx: (h.x + h.w / 2) * width,
    cy: (h.y + h.h / 2) * height,
  }));

  for (let i = 0; i < holes.length; i++) {
    const others = holeCenters.filter((_, j) => j !== i);
    drawIrisInSlot(ctx, irisImages[i]!, holes[i]!, template, width, height, {
      skipSlotFill: holes.length > 1,
      otherCenters: holes.length > 1 ? others : undefined,
    });
  }

  if (overlaySrc) {
    const overlay = await loadImage(overlaySrc);
    if (template.tintWithIrisColor) {
      const slots: DualTintSlot[] = holes.map((hole, i) => {
        const iris = irisImages[i]!;
        const key = textureUris[Math.min(i, textureUris.length - 1)] ?? textureUri;
        return {
          iris,
          hole,
          cacheKey: key,
          color: extractAverageIrisColor(iris, key),
        };
      });
      const tinted = tintGrayscaleTemplateDual(
        overlay,
        slots,
        width,
        height,
        Boolean(template.multiColorTint)
      );
      ctx.drawImage(tinted, 0, 0, width, height);
      return slots[0]?.color ?? null;
    }
    ctx.drawImage(overlay, 0, 0, width, height);
  }

  return null;
}
