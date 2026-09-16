import * as FileSystem from '@/lib/platformFileSystem';

import { uploadTempImage } from './aiEnhance';
import { getArtTemplateById } from './artTemplates';
import { renderArtCompositeToLocalUri } from './renderArtComposite';

const ORDER_PRINT_TTL_SEC = 60 * 60 * 24 * 14;
/** Print-ready long edge for MerchOne (high quality, prefetched during checkout form). */
export const CHECKOUT_PRINT_OUTPUT_WIDTH = 2048;

async function ensureLocalFile(localOrRemoteUri: string): Promise<string> {
  if (!localOrRemoteUri.startsWith('http://') && !localOrRemoteUri.startsWith('https://')) {
    return localOrRemoteUri;
  }
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const target = `${base}order_print_${Date.now()}.jpg`;
  const dl = await FileSystem.downloadAsync(localOrRemoteUri, target);
  return dl.uri;
}

/**
 * Stabile HTTPS-URL für merchOne (Download bei Produktion). 14 Tage Signed URL.
 */
export async function uploadOrderPrintFile(
  localOrRemoteUri: string,
  opts?: { signedUrlExpiresSec?: number }
): Promise<string> {
  const localUri = await ensureLocalFile(localOrRemoteUri);
  const { signedUrl } = await uploadTempImage(localUri, {
    signedUrlExpiresSec: opts?.signedUrlExpiresSec ?? ORDER_PRINT_TTL_SEC,
    storagePrefix: 'orders',
  });
  return signedUrl;
}

export type UploadCheckoutArtworkInput = {
  textureUri: string;
  /** Second iris for dual-eye templates */
  textureUri2?: string;
  templateId: string;
  outputWidth?: number;
  /** MerchOne product print aspect (width/height). Square canvas = 1. */
  printAspectRatio?: number;
  secondaryColorTint?: boolean;
};

export type UploadCheckoutArtworkResult = {
  /** Signed HTTPS URL passed to Stripe / merchOne */
  printFileUrl: string;
  /** Supabase storage object path */
  storagePath: string;
};

function artworkCacheKey(input: UploadCheckoutArtworkInput): string {
  return [
    input.textureUri,
    input.textureUri2 ?? '',
    input.templateId,
    String(input.printAspectRatio ?? 1),
    input.secondaryColorTint === false ? '0' : '1',
    String(input.outputWidth ?? CHECKOUT_PRINT_OUTPUT_WIDTH),
  ].join('\0');
}

type PrefetchEntry = {
  key: string;
  promise: Promise<UploadCheckoutArtworkResult>;
};

let activePrefetch: PrefetchEntry | null = null;

/**
 * Renders the final iris + template artwork, uploads to Supabase Storage, returns a signed URL.
 * Output dimensions match the MerchOne SKU aspect ratio (e.g. 1:1 for square canvas).
 */
export async function uploadCheckoutArtwork(
  input: UploadCheckoutArtworkInput
): Promise<UploadCheckoutArtworkResult> {
  const template = getArtTemplateById(input.templateId);
  if (!template) {
    throw new Error(`Unbekanntes Template „${input.templateId}“. Bitte im Shop erneut wählen.`);
  }

  const printAspectRatio =
    typeof input.printAspectRatio === 'number' && input.printAspectRatio > 0
      ? input.printAspectRatio
      : 1;

  const compositeUri = await renderArtCompositeToLocalUri({
    textureUri: input.textureUri,
    textureUri2: input.textureUri2,
    template,
    outputWidth: input.outputWidth ?? CHECKOUT_PRINT_OUTPUT_WIDTH,
    outputAspectRatio: printAspectRatio,
    secondaryColorTint: input.secondaryColorTint,
  });

  const localUri = await ensureLocalFile(compositeUri);
  const { path, signedUrl } = await uploadTempImage(localUri, {
    signedUrlExpiresSec: ORDER_PRINT_TTL_SEC,
    storagePrefix: 'orders',
  });

  return { printFileUrl: signedUrl, storagePath: path };
}

/**
 * Start or reuse an in-flight print render+upload while the user fills shipping fields.
 * Pay joins the same promise so the wait is usually already done.
 */
export function prefetchCheckoutArtwork(
  input: UploadCheckoutArtworkInput
): Promise<UploadCheckoutArtworkResult> {
  const normalized: UploadCheckoutArtworkInput = {
    ...input,
    outputWidth: input.outputWidth ?? CHECKOUT_PRINT_OUTPUT_WIDTH,
  };
  const key = artworkCacheKey(normalized);
  if (activePrefetch?.key === key) return activePrefetch.promise;

  const promise = uploadCheckoutArtwork(normalized).catch((err) => {
    if (activePrefetch?.key === key) activePrefetch = null;
    throw err;
  });
  activePrefetch = { key, promise };
  return promise;
}
