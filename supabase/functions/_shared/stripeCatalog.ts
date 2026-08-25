// Product pricing for Stripe Checkout (amounts in smallest currency unit, e.g. cents).

export type PricedProduct = {
  sku: string;
  amountCents: number;
  label: string;
};

type CatalogRow = {
  sku?: string;
  amountCents?: number;
  priceEur?: number | string;
  label?: string;
  title?: string;
};

/** Fallback when no Stripe catalog secrets are set (keep in sync with irisart-app/config/productCatalog.json). */
const BUNDLED_CATALOG: PricedProduct[] = [
  {
    sku: "CVS0200201LMF2-PIC83638470",
    amountCents: 1999,
    label: "IrisArt Leinwand 20 × 20 cm",
  },
];

function amountFromRow(row: CatalogRow): number | null {
  if (typeof row.amountCents === "number" && row.amountCents > 0) {
    return Math.round(row.amountCents);
  }
  if (typeof row.priceEur === "number" && row.priceEur > 0) {
    return Math.round(row.priceEur * 100);
  }
  if (typeof row.priceEur === "string" && row.priceEur.trim()) {
    const n = Number(row.priceEur.replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

function legacySizeCatalog(): PricedProduct[] {
  const out: PricedProduct[] = [];
  const skuRe = /^MERCHONE_SKU_CANVAS_(\d+)CM$/i;

  for (const [key, value] of Object.entries(Deno.env.toObject())) {
    const m = key.match(skuRe);
    if (!m || !value?.trim()) continue;
    const size = m[1];
    const amountRaw = Deno.env.get(`STRIPE_AMOUNT_CENTS_${size}CM`) ??
      Deno.env.get(`STRIPE_AMOUNT_CENTS_${size}cm`);
    const amount = parseInt(amountRaw ?? "", 10);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      sku: value.trim(),
      amountCents: amount,
      label: `IrisArt Leinwand ${size} × ${size} cm`,
    });
  }
  return out;
}

/**
 * Resolve price for a merchOne SKU.
 * Priority:
 * 1) STRIPE_PRODUCT_CATALOG JSON [{sku, amountCents|priceEur, label}]
 * 2) STRIPE_AMOUNT_BY_SKU JSON {"sku":1999}
 * 3) Any MERCHONE_SKU_CANVAS_<N>CM + STRIPE_AMOUNT_CENTS_<N>CM
 * 4) Bundled default catalog (repo productCatalog.json)
 */
export function resolvePricedProduct(productSku: string): PricedProduct | null {
  const sku = productSku.trim();
  if (!sku) return null;

  const catalogRaw = Deno.env.get("STRIPE_PRODUCT_CATALOG")?.trim();
  if (catalogRaw) {
    try {
      const rows = JSON.parse(catalogRaw) as CatalogRow[];
      if (Array.isArray(rows)) {
        const hit = rows.find((r) => typeof r.sku === "string" && r.sku.trim() === sku);
        const amount = hit ? amountFromRow(hit) : null;
        if (hit && amount) {
          return {
            sku,
            amountCents: amount,
            label: String(hit.label ?? hit.title ?? `IrisArt (${sku})`).trim(),
          };
        }
      }
    } catch {
      console.warn("STRIPE_PRODUCT_CATALOG is invalid JSON");
    }
  }

  const rawMap = Deno.env.get("STRIPE_AMOUNT_BY_SKU")?.trim();
  if (rawMap) {
    try {
      const map = JSON.parse(rawMap) as Record<string, number>;
      const amount = map[sku];
      if (typeof amount === "number" && amount > 0) {
        return { sku, amountCents: Math.round(amount), label: `IrisArt Leinwand (${sku})` };
      }
    } catch {
      /* ignore */
    }
  }

  const legacyHit = legacySizeCatalog().find((p) => p.sku === sku);
  if (legacyHit) return legacyHit;

  const bundled = BUNDLED_CATALOG.find((p) => p.sku === sku);
  if (bundled) return bundled;

  return null;
}

export function stripeCurrency(): string {
  return (Deno.env.get("STRIPE_CURRENCY") ?? "eur").trim().toLowerCase() || "eur";
}
