// Product pricing for Stripe Checkout (amounts in smallest currency unit, e.g. cents).

export type PricedProduct = {
  sku: string;
  amountCents: number;
  label: string;
};

type CatalogRow = {
  sku?: string;
  amountCents?: number;
  label?: string;
  title?: string;
};

/**
 * Resolve price for a merchOne SKU.
 * Priority:
 * 1) STRIPE_PRODUCT_CATALOG JSON [{sku, amountCents, label}]
 * 2) STRIPE_AMOUNT_BY_SKU JSON {"sku":4990}
 * 3) Legacy MERCHONE_SKU_CANVAS_30CM/60CM + STRIPE_AMOUNT_CENTS_*
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
        if (hit && typeof hit.amountCents === "number" && hit.amountCents > 0) {
          return {
            sku,
            amountCents: Math.round(hit.amountCents),
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

  const s30 = Deno.env.get("MERCHONE_SKU_CANVAS_30CM")?.trim() ?? "";
  const s60 = Deno.env.get("MERCHONE_SKU_CANVAS_60CM")?.trim() ?? "";
  const a30 = parseInt(Deno.env.get("STRIPE_AMOUNT_CENTS_30CM") ?? "4990", 10);
  const a60 = parseInt(Deno.env.get("STRIPE_AMOUNT_CENTS_60CM") ?? "8990", 10);

  if (s30 && sku === s30 && Number.isFinite(a30) && a30 > 0) {
    return { sku, amountCents: a30, label: "IrisArt Leinwand 30 × 30 cm" };
  }
  if (s60 && sku === s60 && Number.isFinite(a60) && a60 > 0) {
    return { sku, amountCents: a60, label: "IrisArt Leinwand 60 × 60 cm" };
  }

  return null;
}

export function stripeCurrency(): string {
  return (Deno.env.get("STRIPE_CURRENCY") ?? "eur").trim().toLowerCase() || "eur";
}
