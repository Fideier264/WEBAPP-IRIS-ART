// Supabase Edge Function: iris-enhance
// Gemini native image (Nano Banana / flash-image): iris edit → base64 image.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const NANO_BANANA_2_API_KEY = Deno.env.get("NANO_BANANA_2_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Default: Nano Banana 3.1 (preview). Older/stable: {@link STABLE_GEMINI_IMAGE_MODEL}. */
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
/** Automatic fallback when primary is not 2.5 (e.g. preview 500s). Override with `GEMINI_IMAGE_FALLBACK_MODEL`. */
const STABLE_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

function geminiApiBase(): string {
  const v = Deno.env.get("GEMINI_API_VERSION")?.trim();
  if (v === "v1") return "https://generativelanguage.googleapis.com/v1";
  return "https://generativelanguage.googleapis.com/v1beta";
}

function geminiGenerateUrl(model: string) {
  return `${geminiApiBase()}/models/${model}:generateContent`;
}

function primaryImageModel(): string {
  return Deno.env.get("GEMINI_IMAGE_MODEL")?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
}

/** If set, we retry on 5xx with this model (e.g. after preview fails). */
function fallbackImageModel(): string | null {
  const explicit = Deno.env.get("GEMINI_IMAGE_FALLBACK_MODEL")?.trim();
  if (explicit) return explicit;
  const primary = primaryImageModel();
  if (primary !== STABLE_GEMINI_IMAGE_MODEL) return STABLE_GEMINI_IMAGE_MODEL;
  return null;
}

/** Comma-separated override, e.g. `gemini-3.1-flash-image-preview,gemini-2.5-flash-image` */
function allModelsToTry(): string[] {
  const raw = Deno.env.get("GEMINI_IMAGE_MODELS")?.trim();
  if (raw) {
    return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  }
  const models = [primaryImageModel(), fallbackImageModel()].filter(
    (m): m is string => Boolean(m),
  );
  return [...new Set(models)];
}

function imageOutputSize(): string {
  const raw = Deno.env.get("GEMINI_IMAGE_SIZE")?.trim();
  if (raw) return raw;
  return "1K";
}

/** Optional global seed when GEMINI_IMAGE_USE_GLOBAL_SEED=1 (legacy). */
function imageGenSeed(): number {
  const raw = Deno.env.get("GEMINI_IMAGE_SEED");
  if (!raw) return 42;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 42;
}

function imageGenTemperature(): number {
  const raw = Deno.env.get("GEMINI_IMAGE_TEMPERATURE");
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0;
}

function imageGenTemperatureStrict(): number {
  if (Deno.env.get("GEMINI_IMAGE_ALLOW_NONZERO_TEMP") === "1") {
    return Math.min(0.1, imageGenTemperature());
  }
  return 0;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function seedFromUtf8String(s: string): Promise<number> {
  const enc = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  const arr = new Uint8Array(hash);
  let n = 0;
  for (let i = 0; i < 4; i++) n = ((n << 8) | arr[i]!) >>> 0;
  const m = n % 2147483647;
  return m === 0 ? 1 : m;
}

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
  // For production, restrict origin(s) if desired.
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

type Body = {
  imageUrl: string;
  backgroundMode?: "black" | "white";
  artStyle?: string;
};

type ColorHints = {
  primaryHex: string;
  colorCategory: string;
};

async function fetchImageAsBase64(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`input image fetch failed: HTTP ${resp.status} ${text}`);
  }
  const ct = resp.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`input image appears empty (bytes=${bytes.length})`);
  // Keep function within compute/memory limits.
  if (bytes.length > 2_500_000) {
    throw new Error(`input image too large (${bytes.length} bytes). Please crop tighter before upload.`);
  }
  const isJpeg = looksLikeJpeg(bytes);
  const isPng = looksLikePng(bytes);
  if (!isJpeg && !isPng) {
    throw new Error(`input image is not JPEG/PNG (content-type=${ct.slice(0, 80)}, bytes=${bytes.length})`);
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const b64 = btoa(binary);
  const fingerprint = await sha256Hex(bytes);
  const mimeType = ct.startsWith("image/") ? ct : "image/jpeg";
  return {
    base64: b64,
    mimeType,
    bytes: bytes.length,
    fingerprint,
    /** Raw bytes for Files API upload (avoids huge inline base64 → fewer HTTP 500 from Gemini). */
    rawBytes: bytes,
  };
}

const FILES_API_UPLOAD = "https://generativelanguage.googleapis.com/upload/v1beta/files";

async function waitForGeminiFileActive(fileName: string, apiKey: string): Promise<void> {
  // Resource name is e.g. `files/abc123` — path must be `/v1beta/files/abc123`, not a single encoded segment.
  const url = `https://generativelanguage.googleapis.com/v1beta/${fileName}`;
  for (let i = 0; i < 30; i++) {
    const r = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    const t = await r.text();
    if (!r.ok) {
      throw new Error(`files.get failed: HTTP ${r.status} ${t.slice(0, 400)}`);
    }
    let state: string | undefined;
    try {
      const j = JSON.parse(t) as { file?: { state?: string }; state?: string };
      state = j.file?.state ?? j.state;
    } catch {
      throw new Error(`files.get: invalid JSON ${t.slice(0, 200)}`);
    }
    if (state === "ACTIVE") return;
    if (state === "FAILED") throw new Error("Gemini file processing FAILED");
    await sleep(400);
  }
  throw new Error("Gemini file did not become ACTIVE in time");
}

/** Resumable upload per https://ai.google.dev/gemini-api/docs/files — returns `file.uri` for generateContent. */
async function uploadBytesToGeminiFiles(bytes: Uint8Array, mimeType: string): Promise<{ fileUri: string; fileName: string }> {
  const apiKey = NANO_BANANA_2_API_KEY ?? "";
  const startResp = await fetch(FILES_API_UPLOAD, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `irisart_${Date.now()}` } }),
  });
  if (!startResp.ok) {
    const t = await startResp.text();
    throw new Error(`Files API start: HTTP ${startResp.status} ${t.slice(0, 600)}`);
  }
  const uploadUrl = startResp.headers.get("x-goog-upload-url") ?? startResp.headers.get("X-Goog-Upload-Url");
  if (!uploadUrl) {
    throw new Error("Files API: missing x-goog-upload-url");
  }
  const upResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  const upText = await upResp.text();
  if (!upResp.ok) {
    throw new Error(`Files API upload: HTTP ${upResp.status} ${upText.slice(0, 600)}`);
  }
  const meta = JSON.parse(upText) as { file?: { uri?: string; name?: string } };
  const uri = meta.file?.uri;
  const name = meta.file?.name;
  if (!uri || !name) {
    throw new Error(`Files API: bad response ${upText.slice(0, 400)}`);
  }
  await waitForGeminiFileActive(name, apiKey);
  return { fileUri: uri, fileName: name };
}

function normalizeImageMime(ct: string): string {
  return ct.toLowerCase().includes("png") ? "image/png" : "image/jpeg";
}

function buildPrompt(backgroundMode: "black" | "white", artStyle: string, colorHints?: ColorHints) {
  const bgText = backgroundMode === "white" ? "solid pure white" : "solid pure black";
  const colorLine = colorHints
    ? `COLOR PALETTE: Base color should strictly be ${colorHints.primaryHex} (${colorHints.colorCategory}), ignore environmental lighting tint of source image.`
    : "COLOR PALETTE: Preserve the original natural iris base pigmentation and ignore environmental lighting tint of source image.";
  return [
    "Turn this eye photo into a clean, centered iris artwork.",
    `Style intent: ${artStyle}.`,
    "The output must contain only the iris as a circular subject with realistic, high-detail fibers and striations.",
    "Preserve the natural iris pigmentation from the input: match hue, saturation, and overall color temperature closely.",
    "Do not reinterpret or shift the eye color (e.g. brown must stay brown, blue stays blue); keep pigment spots and rings consistent with the source.",
    colorLine,
    "Text prompt has elevated weight vs misleading source color cast (target guidance strength ~= 0.45).",
    "Remove reflections/glare/specular highlights and remove camera artifacts or guide marks.",
    `Use a ${bgText} background only.`,
    "No eyelids, no sclera, no eyelashes, no text, no watermark.",
    "Keep the iris centered and filling most of the image area.",
  ].join(" ");
}

/**
 * REST JSON for generativelanguage.googleapis.com uses camelCase in official JS examples
 * (`inlineData`, `mimeType`). Snake_case `inline_data` works for some calls but has
 * triggered opaque HTTP 500s for image+generationConfig on certain models.
 */
type ResponseShape = "TEXT_IMAGE" | "IMAGE_ONLY";

type ImageInput =
  | { mode: "inline"; base64: string; mime: string; variant: "camel" | "snake" }
  | { mode: "file"; fileUri: string; mime: string; variant: "camel" | "snake" };

function buildImagePayload(
  imageInput: ImageInput,
  backgroundMode: "black" | "white",
  artStyle: string,
  colorHints: ColorHints | undefined,
  includeSeed: boolean,
  seed: number,
  includeImageConfig: boolean,
  responseShape: ResponseShape,
  includeTemperature: boolean,
) {
  const textPart = { text: buildPrompt(backgroundMode, artStyle, colorHints) };
  let imagePart: Record<string, unknown>;
  if (imageInput.mode === "inline") {
    imagePart =
      imageInput.variant === "camel"
        ? { inlineData: { mimeType: imageInput.mime, data: imageInput.base64 } }
        : { inline_data: { mime_type: imageInput.mime, data: imageInput.base64 } };
  } else {
    imagePart =
      imageInput.variant === "camel"
        ? { fileData: { mimeType: imageInput.mime, fileUri: imageInput.fileUri } }
        : { file_data: { mime_type: imageInput.mime, file_uri: imageInput.fileUri } };
  }

  const generationConfig: Record<string, unknown> = {};
  if (includeTemperature) {
    generationConfig.temperature = imageGenTemperatureStrict();
  }
  generationConfig.responseModalities = responseShape === "IMAGE_ONLY"
    ? ["IMAGE"]
    : ["TEXT", "IMAGE"];
  if (includeImageConfig) {
    generationConfig.imageConfig = {
      aspectRatio: "1:1",
      imageSize: imageOutputSize(),
    };
  }
  if (includeSeed && Deno.env.get("GEMINI_IMAGE_NO_SEED") !== "1") {
    generationConfig.seed = seed;
  }

  return {
    contents: [
      {
        parts: [textPart, imagePart],
      },
    ],
    generationConfig,
  };
}


function parseGeminiImageResponse(data: Record<string, unknown>): { outputBase64: string; mimeType: string } {
  const parts = (data as { candidates?: Array<{ content?: { parts?: unknown[] } }> })?.candidates?.[0]?.content
    ?.parts as unknown[] | undefined;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Gemini returned no candidates/content parts.");
  }

  for (const p of parts) {
    const part = p as Record<string, unknown>;
    const inline = part?.inlineData ?? part?.inline_data;
    const inlineObj = inline as Record<string, unknown> | undefined;
    const b64 = inlineObj?.data as string | undefined;
    const mime = (inlineObj?.mimeType ?? inlineObj?.mime_type ?? "image/png") as string;
    if (b64 && typeof b64 === "string") {
      return { outputBase64: b64, mimeType: mime };
    }
  }

  throw new Error("Gemini response did not include inline image data.");
}

function geminiFetchTimeoutMs(): number {
  const raw = Deno.env.get("GEMINI_IMAGE_FETCH_TIMEOUT_MS")?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 15_000) return Math.min(n, 240_000);
  }
  return 110_000;
}

async function postGeminiImage(
  model: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; body: string }> {
  const ms = geminiFetchTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  let resp: Response;
  try {
    resp = await fetch(geminiGenerateUrl(model), {
      method: "POST",
      headers: {
        "x-goog-api-key": NANO_BANANA_2_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      console.error("iris-enhance: Gemini fetch aborted (timeout)", { model, timeoutMs: ms });
      return { ok: false, status: 0, body: `Gemini request timed out after ${ms}ms` };
    }
    throw e;
  }
  clearTimeout(timer);
  const text = await resp.text().catch(() => "");
  if (!resp.ok) {
    console.error("iris-enhance: Gemini raw HTTP body", {
      status: resp.status,
      bodyPreview: typeof text === "string" ? text.slice(0, 4000) : "",
    });
    return { ok: false, status: resp.status, body: text };
  }
  try {
    return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { ok: false, status: resp.status, body: text || "Invalid JSON from Gemini." };
  }
}

function formatGeminiHttpError(status: number, body: string): string {
  let parsed: any = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* ignore */
  }
  const msg =
    parsed?.error?.message ??
    parsed?.message ??
    (typeof body === "string" && body.length ? body.slice(0, 800) : "Unknown Gemini error");
  const details = parsed?.error?.details ? ` | details=${JSON.stringify(parsed.error.details)}` : "";
  return `HTTP ${status} ${msg}${details}`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

type ImageAttempt = {
  model: string;
  variant: "camel" | "snake";
  includeImageConfig: boolean;
  includeSeed: boolean;
  responseShape: ResponseShape;
  includeTemperature: boolean;
  /** When true, use uploaded Files API `fileUri` instead of inline base64. */
  useFile: boolean;
  fileUri?: string;
};

function buildFileAttemptList(models: string[], seedAllowed: boolean, fileUri: string): ImageAttempt[] {
  const out: ImageAttempt[] = [];
  for (const model of models) {
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: true,
      fileUri,
    });
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: false,
      useFile: true,
      fileUri,
    });
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "IMAGE_ONLY",
      includeTemperature: false,
      useFile: true,
      fileUri,
    });
    if (seedAllowed) {
      out.push({
        model,
        variant: "camel",
        includeImageConfig: false,
        includeSeed: true,
        responseShape: "TEXT_IMAGE",
        includeTemperature: true,
        useFile: true,
        fileUri,
      });
    }
    out.push({
      model,
      variant: "snake",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: true,
      fileUri,
    });
    out.push({
      model,
      variant: "snake",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "IMAGE_ONLY",
      includeTemperature: false,
      useFile: true,
      fileUri,
    });
  }
  return out;
}

function buildAttemptList(models: string[], seedAllowed: boolean): ImageAttempt[] {
  const out: ImageAttempt[] = [];
  for (const model of models) {
    // Prefer: camel, TEXT+IMAGE, with temperature (doc default), no imageConfig.
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: false,
    });
    // Some backends 500 on temperature=0 + modalities — try without temperature field.
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: false,
      useFile: false,
    });
    // Docs also show IMAGE-only output modality for some flows.
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "IMAGE_ONLY",
      includeTemperature: false,
      useFile: false,
    });
    out.push({
      model,
      variant: "camel",
      includeImageConfig: true,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: false,
    });
    if (seedAllowed) {
      out.push({
        model,
        variant: "camel",
        includeImageConfig: false,
        includeSeed: true,
        responseShape: "TEXT_IMAGE",
        includeTemperature: true,
        useFile: false,
      });
    }
    out.push({
      model,
      variant: "snake",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: false,
    });
    out.push({
      model,
      variant: "snake",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "IMAGE_ONLY",
      includeTemperature: false,
      useFile: false,
    });
  }
  return out;
}

/** Fewer Gemini round-trips to avoid gateway **504** (idle timeout) when preview models are slow. */
function buildCompactAttemptsForModel(
  model: string,
  fileUri: string | undefined,
  seedAllowed: boolean,
): ImageAttempt[] {
  const out: ImageAttempt[] = [];
  if (fileUri) {
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: true,
      fileUri,
    });
    out.push({
      model,
      variant: "snake",
      includeImageConfig: false,
      includeSeed: false,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: true,
      fileUri,
    });
  }
  out.push({
    model,
    variant: "camel",
    includeImageConfig: false,
    includeSeed: false,
    responseShape: "TEXT_IMAGE",
    includeTemperature: true,
    useFile: false,
  });
  out.push({
    model,
    variant: "camel",
    includeImageConfig: false,
    includeSeed: false,
    responseShape: "TEXT_IMAGE",
    includeTemperature: false,
    useFile: false,
  });
  out.push({
    model,
    variant: "camel",
    includeImageConfig: false,
    includeSeed: false,
    responseShape: "IMAGE_ONLY",
    includeTemperature: false,
    useFile: false,
  });
  if (seedAllowed) {
    out.push({
      model,
      variant: "camel",
      includeImageConfig: false,
      includeSeed: true,
      responseShape: "TEXT_IMAGE",
      includeTemperature: true,
      useFile: false,
    });
  }
  return out;
}

function buildExtendedAttemptsForModel(
  model: string,
  fileUri: string | undefined,
  seedAllowed: boolean,
): ImageAttempt[] {
  const file = fileUri ? buildFileAttemptList([model], seedAllowed, fileUri) : [];
  const inline = buildAttemptList([model], seedAllowed);
  return [...file, ...inline];
}

function maxAttemptsPerModel(): number {
  const raw = Deno.env.get("GEMINI_IMAGE_MAX_ATTEMPTS_PER_MODEL")?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return Deno.env.get("GEMINI_IMAGE_EXTENDED_ATTEMPTS") === "1" ? 999 : 6;
}

async function callGeminiImageEdit(
  inputBase64: string,
  inputMimeType: string,
  backgroundMode: "black" | "white",
  artStyle: string,
  colorHints: ColorHints | undefined,
  seed: number,
  rawBytes?: Uint8Array,
): Promise<{ outputBase64: string; mimeType: string; modelUsed: string }> {
  const uniqueModels = allModelsToTry();

  const seedAllowed = Deno.env.get("GEMINI_IMAGE_NO_SEED") !== "1";
  const useFileApi = Deno.env.get("GEMINI_IMAGE_USE_FILE_API") !== "0";
  const mimeNorm = normalizeImageMime(inputMimeType);
  const compact = Deno.env.get("GEMINI_IMAGE_EXTENDED_ATTEMPTS") !== "1";
  const capPerModel = maxAttemptsPerModel();
  const enableImageCfg = Deno.env.get("GEMINI_IMAGE_ENABLE_IMAGE_CONFIG") === "1";

  let fileUri: string | undefined;
  if (useFileApi && rawBytes && rawBytes.length > 0) {
    try {
      const up = await uploadBytesToGeminiFiles(rawBytes, mimeNorm);
      fileUri = up.fileUri;
      console.log("iris-enhance: Files API upload OK", { fileName: up.fileName, bytes: rawBytes.length });
    } catch (e) {
      console.warn("iris-enhance: Files API upload failed, falling back to inline", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const attempts: ImageAttempt[] = [];
  for (const model of uniqueModels) {
    let chunk = compact
      ? buildCompactAttemptsForModel(model, fileUri, seedAllowed)
      : buildExtendedAttemptsForModel(model, fileUri, seedAllowed);
    if (!enableImageCfg) chunk = chunk.filter((a) => !a.includeImageConfig);
    if (chunk.length > capPerModel) chunk = chunk.slice(0, capPerModel);
    attempts.push(...chunk);
  }

  console.log("iris-enhance: attempt plan", {
    models: uniqueModels,
    compact,
    capPerModel,
    totalAttempts: attempts.length,
    geminiTimeoutMs: geminiFetchTimeoutMs(),
  });

  let lastErr = "Unknown error";
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]!;
    const imageInput: ImageInput =
      a.useFile && a.fileUri
        ? { mode: "file", fileUri: a.fileUri, mime: mimeNorm, variant: a.variant }
        : { mode: "inline", base64: inputBase64, mime: mimeNorm, variant: a.variant };
    const payload = buildImagePayload(
      imageInput,
      backgroundMode,
      artStyle,
      colorHints,
      a.includeSeed,
      seed,
      a.includeImageConfig,
      a.responseShape,
      a.includeTemperature,
    );
    console.log("iris-enhance: Gemini request", {
      model: a.model,
      variant: a.variant,
      includeImageConfig: a.includeImageConfig,
      includeSeed: a.includeSeed,
      responseShape: a.responseShape,
      includeTemperature: a.includeTemperature,
      imageSource: a.useFile ? "file" : "inline",
      colorHints,
      imageSize: a.includeImageConfig ? imageOutputSize() : "(default)",
    });

    const result = await postGeminiImage(a.model, payload);
    if (result.ok) {
      try {
        const parsed = parseGeminiImageResponse(result.data);
        return { ...parsed, modelUsed: a.model };
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        continue;
      }
    }

    lastErr =
      result.status === 0
        ? result.body
        : formatGeminiHttpError(result.status, result.body);
    const retryable =
      result.status === 500 ||
      result.status === 503 ||
      result.status === 429 ||
      result.status === 0;
    if (retryable && i < attempts.length - 1) {
      await sleep(300);
      continue;
    }
    if (!retryable) {
      throw new Error(`Gemini generateContent failed: ${lastErr}`);
    }
  }

  throw new Error(`Gemini generateContent failed: ${lastErr}`);
}

async function preflightFetchUrl(url: string) {
  // Quick reachability test before Gemini fetch.
  // Some hosts return 405 for HEAD even though GET works.
  try {
    const resp = await fetch(url, { method: "HEAD" });
    if (resp.status === 405) {
      return { ok: true as const };
    }
    if (resp.status >= 400) {
      return { ok: false as const, status: resp.status };
    }
    return { ok: true as const };
  } catch {
    // If HEAD fails for network/proxy reasons, let the main GET path decide.
    return { ok: true as const };
  }
}

function looksLikeJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function looksLikePng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

async function validateImageUrl(url: string, label: string) {
  try {
    const resp = await fetch(url);
    const ct = resp.headers.get("content-type") ?? "";
    const arr = new Uint8Array(await resp.arrayBuffer());

    if (!resp.ok) {
      return { ok: false as const, error: `${label} fetch failed (HTTP ${resp.status})` };
    }
    if (arr.length < 1000) {
      return { ok: false as const, error: `${label} appears empty (bytes=${arr.length})` };
    }

    const isJpeg = looksLikeJpeg(arr);
    const isPng = looksLikePng(arr);

    // Replicate expects actual images; if it's not JPEG/PNG bytes, return a clearer error.
    if (!isJpeg && !isPng) {
      return {
        ok: false as const,
        error: `${label} is not JPEG/PNG (content-type=${ct.slice(0, 80)}, bytes=${arr.length})`,
      };
    }

    if (!ct.startsWith("image/")) {
      // Signed URL sometimes returns unusual content-type; still allow if bytes look correct.
      console.warn("iris-enhance: unexpected image content-type", { label, contentType: ct });
    }

    return { ok: true as const, bytes: arr.length, contentType: ct };
  } catch (e) {
    return {
      ok: false as const,
      error: `${label} validation failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function isHttpOrHttpsUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function colorCategoryFromHex(hex: string): string {
  const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) return "unknown";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const sat = max === 0 ? 0 : delta / max;
  const val = max / 255;
  if (sat < 0.14) {
    if (val < 0.2) return "near_black";
    if (val > 0.82) return "near_white";
    return "gray";
  }
  if (r > g && r > b) return g > b && r - g < 28 ? "amber" : "brown";
  if (g >= r && g >= b) return "green";
  if (b >= r && b >= g) return "blue";
  return "hazel";
}

async function getColorHintsFromEyeProfiles(fingerprint: string): Promise<ColorHints | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const u = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/eye_profiles`);
    u.searchParams.set("select", "analysis");
    u.searchParams.set("image_fingerprint", `eq.${fingerprint}`);
    u.searchParams.set("limit", "1");
    const resp = await fetch(u.toString(), {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!resp.ok) return null;
    const rows = await resp.json() as Array<{ analysis?: Record<string, unknown> }>;
    const analysis = rows?.[0]?.analysis;
    if (!analysis || typeof analysis !== "object") return null;
    const primaryHexRaw = analysis.primary_hex ?? analysis.primaryHex;
    const hexCodes = Array.isArray(analysis.hexCodes) ? analysis.hexCodes as unknown[] : [];
    const primaryHex = typeof primaryHexRaw === "string" && /^#?[0-9A-Fa-f]{6}$/.test(primaryHexRaw)
      ? (primaryHexRaw.startsWith("#") ? primaryHexRaw.toUpperCase() : `#${primaryHexRaw.toUpperCase()}`)
      : typeof hexCodes[0] === "string" && /^#?[0-9A-Fa-f]{6}$/.test(hexCodes[0] as string)
      ? ((hexCodes[0] as string).startsWith("#") ? (hexCodes[0] as string).toUpperCase() : `#${(hexCodes[0] as string).toUpperCase()}`)
      : null;
    if (!primaryHex) return null;
    const ccRaw = analysis.color_category ?? analysis.colorCategory;
    const colorCategory = typeof ccRaw === "string" && ccRaw.trim().length ? ccRaw.trim() : colorCategoryFromHex(primaryHex);
    return { primaryHex, colorCategory };
  } catch {
    return null;
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

  if (!NANO_BANANA_2_API_KEY) {
    console.error("iris-enhance: missing NANO_BANANA_2_API_KEY secret.");
    return json(
      { ok: false, error: "Missing NANO_BANANA_2_API_KEY secret on the server." },
      {
        status: 200,
        headers: cors,
      },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, { status: 200, headers: cors });
  }

  if (!body?.imageUrl || typeof body.imageUrl !== "string") {
    return json(
      { ok: false, error: "imageUrl is required." },
      { status: 200, headers: cors },
    );
  }

  if (!isHttpOrHttpsUrl(body.imageUrl)) {
    return json({ ok: false, error: "imageUrl must be a valid http(s) URL." }, { status: 200, headers: cors });
  }

  try {
    const backgroundMode = body.backgroundMode === "white" ? "white" : "black";
    const DEFAULT_ART_STYLE = "iris_nanobanana_v1";
    const artStyle = typeof body.artStyle === "string" && body.artStyle.trim()
      ? body.artStyle.trim().slice(0, 64)
      : DEFAULT_ART_STYLE;
    console.log("iris-enhance: received request", {
      hasImageUrl: typeof body.imageUrl === "string",
      backgroundMode,
      artStyle,
    });

    const input = await fetchImageAsBase64(body.imageUrl);
    const colorHintsPromise = getColorHintsFromEyeProfiles(input.fingerprint);
    let seed = 1;
    let seedUsed: number | null = null;
    if (Deno.env.get("GEMINI_IMAGE_NO_SEED") !== "1") {
      seed =
        Deno.env.get("GEMINI_IMAGE_USE_GLOBAL_SEED") === "1"
          ? imageGenSeed()
          : await seedFromUtf8String(`${input.fingerprint}|${backgroundMode}|${artStyle}`);
      seedUsed = seed;
    }
    const colorHints = await colorHintsPromise;
    console.log("iris-enhance: input bytes prepared", {
      imageBytes: input.bytes,
      imageCt: input.mimeType,
      fingerprintPrefix: input.fingerprint.slice(0, 12),
      colorHints,
    });
    const generated = await callGeminiImageEdit(
      input.base64,
      input.mimeType,
      backgroundMode,
      artStyle,
      colorHints ?? undefined,
      seed,
      input.rawBytes,
    );
    return json(
      {
        ok: true,
        outputBase64: generated.outputBase64,
        mimeType: generated.mimeType,
        imageFingerprint: input.fingerprint,
        artStyle,
        seedUsed,
        geminiModel: generated.modelUsed,
      },
      { status: 200, headers: cors },
    );
  } catch (e) {
    console.error("iris-enhance: failed", { message: e instanceof Error ? e.message : String(e) });
    const msg = e instanceof Error ? e.message : String(e);
    return json(
      { ok: false, error: msg },
      { status: 200, headers: cors },
    );
  }
});

