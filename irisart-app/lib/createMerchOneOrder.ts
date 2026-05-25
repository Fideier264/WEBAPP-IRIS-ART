import { supabase } from './supabase';

export type OrderShippingInput = {
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

export type CreateMerchOneOrderInput = {
  printFileUrl: string;
  productSku: string;
  shipping: OrderShippingInput;
  externalId?: string;
};

export type CreateMerchOneOrderResult =
  | { ok: true; orderId: string | null; isTest: boolean }
  | { ok: false; error: string };

export async function requestCreateMerchOneOrder(input: CreateMerchOneOrderInput): Promise<CreateMerchOneOrderResult> {
  const invoke = await supabase.functions.invoke('create-merchone-order', {
    body: {
      printFileUrl: input.printFileUrl,
      productSku: input.productSku,
      shipping: input.shipping,
      externalId: input.externalId,
    },
  });

  if (invoke.error) {
    const anyErr = invoke.error as any;
    const status =
      typeof anyErr?.context?.status === 'number'
        ? anyErr.context.status
        : typeof anyErr?.status === 'number'
          ? anyErr.status
          : undefined;
    const bodyText =
      typeof anyErr?.context?.body === 'string'
        ? anyErr.context.body
        : typeof anyErr?.context?.response === 'string'
          ? anyErr.context.response
          : undefined;
    return {
      ok: false,
      error: [
        `create-merchone-order failed${status ? ` (HTTP ${status})` : ''}.`,
        anyErr?.message ? String(anyErr.message) : undefined,
        bodyText ? `Body: ${bodyText}` : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  const data = invoke.data as
    | { ok?: boolean; orderId?: string | null; isTest?: boolean; error?: string }
    | null;

  if (!data || data.ok === false) {
    return { ok: false, error: data?.error ?? 'Order failed.' };
  }

  return {
    ok: true,
    orderId: data.orderId ?? null,
    isTest: Boolean(data.isTest),
  };
}
