// Shared merchOne order creation for Edge Functions.

export const MERCHONE_API = "https://api.merchone.com/api/v1";

export type MerchOneShipping = {
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  street: string;
  street2?: string;
  city: string;
  postcode: string;
  country: string;
  region?: string;
  telephone?: string;
};

export type CreateMerchOneOrderParams = {
  printFileUrl: string;
  productSku: string;
  shipping: MerchOneShipping;
  externalId?: string;
};

export function merchOneBasicAuthHeader(): string | null {
  const user = Deno.env.get("MERCHONE_API_USER")?.trim();
  const pass = Deno.env.get("MERCHONE_API_KEY")?.trim();
  if (!user || !pass) return null;
  return `Basic ${btoa(`${user}:${pass}`)}`;
}

export function merchOneIsTestOrder(): boolean {
  const v = Deno.env.get("MERCHONE_ORDERS_IS_TEST");
  if (v === "0" || v === "false") return false;
  return true;
}

export function merchOneSkuAllowed(sku: string): boolean {
  const raw = Deno.env.get("MERCHONE_ALLOWED_SKUS")?.trim();
  if (!raw) return true;
  const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has(sku);
}

export async function createMerchOneOrder(
  params: CreateMerchOneOrderParams,
): Promise<{ ok: true; orderId: string | null; isTest: boolean; raw: unknown } | { ok: false; error: string }> {
  const auth = merchOneBasicAuthHeader();
  if (!auth) {
    return { ok: false, error: "Server misconfigured: merchOne credentials missing." };
  }

  const printFileUrl = params.printFileUrl.trim();
  const productSku = params.productSku.trim();
  const sh = params.shipping;

  if (!productSku) return { ok: false, error: "productSku is required." };
  if (!merchOneSkuAllowed(productSku)) return { ok: false, error: "productSku is not allowed." };

  const email = String(sh.email ?? "").trim();
  const firstName = String(sh.firstName ?? "").trim();
  const lastName = String(sh.lastName ?? "").trim();
  const street = String(sh.street ?? "").trim();
  const city = String(sh.city ?? "").trim();
  const postcode = String(sh.postcode ?? "").trim();
  const country = String(sh.country ?? "").trim().toUpperCase().slice(0, 2);

  if (!email || !firstName || !lastName || !street || !city || !postcode || country.length !== 2) {
    return {
      ok: false,
      error: "shipping: email, firstName, lastName, street, city, postcode, country (ISO-2) required.",
    };
  }

  const region = String(sh.region ?? "").trim();
  if ((country === "US" || country === "CA") && !region) {
    return { ok: false, error: "shipping.region is required for US and CA." };
  }

  const payload = {
    external_id: params.externalId?.trim().slice(0, 128) || undefined,
    shipping_type: "tracked",
    is_test: merchOneIsTestOrder(),
    shipping: {
      email,
      firstname: firstName,
      lastname: lastName,
      company: String(sh.company ?? "").trim() || undefined,
      street_primary: street,
      street_secondary: String(sh.street2 ?? "").trim() || undefined,
      city,
      postcode,
      country,
      region: region || undefined,
      telephone: String(sh.telephone ?? "").trim() || undefined,
    },
    items: [
      {
        quantity: 1,
        product_sku: productSku,
        file: { front: { url: printFileUrl } },
      },
    ],
  };

  try {
    const resp = await fetch(`${MERCHONE_API}/orders`, {
      method: "POST",
      headers: {
        Authorization: auth,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* raw */
    }

    if (!resp.ok) {
      const msg =
        (parsed?.message as string) ??
        (parsed?.error as string) ??
        (typeof text === "string" && text.length ? text.slice(0, 500) : `HTTP ${resp.status}`);
      return { ok: false, error: `merchOne: ${msg}` };
    }

    const orderId =
      (parsed?.order_id as string) ??
      ((parsed?.data as Record<string, unknown> | undefined)?.order_id as string | undefined);

    return {
      ok: true,
      orderId: orderId ?? null,
      isTest: merchOneIsTestOrder(),
      raw: parsed,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
