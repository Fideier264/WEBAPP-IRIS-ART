import { extractPaletteFromRgba, type PaletteSwatch } from './extractIrisPaletteCore';

export type { PaletteSwatch };

const paletteCache = new Map<string, PaletteSwatch[]>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let url = src;
      let revoke: string | undefined;
      try {
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
      img.src = url;
    })();
  });
}

/** Sample dominant iris colors from a generated/enhanced iris image URI (web canvas). */
export async function extractIrisPaletteFromUri(uri: string, maxColors = 10): Promise<PaletteSwatch[]> {
  const key = `${uri}|${maxColors}`;
  const hit = paletteCache.get(key);
  if (hit) return hit;

  const img = await loadImage(uri);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) throw new Error('Empty image for palette extraction.');

  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const sw = Math.max(1, Math.round(iw * scale));
  const sh = Math.max(1, Math.round(ih * scale));

  const sample = document.createElement('canvas');
  sample.width = sw;
  sample.height = sh;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D not available.');

  ctx.drawImage(img, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);
  const palette = extractPaletteFromRgba(data, sw, sh, maxColors);
  paletteCache.set(key, palette);
  return palette;
}
