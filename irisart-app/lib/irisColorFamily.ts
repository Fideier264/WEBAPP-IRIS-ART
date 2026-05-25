import type { RGB } from './color';

/** Kategorien für Template-Filter (deine Overlays können mehrere setzen). */
export type EyeColorFamily = 'brown' | 'blue' | 'green' | 'hazel' | 'gray' | 'amber' | 'any';

function hexToRgb(hex: string): RGB | null {
  const s = hex.trim().replace('#', '');
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
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

/**
 * Heuristik aus dominanter Iris-HEX (und optional Palette) für Template-Filter.
 * Reihenfolge: spezifisch → allgemein; immer inkl. passender „any“-Templates über separaten Filter.
 */
export function inferEyeColorFamilies(primaryHex: string, paletteHexes?: string[]): EyeColorFamily[] {
  const rgb = hexToRgb(primaryHex);
  if (!rgb) return ['any'];

  const { h, s, l } = rgbToHsl(rgb);
  const out = new Set<EyeColorFamily>();

  // Sehr entsättigt / hell → grau
  if (s < 0.12 && l > 0.35 && l < 0.75) {
    out.add('gray');
  }
  if (l < 0.18 || l > 0.92) {
    out.add('gray');
  }

  // Blau / türkis
  if (h >= 185 && h <= 265 && s > 0.15) {
    out.add('blue');
  }

  // Grün
  if (h >= 85 && h <= 175 && s > 0.12) {
    out.add('green');
  }

  // Amber / Honig
  if (h >= 35 && h <= 55 && s > 0.35 && l > 0.35 && l < 0.65) {
    out.add('amber');
  }

  // Braun (warm, oft mittlere Sättigung)
  if (h >= 8 && h <= 55 && s > 0.12 && l < 0.55) {
    out.add('brown');
  }

  // Haselnuss: Grün-Gelb-Braun-Mix in Palette
  if (paletteHexes && paletteHexes.length >= 2) {
    const hsls = paletteHexes.map((hx) => hexToRgb(hx)).filter(Boolean).map((x) => rgbToHsl(x!));
    const hues = hsls.map((x) => x.h);
    const hasWarm = hues.some((hh) => hh >= 15 && hh <= 70);
    const hasCool = hues.some((hh) => hh >= 70 && hh <= 160);
    if (hasWarm && hasCool && s > 0.1) {
      out.add('hazel');
    }
  } else if ((h >= 40 && h <= 95 && s > 0.2 && l > 0.25 && l < 0.6) || (h >= 15 && h <= 50 && s > 0.18 && l > 0.35)) {
    out.add('hazel');
  }

  if (out.size === 0) {
    if (s < 0.2) out.add('gray');
    else if (h < 70) out.add('brown');
    else if (h < 200) out.add('green');
    else out.add('blue');
  }

  return [...out];
}

export function templateMatchesFamilies(
  templateFamilies: EyeColorFamily[],
  userFamilies: EyeColorFamily[]
): boolean {
  if (templateFamilies.includes('any')) return true;
  return userFamilies.some((f) => templateFamilies.includes(f));
}
