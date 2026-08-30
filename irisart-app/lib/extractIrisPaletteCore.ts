import { distSq, luma, rgbToHex, type RGB } from './color';

export type PaletteSwatch = { hex: string; weight: number };

type Bucket = { r: number; g: number; b: number; w: number };

const R_INNER = 0.26; // skip pupil + inner penumbra
const R_OUTER = 0.9;

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Prefer mid-iris stroma; down-weight inner shadow ring and outer limbal dark edge. */
function radialWeight(dist: number): number {
  if (dist < R_INNER || dist > R_OUTER) return 0;
  const t = (dist - R_INNER) / (R_OUTER - R_INNER);
  if (t < 0.08) return 0;
  if (t > 0.95) return 0.25;
  const center = 0.58;
  const sigma = 0.27;
  return Math.exp(-((t - center) ** 2) / (2 * sigma * sigma));
}

function isValidIrisPixel(r: number, g: number, b: number, a: number, dist: number): boolean {
  if (a < 20) return false;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (min > 245) return false;

  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = saturation(r, g, b);

  // Pupil, background void, deep shadow
  if (lum < 46 || max < 44) return false;

  // Grey/dark shadow blobs (common false positives)
  if (lum < 68 && sat < 0.13) return false;
  if (lum < 82 && sat < 0.07) return false;

  // Inner ring near pupil: require clearer pigment signal
  const t = (dist - R_INNER) / (R_OUTER - R_INNER);
  if (t < 0.18) {
    if (lum < 88 && sat < 0.16) return false;
    if (lum < 72) return false;
  }

  return true;
}

function pixelWeight(r: number, g: number, b: number, a: number, dist: number): number {
  const rw = radialWeight(dist);
  if (rw <= 0) return 0;

  const sat = saturation(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Favor readable iris pigment tones, not crushed shadows or blown highlights
  const lumScore =
    lum < 52 ? 0 : lum > 210 ? 0.35 : lum >= 95 && lum <= 175 ? 1 : lum < 95 ? (lum - 52) / 43 : 1 - (lum - 175) / 35;

  return (a / 255) * rw * lumScore * (0.45 + sat * 2.4);
}

function bucketKey(r: number, g: number, b: number): number {
  // Coarser buckets = fewer muddy near-duplicate shadows
  const rq = r >> 4;
  const gq = g >> 4;
  const bq = b >> 4;
  return (rq << 8) | (gq << 4) | bq;
}

function bucketToRgb(b: Bucket): RGB {
  return {
    r: Math.round(b.r / b.w),
    g: Math.round(b.g / b.w),
    b: Math.round(b.b / b.w),
  };
}

function isValidSwatch(rgb: RGB): boolean {
  const lum = luma(rgb);
  const sat = saturation(rgb.r, rgb.g, rgb.b);
  if (lum < 50) return false;
  if (lum < 74 && sat < 0.12) return false;
  if (lum < 90 && sat < 0.06) return false;
  return true;
}

function mergeSimilar(buckets: Bucket[], mergeDistSq = 38 * 38): Bucket[] {
  const sorted = [...buckets].sort((a, b) => b.w - a.w);
  const merged: Bucket[] = [];

  for (const b of sorted) {
    const rgb = bucketToRgb(b);
    if (!isValidSwatch(rgb)) continue;

    let hit = false;
    for (const m of merged) {
      if (distSq(rgb, bucketToRgb(m)) <= mergeDistSq) {
        m.r += b.r;
        m.g += b.g;
        m.b += b.b;
        m.w += b.w;
        hit = true;
        break;
      }
    }
    if (!hit) merged.push({ ...b });
  }
  return merged.sort((a, b) => b.w - a.w);
}

/**
 * Extract a weighted iris palette from RGBA pixels (annular iris region).
 * Filters pupil, shadows, and specular highlights; favors mid-iris pigment.
 */
export function extractPaletteFromRgba(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxColors = 8
): PaletteSwatch[] {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.min(cx, cy);

  const map = new Map<number, Bucket>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = data[i + 3]!;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy) / maxR;
      if (dist < R_INNER || dist > R_OUTER) continue;
      if (!isValidIrisPixel(r, g, b, a, dist)) continue;

      const w = pixelWeight(r, g, b, a, dist);
      if (w <= 0) continue;

      const key = bucketKey(r, g, b);
      const prev = map.get(key);
      if (prev) {
        prev.r += r * w;
        prev.g += g * w;
        prev.b += b * w;
        prev.w += w;
      } else {
        map.set(key, { r: r * w, g: g * w, b: b * w, w });
      }
    }
  }

  if (map.size === 0) {
    return [{ hex: '#8B7355', weight: 1 }];
  }

  let merged = mergeSimilar([...map.values()]);
  merged = merged.filter((b) => isValidSwatch(bucketToRgb(b)));

  if (merged.length === 0) {
    return [{ hex: '#8B7355', weight: 1 }];
  }

  const top = merged.slice(0, Math.max(5, Math.min(maxColors, 8)));
  const weightSum = top.reduce((s, b) => s + b.w, 0) || 1;

  return top.map((b) => {
    const rgb = bucketToRgb(b);
    return { hex: rgbToHex(rgb), weight: b.w / weightSum };
  });
}
