import * as ImageManipulator from 'expo-image-manipulator';

import * as FileSystem from '@/lib/platformFileSystem';
import { supabase } from './supabase';
import { Buffer } from 'buffer';

const TEMP_BUCKET = 'iris-temp';

function randomKey() {
  // URL-safe enough for temp paths
  return `${Date.now()}_${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

export async function cropToAlignmentSquare(uri: string) {
  const base = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
  const w = base.width ?? 0;
  const h = base.height ?? 0;
  if (!w || !h) throw new Error('Could not read image dimensions.');

  const size = Math.min(w, h);
  const originX = Math.max(0, Math.floor((w - size) / 2));
  const originY = Math.max(0, Math.floor((h - size) / 2));

  // Keep enough detail for AI; Replicate will upscale further
  const target = Math.min(768, size);
  const cropped = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: size, height: size } }, { resize: { width: target, height: target } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.92 }
  );

  return cropped.uri;
}

export async function cropToEyeRectangle(uri: string) {
  const base = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
  const w = base.width ?? 0;
  const h = base.height ?? 0;
  if (!w || !h) throw new Error('Could not read image dimensions.');

  // Rectangle guide for Nano Banana input:
  // include eyelid + brow area instead of a tight iris circle.
  const targetAspect = 4 / 3; // width / height
  let cropW = Math.min(w, Math.floor(h * targetAspect));
  let cropH = Math.floor(cropW / targetAspect);

  // If image is too narrow for chosen aspect, recompute by width.
  if (cropW > w) {
    cropW = w;
    cropH = Math.floor(cropW / targetAspect);
  }
  if (cropH > h) {
    cropH = h;
    cropW = Math.floor(cropH * targetAspect);
  }

  const originX = Math.max(0, Math.floor((w - cropW) / 2));
  // Shift up a bit so brow/upper lid are included.
  const centeredY = Math.floor((h - cropH) / 2);
  const originY = Math.max(0, Math.min(h - cropH, centeredY - Math.floor(cropH * 0.12)));

  const outW = Math.min(1024, cropW);
  const outH = Math.max(1, Math.floor(outW / targetAspect));

  const cropped = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: cropW, height: cropH } }, { resize: { width: outW, height: outH } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.92 }
  );

  return cropped.uri;
}

export async function cropToUserEyeRectangle(
  uri: string,
  rectNorm: { x: number; y: number; w: number; h: number }
) {
  const base = await ImageManipulator.manipulateAsync(uri, [], { base64: false });
  const w = base.width ?? 0;
  const h = base.height ?? 0;
  if (!w || !h) throw new Error('Could not read image dimensions.');

  // Match preview behavior: user adjusts crop inside centered square viewport.
  const sq = Math.min(w, h);
  const sqX = Math.max(0, Math.floor((w - sq) / 2));
  const sqY = Math.max(0, Math.floor((h - sq) / 2));

  const rx = Math.max(0, Math.min(1, rectNorm.x));
  const ry = Math.max(0, Math.min(1, rectNorm.y));
  const rw = Math.max(0.08, Math.min(1, rectNorm.w));
  const rh = Math.max(0.08, Math.min(1, rectNorm.h));

  const cropW = Math.max(8, Math.floor(sq * rw));
  const cropH = Math.max(8, Math.floor(sq * rh));
  const originX = Math.max(0, Math.min(w - cropW, sqX + Math.floor(sq * rx)));
  const originY = Math.max(0, Math.min(h - cropH, sqY + Math.floor(sq * ry)));

  const outW = Math.min(1024, cropW);
  const outH = Math.max(1, Math.floor((outW * cropH) / cropW));

  const cropped = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: cropW, height: cropH } }, { resize: { width: outW, height: outH } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.92 }
  );

  return cropped.uri;
}

export async function uploadTempImage(
  localUri: string,
  opts?: { signedUrlExpiresSec?: number }
) {
  // Avoid `fetch(file://...)` inconsistencies in React Native. Read as base64 and build a Blob.
  const contentType = localUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const fullPath = `temp/${randomKey()}.${ext}`;

  const base64Encoding = (FileSystem as any).EncodingType?.Base64 ?? (FileSystem as any).EncodingType?.base64 ?? 'base64';
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: base64Encoding as any });
  if (!base64 || typeof base64 !== 'string' || base64.length < 200) {
    throw new Error(`Local file appears empty (base64 length=${base64?.length ?? 0}).`);
  }

  // Upload using a Buffer (supported by supabase-js in RN environments).
  const fileBytes = Buffer.from(base64, 'base64');
  if (!fileBytes || (fileBytes as any).length === 0) {
    throw new Error('Decoded file bytes are empty.');
  }

  const upload = await supabase.storage.from(TEMP_BUCKET).upload(fullPath, fileBytes, {
    contentType,
    upsert: true,
  });
  if (upload.error) throw new Error(upload.error.message);

  // Signed URL so Replicate / externe Dienste (z. B. merchOne) die Datei per HTTPS laden können.
  const ttl = opts?.signedUrlExpiresSec ?? 60 * 10;
  const signed = await supabase.storage.from(TEMP_BUCKET).createSignedUrl(fullPath, ttl);
  if (signed.error) throw new Error(signed.error.message);
  if (!signed.data?.signedUrl) throw new Error('Failed to create signed URL.');

  return { path: fullPath, signedUrl: signed.data.signedUrl };
}

export async function requestReplicateEnhancement(imageUrl: string) {
  const invoke = await supabase.functions.invoke('iris-enhance', {
    body: { imageUrl, scale: 4, faceEnhance: false },
  });

  if (invoke.error) {
    // Supabase Functions errors often carry helpful context (status + body).
    const anyErr = invoke.error as any;
    const status =
      typeof anyErr?.context?.status === 'number'
        ? anyErr.context.status
        : typeof anyErr?.status === 'number'
          ? anyErr.status
          : undefined;
    const bodyText =
      typeof anyErr?.context?.body === 'string'
        ? anyErr.context.body
        : typeof anyErr?.context?.response === 'string'
          ? anyErr.context.response
          : undefined;

    const contextDump =
      anyErr?.context && typeof anyErr.context === 'object' ? JSON.stringify(anyErr.context, null, 2) : undefined;

    throw new Error(
      [
        `Edge function iris-enhance failed${status ? ` (HTTP ${status})` : ''}.`,
        anyErr?.message ? `Message: ${String(anyErr.message)}` : undefined,
        bodyText ? `Body: ${bodyText}` : undefined,
        contextDump ? `Context: ${contextDump}` : undefined,
      ].filter(Boolean).join('\n')
    );
  }
  const data = invoke.data as { outputUrl?: string; error?: string } | null;
  if (!data?.outputUrl) throw new Error(data?.error ?? 'Enhancement failed.');

  return data.outputUrl;
}

