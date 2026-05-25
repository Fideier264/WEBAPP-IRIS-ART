import * as FileSystem from 'expo-file-system/legacy';

import { cropToEyeRectangle, cropToUserEyeRectangle, uploadTempImage } from './aiEnhance';
import { IRIS_NANO_BANANA_ART_STYLE, requestNanoBananaIris } from './inpaintApi';
import { upsertUserIris } from './userIrisLibrary';

const enhanceCacheByFingerprint = new Map<string, { outputUrl: string; seg: any }>();
const enhanceInflightByFingerprint = new Map<string, Promise<{ outputUrl: string; seg: any }>>();
const persistedEnhanceMap = new Map<string, string>();
let persistedLoaded = false;
// Bump cache version when pipeline/output format changes to avoid serving stale/non-AI cached crops.
const ENHANCE_CACHE_FILE = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}irisart_enhance_cache_v2.json`;

function roundedRectKey(rect?: { x: number; y: number; w: number; h: number }) {
  if (!rect) return 'auto';
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return `${r(rect.x)}:${r(rect.y)}:${r(rect.w)}:${r(rect.h)}`;
}

async function fileFingerprint(uri: string, extra?: string): Promise<string> {
  const info = (await FileSystem.getInfoAsync(uri, { md5: true } as any)) as any;
  const md5 = typeof info?.md5 === 'string' ? info.md5 : '';
  const size = typeof info?.size === 'number' ? String(info.size) : '0';
  return `${md5 || uri}|${size}|${extra ?? ''}`;
}

async function ensurePersistedEnhanceLoaded() {
  if (persistedLoaded) return;
  persistedLoaded = true;
  try {
    const info = await FileSystem.getInfoAsync(ENHANCE_CACHE_FILE);
    if (!info.exists) return;
    const raw = await FileSystem.readAsStringAsync(ENHANCE_CACHE_FILE);
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string') persistedEnhanceMap.set(k, v);
    }
  } catch {
    // ignore corrupted cache
  }
}

async function flushPersistedEnhance() {
  try {
    const obj = Object.fromEntries(persistedEnhanceMap.entries());
    await FileSystem.writeAsStringAsync(ENHANCE_CACHE_FILE, JSON.stringify(obj));
  } catch {
    // non-fatal
  }
}

export async function enhanceIrisTextureWithInpaint(
  photoUri: string,
  opts?: { cropRect?: { x: number; y: number; w: number; h: number } }
) {
  await ensurePersistedEnhanceLoaded();
  // New plan: send rectangle eye crop (incl. eyelid/brow) to Nano Banana 2.
  const croppedUri = opts?.cropRect
    ? await cropToUserEyeRectangle(photoUri, opts.cropRect)
    : await cropToEyeRectangle(photoUri);
  // Include pipeline version + artStyle in the cache key so older cached crops never shadow new Nano Banana outputs.
  const key = await fileFingerprint(
    croppedUri,
    `pipeline:v2|bg:black|style:${IRIS_NANO_BANANA_ART_STYLE}|rect:${roundedRectKey(opts?.cropRect)}`
  );

  const cached = enhanceCacheByFingerprint.get(key);
  if (cached) {
    return {
      outputUrl: cached.outputUrl,
      seg: {
        ...cached.seg,
        maskedImageUri: croppedUri,
        maskImageUri: croppedUri,
        cropUri: croppedUri,
      },
    };
  }

  const persistedOutput = persistedEnhanceMap.get(key);
  if (persistedOutput) {
    // Guard against legacy bad cache entries where output accidentally pointed at the crop itself.
    if (persistedOutput === croppedUri) {
      persistedEnhanceMap.delete(key);
      await flushPersistedEnhance();
    } else {
      const info = await FileSystem.getInfoAsync(persistedOutput);
      if (info.exists && (info.size ?? 0) > 0) {
        const res = {
          outputUrl: persistedOutput,
          seg: {
            maskedImageUri: croppedUri,
            maskImageUri: croppedUri,
            cropUri: croppedUri,
            circle: { cx: 0, cy: 0, r: 0 },
            size: 0,
          },
        };
        enhanceCacheByFingerprint.set(key, res);
        await upsertUserIris(res.outputUrl, key);
        return res;
      }
      persistedEnhanceMap.delete(key);
      await flushPersistedEnhance();
    }
  }

  let inflight = enhanceInflightByFingerprint.get(key);
  if (!inflight) {
    inflight = (async () => {
      const uploaded = await uploadTempImage(croppedUri);
      const generated = await requestNanoBananaIris({
        imageUrl: uploaded.signedUrl,
        backgroundMode: 'black',
        artStyle: IRIS_NANO_BANANA_ART_STYLE,
      });

      const ext = generated.mimeType?.includes('jpeg') ? 'jpg' : 'png';
      const outUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}iris_nanobanana_${Date.now()}.${ext}`;
      const base64Encoding =
        (FileSystem as any).EncodingType?.Base64 ?? (FileSystem as any).EncodingType?.base64 ?? 'base64';
      await FileSystem.writeAsStringAsync(outUri, generated.outputBase64, { encoding: base64Encoding as any });

      const info = await FileSystem.getInfoAsync(outUri);
      if (!info.exists || (info.size ?? 0) <= 0) {
        throw new Error('Nano Banana output image is empty.');
      }

      const res = {
        outputUrl: outUri,
        seg: {
          maskedImageUri: croppedUri,
          maskImageUri: croppedUri,
          cropUri: croppedUri,
          circle: { cx: 0, cy: 0, r: 0 },
          size: 0,
        },
      };
      enhanceCacheByFingerprint.set(key, res);
      persistedEnhanceMap.set(key, res.outputUrl);
      await flushPersistedEnhance();
      await upsertUserIris(res.outputUrl, key);
      return res;
    })()
      .finally(() => {
        enhanceInflightByFingerprint.delete(key);
      });
    enhanceInflightByFingerprint.set(key, inflight);
  }

  return inflight;
}

