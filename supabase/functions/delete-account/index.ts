// Supabase Edge Function: delete-account
// Authenticated user deletes their auth user + gallery images/rows (App Store 5.1.1(v)).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (optional, for /auth/v1/user)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BUCKET = "user-irises";

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

function bearerToken(req: Request): string | null {
  const auth = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token || null;
}

async function getAuthenticatedUserId(token: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const apikey =
    Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    "";
  if (!url || !apikey) return null;

  const resp = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey,
    },
  });
  if (!resp.ok) return null;
  const user = (await resp.json()) as { id?: unknown };
  return typeof user?.id === "string" && user.id.length > 0 ? user.id : null;
}

type StorageObject = { name?: string };

async function listUserStoragePaths(userId: string): Promise<string[]> {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) return [];

  const paths: string[] = [];
  const pageSize = 100;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    const resp = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix: `${userId}/`,
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    if (!resp.ok) {
      console.warn("delete-account: storage list failed", resp.status);
      break;
    }
    const rows = (await resp.json()) as StorageObject[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      if (typeof row.name !== "string" || !row.name || row.name.endsWith("/")) continue;
      const path = row.name.includes("/") ? row.name : `${userId}/${row.name}`;
      paths.push(path);
    }
    if (rows.length < pageSize) break;
  }
  return paths;
}

async function removeStoragePaths(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) return;

  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const resp = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: chunk }),
    });
    if (!resp.ok) {
      // Fallback: some Storage versions expect `prefix` vs object names in `prefixes`.
      const retry = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
        method: "DELETE",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
      if (!retry.ok) {
        console.warn("delete-account: storage remove failed", resp.status, await resp.text().catch(() => ""));
      }
    }
  }
}

async function deleteUserIrisRows(userId: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) return;

  const resp = await fetch(
    `${url}/rest/v1/user_irises?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
    },
  );
  if (!resp.ok) {
    console.warn("delete-account: user_irises delete failed", resp.status);
  }
}

async function deleteAuthUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) {
    return { ok: false, error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY missing." };
  }

  const resp = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("delete-account: admin deleteUser failed", resp.status, text);
    return { ok: false, error: `Auth user delete failed (${resp.status}).` };
  }
  return { ok: true };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, { status: 405, headers: cors });
  }

  const token = bearerToken(req);
  if (!token) {
    return json({ ok: false, error: "Missing Authorization bearer token." }, { status: 401, headers: cors });
  }

  let userId: string | null = null;
  try {
    userId = await getAuthenticatedUserId(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("delete-account: getUser failed", msg);
  }
  if (!userId) {
    return json({ ok: false, error: "Not authenticated." }, { status: 401, headers: cors });
  }

  try {
    const paths = await listUserStoragePaths(userId);
    await removeStoragePaths(paths);
    await deleteUserIrisRows(userId);
    const del = await deleteAuthUser(userId);
    if (!del.ok) {
      return json({ ok: false, error: del.error ?? "Account delete failed." }, { status: 200, headers: cors });
    }
    return json({ ok: true }, { status: 200, headers: cors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("delete-account: failed", msg);
    return json({ ok: false, error: msg }, { status: 200, headers: cors });
  }
});
