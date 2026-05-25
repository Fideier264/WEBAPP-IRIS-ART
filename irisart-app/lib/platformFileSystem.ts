/**
 * Cross-platform file helpers. expo-file-system legacy APIs are unavailable on web.
 */
import { Platform } from 'react-native';
import * as ExpoFS from 'expo-file-system/legacy';

const isWeb = Platform.OS === 'web';

export const EncodingType = {
  Base64: 'base64' as const,
  UTF8: 'utf8' as const,
};

const WEB_CACHE_PREFIX = 'irisart-web-cache://';

const blobUrlByUri = new Map<string, string>();
const base64ByUri = new Map<string, string>();

function isJsonCachePath(uri: string) {
  return uri.endsWith('.json') && uri.includes('irisart_');
}

function storageKey(uri: string) {
  const name = uri.split('/').pop() ?? uri;
  return `irisart:fs:${name}`;
}

async function blobFromUri(uri: string): Promise<Blob> {
  const mapped = blobUrlByUri.get(uri);
  const fetchUri = mapped ?? uri;
  const res = await fetch(fetchUri);
  if (!res.ok) throw new Error(`Failed to read file (${res.status})`);
  return res.blob();
}

async function fingerprintFromBlob(blob: Blob): Promise<{ size: number; md5: string }> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const md5 = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { size: blob.size, md5 };
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function bytesFromBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)!;
  return bytes;
}

export const cacheDirectory = isWeb
  ? WEB_CACHE_PREFIX
  : (ExpoFS.cacheDirectory ?? ExpoFS.documentDirectory ?? '');

export const documentDirectory = isWeb
  ? WEB_CACHE_PREFIX
  : (ExpoFS.documentDirectory ?? ExpoFS.cacheDirectory ?? '');

export async function getInfoAsync(
  uri: string,
  options?: { md5?: boolean }
): Promise<{ exists: boolean; size?: number; md5?: string; uri?: string }> {
  if (!isWeb) {
    return (await ExpoFS.getInfoAsync(uri, options as any)) as {
      exists: boolean;
      size?: number;
      md5?: string;
      uri?: string;
    };
  }

  if (isJsonCachePath(uri)) {
    const raw = localStorage.getItem(storageKey(uri));
    const exists = raw != null;
    return { exists, size: raw?.length ?? 0, uri };
  }

  if (base64ByUri.has(uri) || blobUrlByUri.has(uri)) {
    const b64 = base64ByUri.get(uri);
    const size = b64 ? Math.floor((b64.length * 3) / 4) : 0;
    return {
      exists: size > 0,
      size,
      md5: options?.md5 ? b64?.slice(0, 32) : undefined,
      uri,
    };
  }

  try {
    const blob = await blobFromUri(uri);
    const fp = options?.md5 ? await fingerprintFromBlob(blob) : { size: blob.size, md5: '' };
    return { exists: blob.size > 0, size: fp.size, md5: fp.md5 || undefined, uri };
  } catch {
    return { exists: false, uri };
  }
}

export async function readAsStringAsync(
  uri: string,
  options?: { encoding?: string }
): Promise<string> {
  if (!isWeb) {
    return ExpoFS.readAsStringAsync(uri, options as any);
  }

  if (isJsonCachePath(uri)) {
    return localStorage.getItem(storageKey(uri)) ?? '';
  }

  const enc = options?.encoding;
  const wantsBase64 = enc === 'base64' || enc === EncodingType.Base64;

  if (wantsBase64) {
    const cached = base64ByUri.get(uri);
    if (cached) return cached;
    const blob = await blobFromUri(uri);
    const buf = await blob.arrayBuffer();
    return base64FromBytes(new Uint8Array(buf));
  }

  return localStorage.getItem(storageKey(uri)) ?? '';
}

export async function writeAsStringAsync(
  uri: string,
  contents: string,
  options?: { encoding?: string }
): Promise<void> {
  if (!isWeb) {
    return ExpoFS.writeAsStringAsync(uri, contents, options as any);
  }

  if (isJsonCachePath(uri)) {
    localStorage.setItem(storageKey(uri), contents);
    return;
  }

  const enc = options?.encoding;
  const isBase64 = enc === 'base64' || enc === EncodingType.Base64;

  if (isBase64) {
    const mime = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const bytes = bytesFromBase64(contents);
    const blob = new Blob([bytes], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    blobUrlByUri.set(uri, blobUrl);
    base64ByUri.set(uri, contents);
    return;
  }

  localStorage.setItem(storageKey(uri), contents);
}

export async function deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void> {
  if (!isWeb) {
    return ExpoFS.deleteAsync(uri, options as any);
  }

  if (isJsonCachePath(uri)) {
    localStorage.removeItem(storageKey(uri));
    return;
  }

  const blobUrl = blobUrlByUri.get(uri);
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrlByUri.delete(uri);
  base64ByUri.delete(uri);
}

export async function downloadAsync(
  fromUrl: string,
  toUri: string
): Promise<{ uri: string; status?: number; headers?: Record<string, string> }> {
  if (!isWeb) {
    return ExpoFS.downloadAsync(fromUrl, toUri) as Promise<{
      uri: string;
      status?: number;
      headers?: Record<string, string>;
    }>;
  }

  const res = await fetch(fromUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const base64 = base64FromBytes(new Uint8Array(buf));
  await writeAsStringAsync(toUri, base64, { encoding: EncodingType.Base64 });
  const displayUri = blobUrlByUri.get(toUri) ?? toUri;
  return { uri: displayUri, status: res.status };
}

/** URI suitable for <Image source={{ uri }} /> after a base64 write on web. */
export function resolveDisplayUri(uri: string): string {
  if (!isWeb) return uri;
  return blobUrlByUri.get(uri) ?? uri;
}
