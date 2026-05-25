import * as FileSystem from '@/lib/platformFileSystem';

import { uploadTempImage } from './aiEnhance';

/**
 * Stabile HTTPS-URL für merchOne (Download bei Produktion). 14 Tage Signed URL.
 */
export async function uploadOrderPrintFile(localOrRemoteUri: string): Promise<string> {
  let localUri = localOrRemoteUri;
  if (localOrRemoteUri.startsWith('http://') || localOrRemoteUri.startsWith('https://')) {
    const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    const target = `${base}order_print_${Date.now()}.jpg`;
    const dl = await FileSystem.downloadAsync(localOrRemoteUri, target);
    localUri = dl.uri;
  }

  const { signedUrl } = await uploadTempImage(localUri, {
    signedUrlExpiresSec: 60 * 60 * 24 * 14,
  });
  return signedUrl;
}
