import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import { invokeEdgeFunction } from './invokeEdgeFunction';
import type { OrderShippingInput } from './createMerchOneOrder';

export type CreateCheckoutSessionInput = {
  printFileUrl: string;
  productSku: string;
  shipping: OrderShippingInput;
  externalId?: string;
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

export async function requestCreateCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResult> {
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
    productSku: input.productSku,
    shipping: input.shipping,
    externalId: input.externalId,
    appOrigin: getAppOrigin(),
  });

  if (invoke.error) {
    const anyErr = invoke.error as { message?: string };
    return { ok: false, error: anyErr?.message ?? 'Checkout session failed.' };
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
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('Cannot open Stripe Checkout URL.');
  await Linking.openURL(url);
}
