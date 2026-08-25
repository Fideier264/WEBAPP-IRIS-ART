// Supabase Edge Function: stripe-webhook
// On checkout.session.completed → create merchOne order (fulfillment after payment).
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, MERCHONE_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createMerchOneOrder } from "../_shared/merchone.ts";

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k.trim(), v?.trim() ?? ""];
    }),
  );
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const signed = `${timestamp}.${payload}`;
  const expected = await hmacSha256Hex(secret, signed);
  return timingSafeEqual(expected, v1);
}

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;

  const resp = await fetch(
    `${url}/rest/v1/stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}&select=event_id`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    },
  );
  if (!resp.ok) return false;
  const rows = (await resp.json()) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

async function markProcessed(
  eventId: string,
  sessionId: string | null,
  merchoneOrderId: string | null,
): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  await fetch(`${url}/rest/v1/stripe_webhook_events`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({
      event_id: eventId,
      session_id: sessionId,
      merchone_order_id: merchoneOrderId,
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
  if (!stripeKey || !webhookSecret) {
    console.error("stripe-webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return new Response("misconfigured", { status: 500 });
  }

  const payload = await req.text();
  const okSig = await verifyStripeSignature(payload, req.headers.get("stripe-signature"), webhookSecret);
  if (!okSig) {
    return new Response("invalid signature", { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const eventId = typeof event.id === "string" ? event.id : "";
  const type = typeof event.type === "string" ? event.type : "";

  if (eventId && (await alreadyProcessed(eventId))) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (type !== "checkout.session.completed") {
    if (eventId) await markProcessed(eventId, null, null);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const session = event.data && typeof event.data === "object"
    ? (event.data as { object?: Record<string, unknown> }).object
    : undefined;

  if (!session || typeof session !== "object") {
    return new Response("missing session", { status: 400 });
  }

  const sessionId = typeof session.id === "string" ? session.id : null;
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const productSku = meta.productSku ?? "";
  const printFileUrl = meta.printFileUrl ?? "";
  const templateId = meta.templateId ?? "";
  const externalId = meta.externalId ?? sessionId ?? `stripe_${Date.now()}`;

  console.log("stripe-webhook: checkout.session.completed — print fulfillment metadata", {
    sessionId,
    templateId: templateId || "(missing)",
    printFileUrl: printFileUrl || "(missing)",
    productSku: productSku || "(missing)",
    externalId,
  });
  let shipping: Record<string, string> = {};
  try {
    shipping = JSON.parse(meta.shipping ?? "{}") as Record<string, string>;
  } catch {
    console.error("stripe-webhook: invalid shipping metadata");
    return new Response("bad shipping metadata", { status: 400 });
  }

  if (!productSku || !printFileUrl) {
    console.error("stripe-webhook: missing productSku/printFileUrl metadata", {
      sessionId,
      templateId: templateId || "(missing)",
      printFileUrl: printFileUrl || "(missing)",
      productSku: productSku || "(missing)",
    });
    return new Response("missing metadata", { status: 400 });
  }

  if (!templateId) {
    console.warn("stripe-webhook: templateId missing in metadata — merchOne order will proceed with printFileUrl only", {
      sessionId,
      printFileUrl,
    });
  }

  const paymentStatus = session.payment_status;
  if (paymentStatus && paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    console.warn("stripe-webhook: session not paid", paymentStatus);
    return new Response(JSON.stringify({ received: true, skipped: "unpaid" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await createMerchOneOrder({
    printFileUrl,
    productSku,
    shipping: {
      email: String(shipping.email ?? ""),
      firstName: String(shipping.firstName ?? ""),
      lastName: String(shipping.lastName ?? ""),
      company: shipping.company,
      street: String(shipping.street ?? ""),
      street2: shipping.street2,
      city: String(shipping.city ?? ""),
      postcode: String(shipping.postcode ?? ""),
      country: String(shipping.country ?? ""),
      region: shipping.region,
      telephone: shipping.telephone,
    },
    externalId,
  });

  if (!result.ok) {
    console.error("stripe-webhook: merchOne failed", result.error);
    // 500 so Stripe retries
    return new Response(JSON.stringify({ ok: false, error: result.error }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (eventId) await markProcessed(eventId, sessionId, result.orderId);
  console.log("stripe-webhook: fulfilled", sessionId, result.orderId);

  return new Response(JSON.stringify({ received: true, orderId: result.orderId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
