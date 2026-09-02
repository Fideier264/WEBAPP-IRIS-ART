import type { ArtTemplate } from './artTemplates';
import type { IrisHoleNorm } from './artTemplates';

export type RgbColor = { r: number; g: number; b: number };
export type RgbaImage = { width: number; height: number; data: Uint8ClampedArray };

const irisColorCache = new Map<string, RgbColor>();

type Hs = { h: number; s: number; l: number };
type PolarHsMap = {
  angles: number;
  radials: number;
  cells: Hs[][];
  fallback: Hs;
  ringWeights: number[];
  secondaryShare: number;
  primaryHs: Hs;
  secondaryHs: Hs;
  ringIsSecondary: boolean[];
};

const irisPolarCache = new Map<string, PolarHsMap>();

const MULTI_ANGLE_BINS = 64;
const MULTI_RADIAL_BINS = 4;

export function parseCssColor(css: string): RgbColor {
  const s = css.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0], 16),
        g: parseInt(hex[1]! + hex[1], 16),
        b: parseInt(hex[2]! + hex[2], 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return { r: 0, g: 0, b: 0 };
}

export function createRgba(width: number, height: number, fill?: string): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) fillRgbaRect({ width, height, data }, 0, 0, width, height, fill);
  return { width, height, data };
}

export function fillRgbaRect(
  dest: RgbaImage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  const { r, g, b } = parseCssColor(color);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(dest.width, Math.ceil(x + w));
  const y1 = Math.min(dest.height, Math.ceil(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * dest.width + px) * 4;
      dest.data[i] = r;
      dest.data[i + 1] = g;
      dest.data[i + 2] = b;
      dest.data[i + 3] = 255;
    }
  }
}

export function resizeRgba(src: RgbaImage, width: number, height: number): RgbaImage {
  if (src.width === width && src.height === height) {
    return { width, height, data: new Uint8ClampedArray(src.data) };
  }
  const data = new Uint8ClampedArray(width * height * 4);
  const xRatio = src.width / width;
  const yRatio = src.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x * xRatio));
      const sy = Math.min(src.height - 1, Math.floor(y * yRatio));
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      data[di] = src.data[si]!;
      data[di + 1] = src.data[si + 1]!;
      data[di + 2] = src.data[si + 2]!;
      data[di + 3] = src.data[si + 3]!;
    }
  }
  return { width, height, data };
}

function sampleRgbaBilinear(src: RgbaImage, fx: number, fy: number): [number, number, number, number] {
  const x = Math.min(src.width - 1, Math.max(0, fx));
  const y = Math.min(src.height - 1, Math.max(0, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(src.width - 1, x0 + 1);
  const y1 = Math.min(src.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * src.width + x0) * 4;
  const i10 = (y0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + x0) * 4;
  const i11 = (y1 * src.width + x1) * 4;
  const out: number[] = [];
  for (let c = 0; c < 4; c++) {
    const v00 = src.data[i00 + c]!;
    const v10 = src.data[i10 + c]!;
    const v01 = src.data[i01 + c]!;
    const v11 = src.data[i11 + c]!;
    const v0 = v00 * (1 - tx) + v10 * tx;
    const v1 = v01 * (1 - tx) + v11 * tx;
    out[c] = Math.round(v0 * (1 - ty) + v1 * ty);
  }
  return [out[0]!, out[1]!, out[2]!, out[3]!];
}

/** Porter-Duff source-over composite of src onto dest in-place. */
export function blitRgbaOver(
  dest: RgbaImage,
  src: RgbaImage,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < Math.ceil(dh); y++) {
    const py = Math.floor(dy + y);
    if (py < 0 || py >= dest.height) continue;
    for (let x = 0; x < Math.ceil(dw); x++) {
      const px = Math.floor(dx + x);
      if (px < 0 || px >= dest.width) continue;
      const u = ((x + 0.5) / dw) * sw - 0.5;
      const v = ((y + 0.5) / dh) * sh - 0.5;
      const [sr, sg, sb, sa] = sampleRgbaBilinear(src, u, v);
      if (sa < 1) continue;
      const di = (py * dest.width + px) * 4;
      const saN = sa / 255;
      const daN = dest.data[di + 3]! / 255;
      const outA = saN + daN * (1 - saN);
      if (outA <= 0) continue;
      const invOut = 1 / outA;
      dest.data[di] = Math.round((sr * saN + dest.data[di]! * daN * (1 - saN)) * invOut);
      dest.data[di + 1] = Math.round((sg * saN + dest.data[di + 1]! * daN * (1 - saN)) * invOut);
      dest.data[di + 2] = Math.round((sb * saN + dest.data[di + 2]! * daN * (1 - saN)) * invOut);
      dest.data[di + 3] = Math.round(outA * 255);
    }
  }
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

export function vividTintColor(c: RgbColor): RgbColor {
  let { h, s, l } = rgbToHsl(c.r, c.g, c.b);
  s = Math.min(0.62, Math.max(0.06, s * 1.05));
  l = Math.min(0.46, Math.max(0.22, l));
  return hslToRgb(h, s, l);
}

export function matchTintColor(c: RgbColor): RgbColor {
  return vividTintColor(c);
}

function applyColorBlend(destR: number, destG: number, destB: number, src: RgbColor): RgbColor {
  const srcHsl = rgbToHsl(src.r, src.g, src.b);
  const destHsl = rgbToHsl(destR, destG, destB);
  return hslToRgb(srcHsl.h, srcHsl.s, destHsl.l);
}

function applyDestinationIn(
  r: number,
  g: number,
  b: number,
  a: number,
  maskA: number
): [number, number, number, number] {
  const ma = maskA / 255;
  return [Math.round(r * ma), Math.round(g * ma), Math.round(b * ma), Math.round(a * ma)];
}

export function extractAverageIrisColor(iris: RgbaImage, cacheKey?: string): RgbColor {
  const cacheId = cacheKey ? `v1:${cacheKey}` : undefined;
  if (cacheId) {
    const hit = irisColorCache.get(cacheId);
    if (hit) return hit;
  }

  const fallback = { r: 140, g: 105, b: 75 };
  const { width: iw, height: ih, data } = iris;
  if (!iw || !ih) return fallback;

  const maxSide = 256;
  const sample = iw > maxSide || ih > maxSide ? resizeRgba(iris, Math.max(1, Math.round(iw * Math.min(1, maxSide / Math.max(iw, ih)))), Math.max(1, Math.round(ih * Math.min(1, maxSide / Math.max(iw, ih))))) : iris;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let wSum = 0;

  for (let i = 0; i < sample.data.length; i += 4) {
    const a = sample.data[i + 3]!;
    if (a < 16) continue;
    const r = sample.data[i]!;
    const g = sample.data[i + 1]!;
    const b = sample.data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 36) continue;
    if (min > 245) continue;
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

export function extractIrisPolarHsMap(
  iris: RgbaImage,
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

  const cacheId = cacheKey ? `polar7:${angleBins}x${radialBins}:${cacheKey}` : undefined;
  if (cacheId) {
    const hit = irisPolarCache.get(cacheId);
    if (hit) return hit;
  }

  const iw = iris.width;
  const ih = iris.height;
  if (!iw || !ih) return emptyMap();

  const maxSide = 400;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));
  const sample = resizeRgba(iris, sw, sh);
  const data = sample.data;
  const cx = (sw - 1) / 2;
  const cy = (sh - 1) / 2;
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

  const rInner = 0.14;
  const rOuter = 0.92;

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
      const cool = hsl.h >= 170 && hsl.h <= 280;
      const sat = cool
        ? Math.min(0.58, Math.max(0.08, hsl.s * 1.22 + 0.03))
        : Math.min(0.58, Math.max(0.06, hsl.s * 0.98));
      return { h: hsl.h, s: sat, l: hsl.l };
    })
  );

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

function lerpHs(a: Hs, b: Hs, t: number): Hs {
  return {
    h: lerpAngle(a.h, b.h, t),
    s: a.s * (1 - t) + b.s * t,
    l: a.l * (1 - t) + b.l * t,
  };
}

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
  if (dist > 110) return t < 0.5 ? a : b;
  return lerpHs(a, b, t);
}

function hsToTintRgb(hs: Hs): RgbColor {
  const warm = isWarmHue(hs.h);
  let s = hs.s;
  if (warm) s = Math.min(0.7, Math.max(0.1, s * 1.1));
  return vividTintColor(hslToRgb(hs.h, s, hs.l));
}

function hash01(n: number): number {
  let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function continuousRingIndex(weights: number[], u: number): number {
  const uu = Math.min(0.999999, Math.max(0, u));
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(1e-9, weights[i]!);
    const next = acc + w;
    if (uu <= next) return i + (uu - acc) / w;
    acc = next;
  }
  return Math.max(0, weights.length - 1);
}

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

function snapRingToPrimary(map: PolarHsMap, ringIdx: number): number {
  const ri = Math.min(map.radials - 1, Math.max(0, Math.floor(ringIdx)));
  if (!map.ringIsSecondary[ri]) return ringIdx;
  let best = ri;
  let bestD = map.radials;
  for (let r = 0; r < map.radials; r++) {
    if (map.ringIsSecondary[r]) continue;
    const d = Math.abs(r - ringIdx);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best + (ringIdx - Math.floor(ringIdx));
}

function hueInSecondaryFamily(map: PolarHsMap, hs: Hs): boolean {
  if (map.secondaryShare < 0.04) return false;
  return isWarmHue(map.secondaryHs.h) ? isWarmHue(hs.h) : isCoolHue(hs.h);
}

function keepPrimaryHue(map: PolarHsMap, hs: Hs): Hs {
  if (!hueInSecondaryFamily(map, hs)) return hs;
  return blendHsForTint(map.primaryHs, hs, 0.18);
}

function samplePolarHsMixed(
  map: PolarHsMap,
  angleRad: number,
  x: number,
  y: number,
  includeSecondary = true
): Hs {
  const n1 =
    valueNoise01(x, y, 88, 0x51) * 0.55 +
    valueNoise01(x, y, 41, 0xa3) * 0.30 +
    valueNoise01(x, y, 19, 0x2c) * 0.15;
  const n2 =
    valueNoise01(x + 17, y - 9, 64, 0x77) * 0.6 + valueNoise01(x, y, 27, 0xe1) * 0.4;

  let ringA = continuousRingIndex(map.ringWeights, n1);
  let ringB = continuousRingIndex(map.ringWeights, n2);
  if (!includeSecondary) {
    ringA = snapRingToPrimary(map, ringA);
    ringB = snapRingToPrimary(map, ringB);
  }

  let hsA = samplePolarHsFrac(map, angleRad, ringA);
  let hsB = samplePolarHsFrac(map, angleRad, ringB);
  if (!includeSecondary) {
    hsA = keepPrimaryHue(map, hsA);
    hsB = keepPrimaryHue(map, hsB);
  }

  let mixed = blendHsForTint(hsA, hsB, smoothstep(valueNoise01(x, y, 54, 0x99)));

  if (includeSecondary && map.secondaryShare >= 0.04) {
    const lean =
      valueNoise01(x, y, 96, 0xaa) * 0.55 + valueNoise01(x, y, 37, 0xbb) * 0.45;
    const secondaryLean = smoothstep(lean) * Math.min(0.5, map.secondaryShare * 1.25);
    mixed = blendHsForTint(mixed, map.secondaryHs, secondaryLean);
  }

  return mixed;
}

export function tintGrayscaleTemplate(
  grayscale: RgbaImage,
  color: RgbColor,
  width: number,
  height: number
): RgbaImage {
  const gray = resizeRgba(grayscale, width, height);
  const tint = vividTintColor(color);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const oi = i * 4;
    const gr = gray.data[oi]!;
    const gg = gray.data[oi + 1]!;
    const gb = gray.data[oi + 2]!;
    const ga = gray.data[oi + 3]!;
    const blended = applyColorBlend(gr, gg, gb, tint);
    const [r, g, b, a] = applyDestinationIn(blended.r, blended.g, blended.b, 255, ga);
    data[oi] = r;
    data[oi + 1] = g;
    data[oi + 2] = b;
    data[oi + 3] = a;
  }

  return { width, height, data };
}

export function tintGrayscaleTemplateMulti(
  grayscale: RgbaImage,
  iris: RgbaImage,
  hole: IrisHoleNorm,
  width: number,
  height: number,
  cacheKey?: string,
  includeSecondary = true
): RgbaImage {
  const gray = resizeRgba(grayscale, width, height);
  const polar = extractIrisPolarHsMap(iris, cacheKey);
  const cx = (hole.x + hole.w / 2) * width;
  const cy = (hole.y + hole.h / 2) * height;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const angle = Math.atan2(y - cy, x - cx);
      const hs = samplePolarHsMixed(polar, angle, x, y, includeSecondary);
      const rgb = hsToTintRgb(hs);
      const gr = gray.data[i]!;
      const gg = gray.data[i + 1]!;
      const gb = gray.data[i + 2]!;
      const ga = gray.data[i + 3]!;
      const blended = applyColorBlend(gr, gg, gb, rgb);
      const [r, g, b, a] = applyDestinationIn(blended.r, blended.g, blended.b, 255, ga);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }

  return { width, height, data };
}

type DualTintSlot = {
  iris: RgbaImage;
  hole: IrisHoleNorm;
  cacheKey?: string;
  color: RgbColor;
};

export function tintGrayscaleTemplateDual(
  grayscale: RgbaImage,
  slots: DualTintSlot[],
  width: number,
  height: number,
  multiColor: boolean,
  includeSecondary = true
): RgbaImage {
  const gray = resizeRgba(grayscale, width, height);

  if (slots.length === 0) return gray;
  if (slots.length === 1) {
    const s = slots[0]!;
    if (multiColor) {
      return tintGrayscaleTemplateMulti(grayscale, s.iris, s.hole, width, height, s.cacheKey, includeSecondary);
    }
    return tintGrayscaleTemplate(grayscale, s.color, width, height);
  }

  const centers = slots.map((s) => {
    const cx = (s.hole.x + s.hole.w / 2) * width;
    const cy = (s.hole.y + s.hole.h / 2) * height;
    return { cx, cy, slot: s };
  });

  const blend = Math.hypot(width, height) * 0.04;
  const polarMaps = multiColor
    ? slots.map((s) => extractIrisPolarHsMap(s.iris, s.cacheKey))
    : null;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      let w0 = 1;
      let w1 = 0;
      if (centers.length === 2) {
        const d0 = Math.hypot(x - centers[0]!.cx, y - centers[0]!.cy);
        const d1 = Math.hypot(x - centers[1]!.cx, y - centers[1]!.cy);
        const edge = smoothstep(0.5 + (d0 - d1) / (2 * Math.max(1, blend)));
        w0 = 1 - edge;
        w1 = edge;
      } else {
        const dists = centers.map((c) => Math.hypot(x - c.cx, y - c.cy));
        const nearest = dists.indexOf(Math.min(...dists));
        w0 = nearest === 0 ? 1 : 0;
        w1 = nearest === 1 ? 1 : 0;
      }

      const weights = centers.length === 2 ? [w0, w1] : centers.map((_, si) => (si === 0 ? w0 : w1));
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
          hsList.push(samplePolarHsMixed(polarMaps[si]!, angle, x, y, includeSecondary));
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

      const gr = gray.data[i]!;
      const gg = gray.data[i + 1]!;
      const gb = gray.data[i + 2]!;
      const ga = gray.data[i + 3]!;
      const blended = applyColorBlend(gr, gg, gb, { r: Math.round(r), g: Math.round(g), b: Math.round(b) });
      const [or, og, ob, oa] = applyDestinationIn(blended.r, blended.g, blended.b, 255, ga);
      data[i] = or;
      data[i + 1] = og;
      data[i + 2] = ob;
      data[i + 3] = oa;
    }
  }

  return { width, height, data };
}

export function drawIrisInSlot(
  dest: RgbaImage,
  iris: RgbaImage,
  hole: IrisHoleNorm,
  template: ArtTemplate,
  canvasW: number,
  canvasH: number,
  opts?: {
    skipSlotFill?: boolean;
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

  if (!opts?.skipSlotFill) fillRgbaRect(dest, left, top, slotW, slotH, slotBg);

  const iw = iris.width;
  const ih = iris.height;
  if (!iw || !ih) return;

  let scale =
    resizeMode === 'cover' ? Math.max(slotW / iw, slotH / ih) : Math.min(slotW / iw, slotH / ih);
  scale *= irisScale;

  const dw = iw * scale;
  const dh = ih * scale;
  const dx = left + (slotW - dw) / 2;
  const dy = top + (slotH - dh) / 2;

  const layer = createRgba(canvasW, canvasH);
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(canvasW, Math.ceil(left + slotW));
  const y1 = Math.min(canvasH, Math.ceil(top + slotH));
  const circular = hole.circular ?? false;
  const rx = slotW / 2;
  const ry = slotH / 2;

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      if (circular) {
        const ex = (px + 0.5 - cx) / rx;
        const ey = (py + 0.5 - cy) / ry;
        if (ex * ex + ey * ey > 1) continue;
      }
      const u = ((px + 0.5 - dx) / dw) * iw - 0.5;
      const v = ((py + 0.5 - dy) / dh) * ih - 0.5;
      if (u < -0.5 || v < -0.5 || u > iw - 0.5 || v > ih - 0.5) continue;
      const [sr, sg, sb, sa] = sampleRgbaBilinear(iris, u, v);
      if (sa < 1) continue;
      const li = (py * canvasW + px) * 4;
      layer.data[li] = sr;
      layer.data[li + 1] = sg;
      layer.data[li + 2] = sb;
      layer.data[li + 3] = sa;
    }
  }

  const others = opts?.otherCenters;
  if (others && others.length > 0) {
    for (let py = 0; py < canvasH; py++) {
      for (let px = 0; px < canvasW; px++) {
        const i = (py * canvasW + px) * 4;
        if (layer.data[i + 3]! < 1) continue;
        const myD = Math.hypot(px - cx, py - cy);
        let closerToOther = false;
        for (const o of others) {
          if (Math.hypot(px - o.cx, py - o.cy) + 0.5 < myD) {
            closerToOther = true;
            break;
          }
        }
        if (closerToOther) layer.data[i + 3] = 0;
      }
    }
  }

  blitRgbaOver(dest, layer, 0, 0, canvasW, canvasH);
}
