import * as FileSystem from '@/lib/platformFileSystem';

import { uploadTempImage } from './aiEnhance';
import { getArtTemplateById } from './artTemplates';
import { renderArtCompositeToLocalUri } from './renderArtComposite';

const ORDER_PRINT_TTL_SEC = 60 * 60 * 24 * 14;

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
  templateId: string;
  outputWidth?: number;
};

export type UploadCheckoutArtworkResult = {
  /** Signed HTTPS URL passed to Stripe / merchOne */
  printFileUrl: string;
  /** Supabase storage object path */
  storagePath: string;
};

/**
 * Renders the final iris + template artwork, uploads to Supabase Storage, returns a signed URL.
 */
export async function uploadCheckoutArtwork(
  input: UploadCheckoutArtworkInput
): Promise<UploadCheckoutArtworkResult> {
  const template = getArtTemplateById(input.templateId);
  if (!template) {
    throw new Error(`Unbekanntes Template „${input.templateId}“. Bitte im Shop erneut wählen.`);
  }

  const compositeUri = await renderArtCompositeToLocalUri({
    textureUri: input.textureUri,
    template,
    outputWidth: input.outputWidth ?? 2048,
  });

  const localUri = await ensureLocalFile(compositeUri);
  const { path, signedUrl } = await uploadTempImage(localUri, {
    signedUrlExpiresSec: ORDER_PRINT_TTL_SEC,
    storagePrefix: 'orders',
  });

  return { printFileUrl: signedUrl, storagePath: path };
}
