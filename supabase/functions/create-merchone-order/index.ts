// Supabase Edge Function: create-merchone-order
// Creates a merchOne order (POST /api/v1/orders) with blueprint SKU + print file URL.
// Prefer Stripe Checkout + stripe-webhook for customer orders; this remains for admin/manual use.
// Secrets: MERCHONE_API_USER, MERCHONE_API_KEY
// Optional: MERCHONE_ORDERS_IS_TEST, MERCHONE_ALLOWED_SKUS, MERCHONE_ALLOW_DIRECT_ORDERS=1

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { createMerchOneOrder } from "../_shared/merchone.ts";

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

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 200, headers: cors });
  }

  // Block accidental unpaid production orders from the public app.
  if (Deno.env.get("MERCHONE_ALLOW_DIRECT_ORDERS") !== "1") {
    return json(
      {
        ok: false,
        error:
          "Direct merchOne orders disabled. Use Stripe Checkout (create-checkout-session). Set MERCHONE_ALLOW_DIRECT_ORDERS=1 only for admin/manual tests.",
      },
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
  if (!printFileUrl || !isHttpsUrl(printFileUrl)) {
    return json({ ok: false, error: "printFileUrl must be a valid https URL." }, { status: 200, headers: cors });
  }

  const result = await createMerchOneOrder({
    printFileUrl,
    productSku: typeof body.productSku === "string" ? body.productSku : "",
    shipping: body.shipping,
    externalId: body.externalId,
  });

  return json(result, { status: 200, headers: cors });
});
