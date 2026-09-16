import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { configFromBuildExtra } from './appConfigCore';
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

function getWebAppOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  return (configFromBuildExtra().appOrigin || process.env.EXPO_PUBLIC_APP_ORIGIN || 'https://irisart.app')
    .trim()
    .replace(/\/$/, '');
}

/** Stripe return URLs: HTTPS on web, app scheme on native so payment returns into the app. */
export function getCheckoutReturnUrls(): { successUrl: string; cancelUrl: string; appOrigin: string } {
  const appOrigin = getWebAppOrigin();
  if (Platform.OS === 'web') {
    return {
      appOrigin,
      successUrl: `${appOrigin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appOrigin}/checkout?canceled=1`,
    };
  }
  // Custom scheme (must match app.json "scheme"). Stripe supports this for mobile return.
  return {
    appOrigin,
    successUrl: 'irisartapp://order-success?session_id={CHECKOUT_SESSION_ID}',
    cancelUrl: 'irisartapp://checkout?canceled=1',
  };
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
  const { appOrigin, successUrl, cancelUrl } = getCheckoutReturnUrls();

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
    successUrl,
    cancelUrl,
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

/**
 * Open Stripe Checkout.
 * Native: in-app auth browser that closes when Stripe redirects to irisartapp://…
 * Web: full-page redirect.
 */
export async function openCheckoutUrl(url: string): Promise<{ type: string; url?: string }> {
  if (!url.startsWith('https://')) {
    throw new Error('Ungültige Stripe-URL.');
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return { type: 'redirect' };
  }

  // Must match Stripe success/cancel scheme (irisartapp://…), not Expo Go exp:// from createURL.
  const returnUrl = 'irisartapp://';
  try {
    await WebBrowser.warmUpAsync();
  } catch {
    /* ignore */
  }

  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);

  if (result.type === 'success' && 'url' in result && typeof result.url === 'string') {
    const returned = result.url;
    try {
      const parsed = Linking.parse(returned);
      const path = (parsed.path ?? '').replace(/^\//, '');
      const q = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;
      const sessionId = typeof q.session_id === 'string' ? q.session_id : undefined;
      const { router } = await import('expo-router');
      if (path.includes('order-success') || returned.includes('order-success')) {
        router.replace({
          pathname: '/order-success',
          params: sessionId ? { session_id: sessionId } : {},
        });
        return { type: 'success', url: returned };
      }
      if (path.includes('checkout') || returned.includes('canceled')) {
        router.replace({ pathname: '/checkout', params: { canceled: '1' } });
        return { type: 'cancel', url: returned };
      }
    } catch {
      await Linking.openURL(returned);
    }
    return { type: 'success', url: returned };
  }

  if (result.type === 'dismiss' || result.type === 'cancel') {
    return { type: result.type };
  }

  await Linking.openURL(url);
  return { type: 'opened' };
}

const TEXTURE_STORAGE_KEY = 'irisart_checkout_texture_uri';
const TEXTURE2_STORAGE_KEY = 'irisart_checkout_texture_uri_2';
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

export function rememberCheckoutTexture2(uri: string | undefined) {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      if (uri) sessionStorage.setItem(TEXTURE2_STORAGE_KEY, uri);
      else sessionStorage.removeItem(TEXTURE2_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function restoreCheckoutTexture2(): string | undefined {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(TEXTURE2_STORAGE_KEY) ?? undefined;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

const SECONDARY_COLOR_STORAGE_KEY = 'irisart_checkout_secondary_color';

export function rememberCheckoutSecondaryColor(enabled: boolean) {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SECONDARY_COLOR_STORAGE_KEY, enabled ? '1' : '0');
    }
  } catch {
    /* ignore */
  }
}

export function restoreCheckoutSecondaryColor(): boolean {
  try {
    if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(SECONDARY_COLOR_STORAGE_KEY) !== '0';
    }
  } catch {
    /* ignore */
  }
  return true;
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
