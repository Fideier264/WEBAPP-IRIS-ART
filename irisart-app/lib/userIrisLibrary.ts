import * as FileSystem from '@/lib/platformFileSystem';
import { Buffer } from 'buffer';

import { supabase } from './supabase';

export const AUTH_REQUIRED = 'AUTH_REQUIRED';

export class AuthRequiredError extends Error {
  code = AUTH_REQUIRED;
  constructor(message = 'Login required to save iris images.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export function isAuthRequiredError(e: unknown): e is AuthRequiredError {
  return (
    e instanceof AuthRequiredError ||
    (typeof e === 'object' && e !== null && (e as any).code === AUTH_REQUIRED)
  );
}

export type UserIrisItem = {
  id: string;
  uri: string;
  fingerprint?: string;
  createdAt: number;
  lastUsedAt: number;
  storagePath?: string;
};

const BUCKET = 'user-irises';
const SIGNED_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

function randomId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new AuthRequiredError();
  return data.user.id;
}

async function readLocalFileBytes(uri: string): Promise<{ bytes: Buffer; contentType: string; ext: string }> {
  const lower = uri.toLowerCase();
  const contentType = lower.includes('.png') || lower.includes('image/png') ? 'image/png' : 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const base64Encoding =
    (FileSystem as any).EncodingType?.Base64 ?? (FileSystem as any).EncodingType?.base64 ?? 'base64';
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: base64Encoding as any });
  if (!base64 || base64.length < 200) {
    throw new Error('Local iris file appears empty.');
  }
  return { bytes: Buffer.from(base64, 'base64'), contentType, ext };
}

export async function getUserIrisLibrary(): Promise<UserIrisItem[]> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (e) {
    if (isAuthRequiredError(e)) return [];
    throw e;
  }

  const { data, error } = await supabase
    .from('user_irises')
    .select('id, storage_path, fingerprint, created_at, last_used_at')
    .eq('user_id', userId)
    .order('last_used_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const items: UserIrisItem[] = [];
  for (const row of data) {
    const signed = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, SIGNED_TTL_SEC);
    if (signed.error || !signed.data?.signedUrl) continue;
    items.push({
      id: row.id,
      uri: signed.data.signedUrl,
      fingerprint: row.fingerprint ?? undefined,
      createdAt: new Date(row.created_at).getTime(),
      lastUsedAt: new Date(row.last_used_at).getTime(),
      storagePath: row.storage_path,
    });
  }
  return items;
}

export async function upsertUserIris(uri: string, fingerprint?: string) {
  const userId = await requireUserId();
  const nowIso = new Date().toISOString();

  if (fingerprint) {
    const existing = await supabase
      .from('user_irises')
      .select('id, storage_path')
      .eq('user_id', userId)
      .eq('fingerprint', fingerprint)
      .maybeSingle();

    if (existing.data?.id) {
      await supabase
        .from('user_irises')
        .update({ last_used_at: nowIso })
        .eq('id', existing.data.id)
        .eq('user_id', userId);
      return;
    }
  }

  const { bytes, contentType, ext } = await readLocalFileBytes(uri);
  const id = randomId();
  const storagePath = `${userId}/${id}.${ext}`;

  const upload = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const insert = await supabase.from('user_irises').insert({
    user_id: userId,
    storage_path: storagePath,
    fingerprint: fingerprint ?? null,
    created_at: nowIso,
    last_used_at: nowIso,
  });
  if (insert.error) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(insert.error.message);
  }
}

export async function removeUserIris(id: string) {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('user_irises')
    .select('id, storage_path')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;

  await supabase.storage.from(BUCKET).remove([data.storage_path]);
  const del = await supabase.from('user_irises').delete().eq('id', id).eq('user_id', userId);
  if (del.error) throw new Error(del.error.message);
}
