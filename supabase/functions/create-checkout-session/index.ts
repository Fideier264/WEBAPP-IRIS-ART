// Supabase Edge Function: create-checkout-session
// Creates a Stripe Checkout Session; merchOne fulfillment happens in stripe-webhook after payment.
// Secrets: STRIPE_SECRET_KEY, MERCHONE_SKU_CANVAS_30CM/60CM, STRIPE_AMOUNT_CENTS_30CM/60CM
// Optional: STRIPE_CURRENCY, APP_ORIGIN, CHECKOUT_ALLOWED_ORIGINS

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { resolvePricedProduct, stripeCurrency } from "../_shared/stripeCatalog.ts";

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

function isHttpsUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveAppOrigin(requested: string | undefined, reqOrigin: string | null): string | null {
  const fromEnv = Deno.env.get("APP_ORIGIN")?.trim().replace(/\/$/, "");
  const candidate = (requested?.trim() || reqOrigin || fromEnv || "").replace(/\/$/, "");
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const allow = Deno.env.get("CHECKOUT_ALLOWED_ORIGINS")?.trim();
  if (allow) {
    const set = new Set(allow.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean));
    if (!set.has(url.origin)) return null;
  }

  return url.origin;
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
  appOrigin?: string;
  externalId?: string;
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 200, headers: cors });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!stripeKey) {
    return json(
      { ok: false, error: "Server misconfigured: STRIPE_SECRET_KEY missing." },
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

  const priced = resolvePricedProduct(productSku);
  if (!priced) {
    return json(
      {
        ok: false,
        error:
          "Unknown productSku / price. Set MERCHONE_SKU_CANVAS_30CM|60CM and STRIPE_AMOUNT_CENTS_30CM|60CM on the function.",
      },
      { status: 200, headers: cors },
    );
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
    return json({ ok: false, error: "shipping.region is required for US and CA." }, { status: 200, headers: cors });
  }

  const appOrigin = resolveAppOrigin(body.appOrigin, origin);
  if (!appOrigin) {
    return json(
      {
        ok: false,
        error: "appOrigin missing or not allowed. Set APP_ORIGIN or CHECKOUT_ALLOWED_ORIGINS, or send appOrigin.",
      },
      { status: 200, headers: cors },
    );
  }

  const externalId =
    typeof body.externalId === "string" && body.externalId.trim()
      ? body.externalId.trim().slice(0, 128)
      : `irisart_${Date.now()}`;

  const shippingJson = JSON.stringify({
    email,
    firstName,
    lastName,
    company: String(sh.company ?? "").trim() || undefined,
    street,
    street2: String(sh.street2 ?? "").trim() || undefined,
    city,
    postcode,
    country,
    region: region || undefined,
    telephone: String(sh.telephone ?? "").trim() || undefined,
  });

  // Stripe metadata values max 500 chars — shipping JSON is fine for typical addresses.
  if (shippingJson.length > 480) {
    return json({ ok: false, error: "Shipping address too long for checkout metadata." }, { status: 200, headers: cors });
  }
  if (printFileUrl.length > 480) {
    return json({ ok: false, error: "printFileUrl too long for checkout metadata." }, { status: 200, headers: cors });
  }

  const currency = stripeCurrency();
  const successUrl = `${appOrigin}/order-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appOrigin}/checkout?canceled=1`;

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", successUrl);
  form.set("cancel_url", cancelUrl);
  form.set("customer_email", email);
  form.set("client_reference_id", externalId);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", currency);
  form.set("line_items[0][price_data][unit_amount]", String(priced.amountCents));
  form.set("line_items[0][price_data][product_data][name]", priced.label);
  form.set("metadata[productSku]", productSku);
  form.set("metadata[printFileUrl]", printFileUrl);
  form.set("metadata[shipping]", shippingJson);
  form.set("metadata[externalId]", externalId);
  form.set("payment_intent_data[metadata][productSku]", productSku);
  form.set("payment_intent_data[metadata][externalId]", externalId);

  try {
    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const parsed = (await resp.json()) as Record<string, unknown>;
    if (!resp.ok) {
      const msg =
        (parsed?.error as { message?: string } | undefined)?.message ??
        `Stripe HTTP ${resp.status}`;
      console.error("create-checkout-session: stripe error", msg);
      return json({ ok: false, error: msg }, { status: 200, headers: cors });
    }

    const url = typeof parsed.url === "string" ? parsed.url : null;
    const id = typeof parsed.id === "string" ? parsed.id : null;
    if (!url || !id) {
      return json({ ok: false, error: "Stripe session missing url/id." }, { status: 200, headers: cors });
    }

    return json(
      {
        ok: true,
        sessionId: id,
        url,
        amountCents: priced.amountCents,
        currency,
        label: priced.label,
      },
      { status: 200, headers: cors },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("create-checkout-session: failed", msg);
    return json({ ok: false, error: msg }, { status: 200, headers: cors });
  }
});
