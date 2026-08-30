import * as ImageManipulator from 'expo-image-manipulator';
import { Buffer } from 'buffer';
import jpeg from 'jpeg-js';

import { extractPaletteFromRgba, type PaletteSwatch } from './extractIrisPaletteCore';

export type { PaletteSwatch };

const paletteCache = new Map<string, PaletteSwatch[]>();

async function uriToJpegRgba(uri: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const prepared = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512 } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.86, base64: true }
  );
  if (!prepared.base64) throw new Error('Could not read image for palette extraction.');
  const decoded = jpeg.decode(Buffer.from(prepared.base64, 'base64'), { useTArray: true });
  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error('Failed to decode image for palette extraction.');
  }
  return { data: decoded.data as Uint8Array, width: decoded.width, height: decoded.height };
}

/** Sample dominant iris colors from a generated/enhanced iris image URI. */
export async function extractIrisPaletteFromUri(uri: string, maxColors = 8): Promise<PaletteSwatch[]> {
  const key = `v2:${uri}|${maxColors}`;
  const hit = paletteCache.get(key);
  if (hit) return hit;

  const { data, width, height } = await uriToJpegRgba(uri);
  const palette = extractPaletteFromRgba(data, width, height, maxColors);
  paletteCache.set(key, palette);
  return palette;
}
