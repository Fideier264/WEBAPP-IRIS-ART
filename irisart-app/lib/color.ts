export type RGB = { r: number; g: number; b: number };

export function clampByte(x: number) {
  return Math.max(0, Math.min(255, x | 0));
}

export function rgbToHex({ r, g, b }: RGB) {
  const rr = clampByte(r).toString(16).padStart(2, '0');
  const gg = clampByte(g).toString(16).padStart(2, '0');
  const bb = clampByte(b).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`.toUpperCase();
}

export function luma({ r, g, b }: RGB) {
  // Rec. 709
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function distSq(a: RGB, b: RGB) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

