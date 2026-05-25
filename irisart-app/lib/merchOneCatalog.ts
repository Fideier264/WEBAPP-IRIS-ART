/**
 * Native Checkout: Leinwand-Varianten → merchOne Blueprint-SKUs.
 *
 * Trage echte SKUs aus dem merchOne-Dashboard (Blueprint / Artikel) ein:
 *   EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM
 *   EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM
 *
 * Architektur: App sammelt Größe, Adresse, Bild-URL → Edge Function `create-merchone-order`
 * → merchOne API (Produktion/Versand). Zahlung erfolgt später separat (z. B. Stripe), bevor
 * oder nachdem die Order angelegt wird — je nach Geschäftslogik.
 */

export type CanvasProductOption = {
  id: string;
  label: string;
  /** merchOne product_sku (Blueprint mit Druckdatei über file.front.url) */
  sku: string;
};

function envSku(key: string): string {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

export function getCanvasProductOptions(): CanvasProductOption[] {
  const opts: CanvasProductOption[] = [];
  const s30 = envSku('EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM');
  const s60 = envSku('EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM');
  if (s30) opts.push({ id: 'canvas_30', label: '30 × 30 cm Leinwand', sku: s30 });
  if (s60) opts.push({ id: 'canvas_60', label: '60 × 60 cm Leinwand', sku: s60 });
  return opts;
}

export function hasConfiguredCanvasSkus(): boolean {
  return getCanvasProductOptions().length > 0;
}
