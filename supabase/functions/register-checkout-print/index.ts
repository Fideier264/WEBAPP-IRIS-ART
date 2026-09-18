// Supabase Edge Function: register-checkout-print
// Attaches the print file URL to a Stripe session after parallel upload finishes.
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

async function upsertPendingPrint(sessionId: string, printFileUrl: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.");
  }

  const resp = await fetch(`${url}/rest/v1/checkout_pending_prints`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      session_id: sessionId,
      print_file_url: printFileUrl,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`checkout_pending_prints upsert failed: HTTP ${resp.status} ${text.slice(0, 200)}`);
  }
}

async function patchStripeSessionMetadata(
  stripeKey: string,
  sessionId: string,
  printFileUrl: string,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("metadata[printFileUrl]", printFileUrl);
  form.set("metadata[printPending]", "0");
  const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!resp.ok) {
    const parsed = (await resp.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = parsed?.error?.message ?? `Stripe HTTP ${resp.status}`;
    // Non-fatal if session already completed — DB row is enough for webhook retries.
    console.warn("register-checkout-print: stripe metadata patch failed", msg);
  }
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

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!stripeKey) {
    return json(
      { ok: false, error: "Server misconfigured: STRIPE_SECRET_KEY missing." },
      { status: 200, headers: cors },
    );
  }

  let body: { sessionId?: string; printFileUrl?: string };
  try {
    body = (await req.json()) as { sessionId?: string; printFileUrl?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, { status: 200, headers: cors });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const printFileUrl = typeof body.printFileUrl === "string" ? body.printFileUrl.trim() : "";

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return json({ ok: false, error: "sessionId is required." }, { status: 200, headers: cors });
  }
  if (!printFileUrl || !isHttpsUrl(printFileUrl)) {
    return json({ ok: false, error: "printFileUrl must be a valid https URL." }, { status: 200, headers: cors });
  }
  if (printFileUrl.length > 2000) {
    return json({ ok: false, error: "printFileUrl too long." }, { status: 200, headers: cors });
  }

  try {
    await upsertPendingPrint(sessionId, printFileUrl);
    await patchStripeSessionMetadata(stripeKey, sessionId, printFileUrl);
    return json({ ok: true, sessionId }, { status: 200, headers: cors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("register-checkout-print: failed", msg);
    return json({ ok: false, error: msg }, { status: 200, headers: cors });
  }
});
