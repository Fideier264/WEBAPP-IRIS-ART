import { supabase } from './supabase';

export const IRIS_NANO_BANANA_ART_STYLE = 'iris_nanobanana_v1';

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractStatus(err: any): number | undefined {
  return typeof err?.context?.status === 'number'
    ? err.context.status
    : typeof err?.status === 'number'
      ? err.status
      : undefined;
}

export async function requestNanoBananaIris({
  imageUrl,
  backgroundMode = 'black',
  artStyle = IRIS_NANO_BANANA_ART_STYLE,
}: {
  imageUrl: string;
  backgroundMode?: 'black' | 'white';
  /** Must stay stable for the same product look; changing this yields a new deterministic seed server-side. */
  artStyle?: string;
}) {
  let invoke = await supabase.functions.invoke('iris-enhance', {
    body: { imageUrl, backgroundMode, artStyle },
  });
  for (let i = 0; i < 2 && invoke.error; i++) {
    const status = extractStatus(invoke.error);
    const retryable = status === 546 || status === 503 || status === 429 || status === 500;
    if (!retryable) break;
    await sleep(450 * (i + 1));
    invoke = await supabase.functions.invoke('iris-enhance', {
      body: { imageUrl, backgroundMode, artStyle },
    });
  }

  if (invoke.error) {
    const anyErr = invoke.error as any;
    let headerError: string | undefined;
    const headers = anyErr?.context?.headers;
    try {
      // Supabase-js may expose headers as a `Headers` instance.
      if (headers?.get && typeof headers.get === 'function') {
        const raw = headers.get('x-irisart-error') ?? headers.get('X-Irisart-Error');
        if (raw) headerError = decodeURIComponent(raw);
      } else if (headers && typeof headers === 'object') {
        const raw =
          (headers['x-irisart-error'] as string | undefined) ??
          (headers['X-Irisart-Error'] as string | undefined) ??
          (headers['x-irisart-error'.toLowerCase()] as string | undefined);
        if (raw) headerError = decodeURIComponent(raw);
      }
    } catch {
      // ignore
    }

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

    const contextDump =
      anyErr?.context && typeof anyErr.context === 'object' ? JSON.stringify(anyErr.context, null, 2) : undefined;

    throw new Error(
      [
        `Edge function iris-enhance failed${status ? ` (HTTP ${status})` : ''}.`,
        status === 546 ? 'Temporary compute limit reached. Please retry.' : undefined,
        status === 503 ? 'Temporary service overload. Please retry.' : undefined,
        anyErr?.message ? `Message: ${String(anyErr.message)}` : undefined,
        bodyText ? `Body: ${bodyText}` : undefined,
        headerError ? `Server error: ${headerError}` : undefined,
        contextDump ? `Context: ${contextDump}` : undefined,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  const data = invoke.data as
    | { ok?: boolean; outputBase64?: string; mimeType?: string; outputUrl?: string; error?: string }
    | null;

  if (!data) throw new Error('Nano Banana generation failed (no response data).');
  if (data.ok === false) throw new Error(data.error ?? 'Nano Banana generation failed.');
  if (data.outputBase64) {
    return { kind: 'base64' as const, outputBase64: data.outputBase64, mimeType: data.mimeType ?? 'image/png' };
  }
  if (data.outputUrl) {
    throw new Error(
      'Legacy edge function format detected (outputUrl). Please deploy latest supabase/functions/iris-enhance so Nano Banana output (outputBase64) is used.'
    );
  }
  throw new Error(data.error ?? 'Nano Banana generation failed.');
}

