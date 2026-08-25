/**
 * Shop product catalog for checkout.
 *
 * UI: photo cards with title (currently size). Later: posters, framed prints, etc.
 *
 * Preferred — EXPO_PUBLIC_MERCHONE_CATALOG JSON:
 * [
 *   {
 *     "sku": "YOUR_SKU",
 *     "title": "30 × 30 cm",
 *     "category": "canvas",
 *     "categoryLabel": "Leinwand",
 *     "priceEur": 49.9,
 *     "imageUrl": "https://…/product-preview.jpg"
 *   }
 * ]
 *
 * Legacy:
 *   EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM / _60CM
 *   EXPO_PUBLIC_PRICE_EUR_30CM / _60CM
 */

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
  /** Optional merch / mock photo URL; checkout falls back to the customer artwork */
  imageUrl?: string;
  description?: string;
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
  /** legacy fields mapped into title */
  sizeLabel?: string;
  size?: string;
  label?: string;
};

function normalizeProduct(raw: RawProduct, index: number): CatalogProduct | null {
  const sku = typeof raw.sku === 'string' ? raw.sku.trim() : '';
  const title =
    String(raw.title ?? raw.sizeLabel ?? raw.size ?? raw.label ?? '').trim() || `Produkt ${index + 1}`;
  const priceEur = parsePrice(raw.priceEur, 49.9);
  const category = String(raw.category ?? 'canvas').trim() || 'canvas';
  const categoryLabel = String(raw.categoryLabel ?? (category === 'canvas' ? 'Leinwand' : category)).trim();

  return {
    id: String(raw.id ?? `${sku || 'product'}_${index}`).trim(),
    sku,
    title,
    category,
    categoryLabel,
    priceEur,
    priceLabel: formatEur(priceEur),
    imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl.trim() : undefined,
    description: typeof raw.description === 'string' ? raw.description.trim() : undefined,
  };
}

function legacyProducts(): CatalogProduct[] {
  const out: CatalogProduct[] = [];
  const s30 = envString('EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM');
  const s60 = envString('EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM');
  const p30 = parsePrice(envString('EXPO_PUBLIC_PRICE_EUR_30CM'), 49.9);
  const p60 = parsePrice(envString('EXPO_PUBLIC_PRICE_EUR_60CM'), 89.9);

  if (s30) {
    out.push({
      id: 'canvas_30',
      sku: s30,
      title: '30 × 30 cm',
      category: 'canvas',
      categoryLabel: 'Leinwand',
      priceEur: p30,
      priceLabel: formatEur(p30),
      description: 'Quadratische Galerie-Leinwand',
    });
  }
  if (s60) {
    out.push({
      id: 'canvas_60',
      sku: s60,
      title: '60 × 60 cm',
      category: 'canvas',
      categoryLabel: 'Leinwand',
      priceEur: p60,
      priceLabel: formatEur(p60),
      description: 'Quadratische Galerie-Leinwand',
    });
  }
  return out;
}

/** Visible demo cards when no SKUs are configured yet (payment still needs real SKUs). */
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
      description: 'Galerie-Leinwand',
    },
    {
      id: 'demo_canvas_60',
      sku: '',
      title: '60 × 60 cm',
      category: 'canvas',
      categoryLabel: 'Leinwand',
      priceEur: 89.9,
      priceLabel: formatEur(89.9),
      description: 'Galerie-Leinwand',
    },
  ];
}

let cached: CatalogProduct[] | null = null;

export function getCatalogProducts(): CatalogProduct[] {
  if (cached) return cached;

  const rawJson = envString('EXPO_PUBLIC_MERCHONE_CATALOG');
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as RawProduct[];
      if (Array.isArray(parsed)) {
        const list = parsed.map(normalizeProduct).filter((p): p is CatalogProduct => Boolean(p));
        if (list.length) {
          cached = list;
          return cached;
        }
      }
    } catch {
      console.warn('EXPO_PUBLIC_MERCHONE_CATALOG is invalid JSON');
    }
  }

  const legacy = legacyProducts();
  cached = legacy.length ? legacy : demoProducts();
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
