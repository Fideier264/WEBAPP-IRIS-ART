import { distSq, rgbToHex, type RGB } from './color';

export type PaletteSwatch = { hex: string; weight: number };

type Bucket = { r: number; g: number; b: number; w: number };

function isValidIrisPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 28) return false; // pupil / black background
  if (min > 248) return false; // specular highlight
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.06 && max < 55) return false; // near-black grey
  return true;
}

function pixelWeight(r: number, g: number, b: number, a: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (a / 255) * (0.35 + sat * 2.2) * Math.min(1, lum / 85 + 0.15);
}

function bucketKey(r: number, g: number, b: number): number {
  const rq = r >> 3;
  const gq = g >> 3;
  const bq = b >> 3;
  return (rq << 10) | (gq << 5) | bq;
}

function mergeSimilar(buckets: Bucket[], mergeDistSq = 42 * 42): Bucket[] {
  const sorted = [...buckets].sort((a, b) => b.w - a.w);
  const merged: Bucket[] = [];

  for (const b of sorted) {
    const rgb: RGB = {
      r: Math.round(b.r / b.w),
      g: Math.round(b.g / b.w),
      b: Math.round(b.b / b.w),
    };
    let hit = false;
    for (const m of merged) {
      const mr: RGB = {
        r: Math.round(m.r / m.w),
        g: Math.round(m.g / m.w),
        b: Math.round(m.b / m.w),
      };
      if (distSq(rgb, mr) <= mergeDistSq) {
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
 */
export function extractPaletteFromRgba(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxColors = 10
): PaletteSwatch[] {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.min(cx, cy);
  const rInner = 0.12;
  const rOuter = 0.9;

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
      if (dist < rInner || dist > rOuter) continue;
      if (!isValidIrisPixel(r, g, b, a)) continue;

      const w = pixelWeight(r, g, b, a);
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

  const merged = mergeSimilar([...map.values()]);
  const top = merged.slice(0, Math.max(6, maxColors));
  const weightSum = top.reduce((s, b) => s + b.w, 0) || 1;

  return top.map((b) => {
    const rgb: RGB = {
      r: Math.round(b.r / b.w),
      g: Math.round(b.g / b.w),
      b: Math.round(b.b / b.w),
    };
    return { hex: rgbToHex(rgb), weight: b.w / weightSum };
  });
}
