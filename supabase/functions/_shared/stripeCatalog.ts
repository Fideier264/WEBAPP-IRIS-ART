// Product pricing for Stripe Checkout (amounts in smallest currency unit, e.g. cents).

export type PricedProduct = {
  sku: string;
  amountCents: number;
  label: string;
};

export function resolvePricedProduct(productSku: string): PricedProduct | null {
  const sku = productSku.trim();
  if (!sku) return null;

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

  // Optional override: STRIPE_AMOUNT_BY_SKU={"sku":4990}
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

  return null;
}

export function stripeCurrency(): string {
  return (Deno.env.get("STRIPE_CURRENCY") ?? "eur").trim().toLowerCase() || "eur";
}
