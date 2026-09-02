import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import { Buffer } from 'buffer';
import jpeg from 'jpeg-js';
import UPNG from 'upng-js';
import { Platform, type ImageSourcePropType } from 'react-native';

import * as FileSystem from '@/lib/platformFileSystem';

import type { RgbaImage } from './artTintShared';

export type { RgbaImage };

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

function normalizeInputUri(uri: string): string {
  let out = uri.trim();
  if (out.includes('%')) {
    try {
      out = decodeURIComponent(out);
    } catch {
      // keep original when not valid URI encoding
    }
  }
  return out;
}

function isRemoteUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

function isDataUri(uri: string): boolean {
  return uri.startsWith('data:');
}

/** RN `<Image>` on iOS often needs an explicit file:// prefix for cache paths. */
export function toImageDisplayUri(uri: string): string {
  if (Platform.OS === 'ios' && uri.startsWith('/') && !uri.startsWith('file://')) {
    return `file://${uri}`;
  }
  return uri;
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

async function ensureLocalUri(uri: string): Promise<string> {
  const normalized = normalizeInputUri(uri);
  if (isDataUri(normalized)) return normalized;
  if (isRemoteUri(normalized)) {
    const ext = normalized.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const dest = `${FileSystem.cacheDirectory}irisart_dl_${Date.now()}.${ext}`;
    const dl = await FileSystem.downloadAsync(normalized, dest);
    return dl.uri;
  }
  return normalized;
}

function isPngBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function decodePngRgba(bytes: Uint8Array): RgbaImage {
  const png = UPNG.decode(toArrayBuffer(bytes));
  const rgba = UPNG.toRGBA8(png);
  const data =
    rgba instanceof Uint8Array
      ? new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength)
      : new Uint8ClampedArray((rgba as ArrayBuffer[])[0]!);
  return { width: png.width, height: png.height, data };
}

function decodeJpegRgba(bytes: Uint8Array): RgbaImage {
  const decoded = jpeg.decode(Buffer.from(bytes), { useTArray: true });
  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error('Failed to decode JPEG image.');
  }
  const data = new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength);
  return { width: decoded.width, height: decoded.height, data };
}

function decodeImageBytes(bytes: Uint8Array): RgbaImage {
  return isPngBytes(bytes) ? decodePngRgba(bytes) : decodeJpegRgba(bytes);
}

function resizeRgbaNearest(src: RgbaImage, width: number, height: number): RgbaImage {
  if (src.width === width && src.height === height) return src;
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

async function loadRgbaViaManipulator(
  uri: string,
  targetWidth?: number,
  targetHeight?: number
): Promise<RgbaImage> {
  const localUri = await ensureLocalUri(uri);
  const actions =
    targetWidth && targetHeight
      ? [{ resize: { width: targetWidth, height: targetHeight } }]
      : [{ resize: { width: 1536 } }];
  const prepared = await ImageManipulator.manipulateAsync(localUri, actions, {
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.92,
    base64: true,
  });
  if (!prepared.base64) throw new Error(`Could not read image: ${uri.slice(0, 100)}`);
  return decodeJpegRgba(new Uint8Array(Buffer.from(prepared.base64, 'base64')));
}

/** Load RGBA from a local file URI. PNG alpha is preserved via upng-js. */
export async function loadRgbaFromUri(
  uri: string,
  targetWidth?: number,
  targetHeight?: number
): Promise<RgbaImage> {
  const normalized = normalizeInputUri(uri);

  if (isDataUri(normalized)) {
    const bytes = new Uint8Array(Buffer.from(dataUriToBase64(normalized), 'base64'));
    let img = decodeImageBytes(bytes);
    if (targetWidth && targetHeight) img = resizeRgbaNearest(img, targetWidth, targetHeight);
    return img;
  }

  const localUri = await ensureLocalUri(normalized);
  const lower = localUri.split('?')[0]?.toLowerCase() ?? '';
  const looksPng = lower.endsWith('.png');

  if (looksPng) {
    try {
      const bytes = await readUriBytes(localUri);
      let img = decodePngRgba(bytes);
      if (targetWidth && targetHeight) img = resizeRgbaNearest(img, targetWidth, targetHeight);
      return img;
    } catch {
      // Fall back to ImageManipulator for odd PNG paths on iOS.
    }
  }

  return loadRgbaViaManipulator(localUri, targetWidth, targetHeight);
}

/** Load RGBA from a URI string or bundled `require()` asset. */
export async function loadRgba(
  source: string | ImageSourcePropType,
  targetWidth?: number,
  targetHeight?: number
): Promise<RgbaImage> {
  const uri = await resolveImageUrl(source);
  return loadRgbaFromUri(uri, targetWidth, targetHeight);
}

export function encodeRgbaToJpegDataUri(image: RgbaImage, quality = 94): string {
  const rgba =
    image.data instanceof Uint8Array && image.data.constructor === Uint8Array
      ? image.data
      : new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  const encoded = jpeg.encode({ data: rgba, width: image.width, height: image.height }, quality);
  const base64 = Buffer.from(encoded.data).toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

export function decodeJpegDataUri(dataUri: string): RgbaImage {
  const comma = dataUri.indexOf(',');
  const base64 = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
  return decodeJpegRgba(new Uint8Array(Buffer.from(base64, 'base64')));
}

export function dataUriToBase64(dataUri: string): string {
  const comma = dataUri.indexOf(',');
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}

/** RN `<Image>` on iOS does not reliably render data-URI JPEGs — write to cache instead. */
export async function persistJpegDataUri(dataUri: string, cacheKey: string): Promise<string> {
  const base64 = dataUriToBase64(dataUri);
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  const fileUri = `${FileSystem.cacheDirectory}art_${safeKey}.jpg`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return toImageDisplayUri(fileUri);
}
