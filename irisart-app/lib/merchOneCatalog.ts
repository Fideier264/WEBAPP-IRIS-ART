/**
 * Leinwand-Varianten → merchOne Blueprint-SKUs + Anzeige-Preise.
 *
 * SKUs:
 *   EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM
 *   EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM
 *
 * Anzeige-Preise (nicht vertrauenswürdig — echte Beträge setzt die Edge Function):
 *   EXPO_PUBLIC_PRICE_EUR_30CM=49.90
 *   EXPO_PUBLIC_PRICE_EUR_60CM=89.90
 *
 * Zahlung: Stripe Checkout (`create-checkout-session`) → Webhook → merchOne.
 */

export type CanvasProductOption = {
  id: string;
  label: string;
  /** merchOne product_sku (Blueprint mit Druckdatei über file.front.url) */
  sku: string;
  /** Display-only EUR amount from public env */
  priceEur?: number;
  priceLabel?: string;
};

function envSku(key: string): string {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

function envPriceEur(key: string): number | undefined {
  const raw = process.env[key];
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function formatEur(n: number): string {
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}

export function getCanvasProductOptions(): CanvasProductOption[] {
  const opts: CanvasProductOption[] = [];
  const s30 = envSku('EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM');
  const s60 = envSku('EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM');
  const p30 = envPriceEur('EXPO_PUBLIC_PRICE_EUR_30CM') ?? 49.9;
  const p60 = envPriceEur('EXPO_PUBLIC_PRICE_EUR_60CM') ?? 89.9;

  if (s30) {
    opts.push({
      id: 'canvas_30',
      label: '30 × 30 cm Leinwand',
      sku: s30,
      priceEur: p30,
      priceLabel: formatEur(p30),
    });
  }
  if (s60) {
    opts.push({
      id: 'canvas_60',
      label: '60 × 60 cm Leinwand',
      sku: s60,
      priceEur: p60,
      priceLabel: formatEur(p60),
    });
  }
  return opts;
}

export function hasConfiguredCanvasSkus(): boolean {
  return getCanvasProductOptions().length > 0;
}
