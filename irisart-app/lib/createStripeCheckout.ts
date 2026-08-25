import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { extractStatus, invokeEdgeFunction } from './invokeEdgeFunction';
import type { OrderShippingInput } from './createMerchOneOrder';

export type CreateCheckoutSessionInput = {
  printFileUrl: string;
  templateId: string;
  productSku: string;
  shipping: OrderShippingInput;
  externalId?: string;
  /** Shown on Stripe line item when server catalog has no label */
  productLabel?: string;
};

export type CreateCheckoutSessionResult =
  | {
      ok: true;
      sessionId: string;
      url: string;
      amountCents: number;
      currency: string;
      label: string;
    }
  | { ok: false; error: string };

function getAppOrigin(): string | undefined {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const fromEnv = process.env.EXPO_PUBLIC_APP_ORIGIN?.trim();
  return fromEnv || undefined;
}

async function messageFromInvokeError(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === 'string' && e.trim()) return e.trim();
  }

  const anyErr = error as {
    message?: string;
    context?: { json?: () => Promise<unknown>; text?: () => Promise<string>; status?: number };
  } | null;

  const ctx = anyErr?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string; message?: string };
      if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
      if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim();
    } catch {
      /* ignore */
    }
  }
  if (ctx && typeof ctx.text === 'function') {
    try {
      const text = await ctx.text();
      if (text?.trim()) return text.trim().slice(0, 400);
    } catch {
      /* ignore */
    }
  }

  const status = extractStatus(error);
  if (status === 404) {
    return 'Edge Function create-checkout-session nicht gefunden. Bitte deployen.';
  }
  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message.trim();
  return 'Checkout session failed.';
}

export async function requestCreateCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResult> {
  const appOrigin = getAppOrigin();
  if (!appOrigin) {
    return {
      ok: false,
      error:
        'App-URL fehlt (appOrigin). Setze EXPO_PUBLIC_APP_ORIGIN oder öffne die Web-App über https://…',
    };
  }

  const invoke = await invokeEdgeFunction<{
    ok?: boolean;
    sessionId?: string;
    url?: string;
    amountCents?: number;
    currency?: string;
    label?: string;
    error?: string;
  }>('create-checkout-session', {
    printFileUrl: input.printFileUrl,
    templateId: input.templateId,
    productSku: input.productSku,
    shipping: input.shipping,
    externalId: input.externalId,
    appOrigin,
    productLabel: input.productLabel,
  });

  if (invoke.error) {
    return { ok: false, error: await messageFromInvokeError(invoke.error, invoke.data) };
  }

  const data = invoke.data;
  if (!data?.ok || !data.url || !data.sessionId) {
    return { ok: false, error: data?.error ?? 'Checkout session failed.' };
  }

  return {
    ok: true,
    sessionId: data.sessionId,
    url: data.url,
    amountCents: typeof data.amountCents === 'number' ? data.amountCents : 0,
    currency: data.currency ?? 'eur',
    label: data.label ?? 'IrisArt Leinwand',
  };
}

/** Open Stripe Checkout (web redirect or native browser). */
export async function openCheckoutUrl(url: string): Promise<void> {
  if (!url.startsWith('https://')) {
    throw new Error('Ungültige Stripe-URL.');
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

const TEXTURE_STORAGE_KEY = 'irisart_checkout_texture_uri';
const TEMPLATE_STORAGE_KEY = 'irisart_checkout_template_id';

export function rememberCheckoutTexture(uri: string) {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TEXTURE_STORAGE_KEY, uri);
    }
  } catch {
    /* ignore */
  }
}

export function restoreCheckoutTexture(): string | undefined {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(TEXTURE_STORAGE_KEY) ?? undefined;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function rememberCheckoutTemplate(templateId: string) {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TEMPLATE_STORAGE_KEY, templateId);
    }
  } catch {
    /* ignore */
  }
}

export function restoreCheckoutTemplate(): string | undefined {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(TEMPLATE_STORAGE_KEY) ?? undefined;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
