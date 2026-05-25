// Supabase Edge Function: create-merchone-order
// Creates a merchOne order (POST /api/v1/orders) with blueprint SKU + print file URL.
// Secrets: MERCHONE_API_USER, MERCHONE_API_KEY
// Optional: MERCHONE_ORDERS_IS_TEST (default "true"), MERCHONE_ALLOWED_SKUS (comma-separated allowlist)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const MERCHONE_API = "https://api.merchone.com/api/v1";

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

function corsHeaders(origin: string | null) {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

type ShippingIn = {
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

type Body = {
  printFileUrl: string;
  productSku: string;
  shipping: ShippingIn;
  externalId?: string;
};

function isHttpsUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function basicAuthHeader(): string | null {
  const user = Deno.env.get("MERCHONE_API_USER")?.trim();
  const pass = Deno.env.get("MERCHONE_API_KEY")?.trim();
  if (!user || !pass) return null;
  const token = btoa(`${user}:${pass}`);
  return `Basic ${token}`;
}

function isTestOrder(): boolean {
  const v = Deno.env.get("MERCHONE_ORDERS_IS_TEST");
  if (v === "0" || v === "false") return false;
  return true;
}

function skuAllowed(sku: string): boolean {
  const raw = Deno.env.get("MERCHONE_ALLOWED_SKUS")?.trim();
  if (!raw) return true;
  const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return set.has(sku);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 200, headers: cors });
  }

  const auth = basicAuthHeader();
  if (!auth) {
    console.error("create-merchone-order: missing MERCHONE_API_USER / MERCHONE_API_KEY");
    return json(
      { ok: false, error: "Server misconfigured: merchOne credentials missing." },
      { status: 200, headers: cors },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, { status: 200, headers: cors });
  }

  const printFileUrl = typeof body.printFileUrl === "string" ? body.printFileUrl.trim() : "";
  const productSku = typeof body.productSku === "string" ? body.productSku.trim() : "";
  const sh = body.shipping;

  if (!printFileUrl || !isHttpsUrl(printFileUrl)) {
    return json({ ok: false, error: "printFileUrl must be a valid https URL." }, { status: 200, headers: cors });
  }
  if (!productSku) {
    return json({ ok: false, error: "productSku is required." }, { status: 200, headers: cors });
  }
  if (!skuAllowed(productSku)) {
    return json({ ok: false, error: "productSku is not allowed." }, { status: 200, headers: cors });
  }

  if (!sh || typeof sh !== "object") {
    return json({ ok: false, error: "shipping is required." }, { status: 200, headers: cors });
  }

  const email = String(sh.email ?? "").trim();
  const firstName = String(sh.firstName ?? "").trim();
  const lastName = String(sh.lastName ?? "").trim();
  const street = String(sh.street ?? "").trim();
  const city = String(sh.city ?? "").trim();
  const postcode = String(sh.postcode ?? "").trim();
  const country = String(sh.country ?? "").trim().toUpperCase().slice(0, 2);

  if (!email || !firstName || !lastName || !street || !city || !postcode || country.length !== 2) {
    return json(
      { ok: false, error: "shipping: email, firstName, lastName, street, city, postcode, country (ISO-2) required." },
      { status: 200, headers: cors },
    );
  }

  const region = String(sh.region ?? "").trim();
  if ((country === "US" || country === "CA") && !region) {
    return json(
      { ok: false, error: "shipping.region is required for US and CA." },
      { status: 200, headers: cors },
    );
  }

  const payload = {
    external_id: typeof body.externalId === "string" && body.externalId.trim()
      ? body.externalId.trim().slice(0, 128)
      : undefined,
    shipping_type: "tracked",
    is_test: isTestOrder(),
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
        file: {
          front: { url: printFileUrl },
        },
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
      console.error("create-merchone-order: merchOne error", resp.status, msg);
      return json({ ok: false, error: `merchOne: ${msg}` }, { status: 200, headers: cors });
    }

    const orderId =
      (parsed?.order_id as string) ??
      ((parsed?.data as Record<string, unknown> | undefined)?.order_id as string | undefined);

    return json(
      {
        ok: true,
        orderId: orderId ?? null,
        isTest: isTestOrder(),
        raw: parsed,
      },
      { status: 200, headers: cors },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("create-merchone-order: failed", msg);
    return json({ ok: false, error: msg }, { status: 200, headers: cors });
  }
});
