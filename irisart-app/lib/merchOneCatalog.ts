/**
 * Shop product catalog for checkout.
 *
 * Priority:
 * 1) EXPO_PUBLIC_MERCHONE_CATALOG (or expo.extra.merchoneCatalog)
 * 2) irisart-app/config/productCatalog.json  ← easiest to edit in the repo
 * 3) Legacy EXPO_PUBLIC_MERCHONE_SKU_CANVAS_<N>CM + PRICE_EUR_<N>CM
 * 4) Demo cards (no SKU — payment blocked)
 */

import Constants from 'expo-constants';

import bundledCatalog from '@/config/productCatalog.json';

export type CatalogProduct = {
  id: string;
  sku: string;
  /** Card title — size for canvases; later any product name */
  title: string;
  /** Product family key (canvas, poster, …) */
  category: string;
  categoryLabel: string;
  priceEur: number;
  priceLabel: string;
  /**
   * Print file aspect ratio (width / height) expected by MerchOne for this SKU.
   * Square canvases = 1. Inferred from title "W × H cm" when omitted.
   */
  printAspectRatio: number;
  /** Optional merch / mock photo URL; checkout falls back to the customer artwork */
  imageUrl?: string;
  description?: string;
};

type Extra = {
  merchoneCatalog?: string | unknown;
};

function envString(key: string): string {
  const v = process.env[key];
  return typeof v === 'string' ? v.trim() : '';
}

function formatEur(n: number): string {
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}

function parsePrice(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw.trim().replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

type RawProduct = {
  sku?: string;
  id?: string;
  title?: string;
  category?: string;
  categoryLabel?: string;
  priceEur?: number | string;
  imageUrl?: string;
  description?: string;
  sizeLabel?: string;
  size?: string;
  label?: string;
  printAspectRatio?: number | string;
  aspectRatio?: number | string;
};

/** Parse "20 × 20 cm" / "30x40" → width/height. Square sizes → 1. */
export function inferPrintAspectRatioFromTitle(title: string): number | null {
  const m = title.match(/(\d+(?:[.,]\d+)?)\s*[×xX]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const w = Number(m[1]!.replace(',', '.'));
  const h = Number(m[2]!.replace(',', '.'));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

function parseAspect(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw.trim().replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function normalizeProduct(raw: RawProduct, index: number): CatalogProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const sku = typeof raw.sku === 'string' ? raw.sku.trim() : '';
  const title =
    String(raw.title ?? raw.sizeLabel ?? raw.size ?? raw.label ?? '').trim() || `Produkt ${index + 1}`;
  const priceEur = parsePrice(raw.priceEur, 49.9);
  const category = String(raw.category ?? 'canvas').trim() || 'canvas';
  const categoryLabel = String(raw.categoryLabel ?? (category === 'canvas' ? 'Leinwand' : category)).trim();
  const inferred = inferPrintAspectRatioFromTitle(title);
  const defaultAr = category === 'canvas' ? 1 : inferred ?? 1;
  const printAspectRatio = parseAspect(
    raw.printAspectRatio ?? raw.aspectRatio ?? inferred,
    defaultAr
  );

  return {
    id: String(raw.id ?? `${sku || 'product'}_${index}`).trim(),
    sku,
    title,
    category,
    categoryLabel,
    priceEur,
    priceLabel: formatEur(priceEur),
    printAspectRatio,
    imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl.trim() : undefined,
    description: typeof raw.description === 'string' ? raw.description.trim() : undefined,
  };
}

function sanitizeCatalogJson(raw: string): string {
  let s = raw.trim().replace(/^\uFEFF/, '');
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('`') && s.endsWith('`'))
  ) {
    s = s.slice(1, -1).trim();
  }
  // Hostinger / Word-style quotes
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  return s;
}

function parseCatalogList(raw: unknown): CatalogProduct[] {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(sanitizeCatalogJson(data));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  return data.map((row, i) => normalizeProduct(row as RawProduct, i)).filter((p): p is CatalogProduct => Boolean(p));
}

function catalogFromEnvOrExtra(): CatalogProduct[] {
  const extra = (Constants.expoConfig?.extra ?? {}) as Extra;
  if (extra.merchoneCatalog != null) {
    const list = parseCatalogList(extra.merchoneCatalog);
    if (list.length) return list;
  }
  const fromProcess = envString('EXPO_PUBLIC_MERCHONE_CATALOG');
  if (fromProcess) {
    const list = parseCatalogList(fromProcess);
    if (list.length) return list;
  }
  return [];
}

/** EXPO_PUBLIC_MERCHONE_SKU_CANVAS_20CM + EXPO_PUBLIC_PRICE_EUR_20CM, any size. */
function legacyProductsFromEnv(): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  const env = process.env ?? {};
  const skuRe = /^EXPO_PUBLIC_MERCHONE_SKU_CANVAS_(\d+)CM$/i;

  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const m = key.match(skuRe);
    if (!m) continue;
    const cm = m[1]!;
    const price = parsePrice(env[`EXPO_PUBLIC_PRICE_EUR_${cm}CM`], Number(cm) <= 25 ? 19.99 : Number(cm) <= 35 ? 49.9 : 89.9);
    out.push({
      id: `canvas_${cm}`,
      sku: value.trim(),
      title: `${cm} × ${cm} cm`,
      category: 'canvas',
      categoryLabel: 'Leinwand',
      priceEur: price,
      priceLabel: formatEur(price),
      printAspectRatio: 1,
      description: 'Galerie-Leinwand',
    });
  }

  out.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return out;
}

function bundledProducts(): CatalogProduct[] {
  return parseCatalogList(bundledCatalog);
}

function demoProducts(): CatalogProduct[] {
  return [
    {
      id: 'demo_canvas_30',
      sku: '',
      title: '30 × 30 cm',
      category: 'canvas',
      categoryLabel: 'Leinwand',
      priceEur: 49.9,
      priceLabel: formatEur(49.9),
      printAspectRatio: 1,
      description: 'Galerie-Leinwand (Demo — SKU fehlt)',
    },
    {
      id: 'demo_canvas_60',
      sku: '',
      title: '60 × 60 cm',
      category: 'canvas',
      categoryLabel: 'Leinwand',
      priceEur: 89.9,
      priceLabel: formatEur(89.9),
      printAspectRatio: 1,
      description: 'Galerie-Leinwand (Demo — SKU fehlt)',
    },
  ];
}

let cached: CatalogProduct[] | null = null;
let catalogSource: 'env' | 'bundled' | 'legacy' | 'demo' = 'demo';

export function getCatalogSource(): typeof catalogSource {
  getCatalogProducts();
  return catalogSource;
}

export function getCatalogProducts(): CatalogProduct[] {
  if (cached) return cached;

  const fromEnv = catalogFromEnvOrExtra();
  if (fromEnv.length) {
    catalogSource = 'env';
    cached = fromEnv;
    return cached;
  }

  const bundled = bundledProducts().filter((p) => Boolean(p.sku));
  if (bundled.length) {
    catalogSource = 'bundled';
    cached = bundled;
    return cached;
  }

  const legacy = legacyProductsFromEnv();
  if (legacy.length) {
    catalogSource = 'legacy';
    cached = legacy;
    return cached;
  }

  catalogSource = 'demo';
  cached = demoProducts();
  return cached;
}

export function catalogHasPayableSkus(): boolean {
  return getCatalogProducts().some((p) => Boolean(p.sku));
}

export function uniqueCategories(products: CatalogProduct[]): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const p of products) {
    if (!map.has(p.category)) map.set(p.category, p.categoryLabel);
  }
  return [...map.entries()].map(([id, label]) => ({ id, label }));
}

/** @deprecated */
export type CatalogVariant = CatalogProduct & {
  sizeId: string;
  sizeLabel: string;
  materialId: string;
  materialLabel: string;
  frameId: string;
  frameLabel: string;
};

/** @deprecated */
export function getCatalogVariants(): CatalogVariant[] {
  return getCatalogProducts().map((p) => ({
    ...p,
    sizeId: p.id,
    sizeLabel: p.title,
    materialId: 'default',
    materialLabel: p.categoryLabel,
    frameId: 'default',
    frameLabel: p.description ?? p.categoryLabel,
  }));
}

/** @deprecated */
export type CanvasProductOption = {
  id: string;
  label: string;
  sku: string;
  priceEur?: number;
  priceLabel?: string;
};

/** @deprecated */
export function getCanvasProductOptions(): CanvasProductOption[] {
  return getCatalogProducts()
    .filter((p) => p.sku)
    .map((p) => ({
      id: p.id,
      label: p.title,
      sku: p.sku,
      priceEur: p.priceEur,
      priceLabel: p.priceLabel,
    }));
}

/** @deprecated */
export function hasConfiguredCanvasSkus(): boolean {
  return catalogHasPayableSkus();
}
