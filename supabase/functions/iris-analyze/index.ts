// Supabase Edge Function: iris-analyze
// Gemini Vision: structured iris color + rarity-style narrative (fictional stats) + HEX palette.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const NANO_BANANA_2_API_KEY = Deno.env.get("NANO_BANANA_2_API_KEY");
// 2.0-* models are deprecated for new keys; 2.5 Flash is the current fast vision+JSON choice.
const GEMINI_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL") ?? "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function analysisTemperature(): number {
  const raw = Deno.env.get("GEMINI_ANALYSIS_TEMPERATURE");
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0;
}

/** Default 0; only if GEMINI_ANALYSIS_ALLOW_NONZERO_TEMP=1, cap env temperature at 0.1. */
function analysisTemperatureStrict(): number {
  if (Deno.env.get("GEMINI_ANALYSIS_ALLOW_NONZERO_TEMP") === "1") {
    return Math.min(0.1, analysisTemperature());
  }
  return 0;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Stable 31-bit seed from fingerprint hex (64 chars). */
function seedFromFingerprintHex(fp: string): number {
  let n = 0;
  for (let i = 0; i < 8; i += 2) {
    n = (n * 256 + parseInt(fp.slice(i, i + 2), 16)) >>> 0;
  }
  const m = n % 2147483647;
  return m === 0 ? 1 : m;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function isCachedAnalysisRow(o: unknown): o is Record<string, unknown> {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.baseColorRaritySentence === "string" &&
    typeof r.hexCodes === "object" &&
    Array.isArray(r.hexCodes)
  );
}

async function getCachedAnalysis(fp: string): Promise<Record<string, unknown> | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const u = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/eye_profiles`);
  u.searchParams.set("select", "analysis");
  u.searchParams.set("image_fingerprint", `eq.${fp}`);
  u.searchParams.set("limit", "1");
  const r = await fetch(u.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) {
    console.warn("iris-analyze: eye_profiles read failed", r.status);
    return null;
  }
  const rows = await r.json() as Array<{ analysis?: unknown }>;
  const raw = rows?.[0]?.analysis;
  return isCachedAnalysisRow(raw) ? raw : null;
}

async function upsertCachedAnalysis(
  fp: string,
  analysis: Record<string, unknown>,
  model: string,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  const now = new Date().toISOString();
  const resp = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/eye_profiles`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      image_fingerprint: fp,
      analysis,
      gemini_model: model,
      updated_at: now,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.warn("iris-analyze: eye_profiles upsert failed", resp.status, t.slice(0, 200));
  }
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
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
  };
}

type Body = {
  imageUrl: string;
};

function looksLikeJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function looksLikePng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

async function fetchImageAsBase64(url: string) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`input image fetch failed: HTTP ${resp.status} ${text}`);
  }
  const ct = resp.headers.get("content-type") ?? "image/jpeg";
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`input image appears empty (bytes=${bytes.length})`);
  if (bytes.length > 2_500_000) {
    throw new Error(`input image too large (${bytes.length} bytes). Please use a smaller crop.`);
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
  return { base64: b64, mimeType: ct.startsWith("image/") ? ct : "image/jpeg", bytes: bytes.length };
}

function isHttpOrHttpsUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** JSON Schema für strukturierte Ausgabe (API erzwingt gültiges JSON — vermeidet kaputte Anführungszeichen in deutschen Sätzen). */
const IRIS_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    baseColorRarity: {
      type: "object",
      properties: {
        sentence: {
          type: "string",
          description: "Ein Satz zur Seltenheit der Grundfarbe (Deutsch). Keine doppelten Anführungszeichen im Text.",
        },
        percent: { type: "string", description: 'Kurz, z.B. "4%" oder ">2%".' },
      },
      required: ["sentence", "percent"],
    },
    specialFeatures: {
      type: "object",
      properties: {
        sentence: {
          type: "string",
          description: "Ein Satz zu Besonderheiten (Pigmentflecken, Ringe, Heterochromie, Deutsch).",
        },
      },
      required: ["sentence"],
    },
    combinedRarity: {
      type: "object",
      properties: {
        sentences: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 2,
          description:
            "Genau zwei Sätze: kombinierte Seltenheit. KEINE detaillierte Iris-Textur (Fasern, Furchen). Nur Farb-/Gesamt-Seltenheit.",
        },
        percent: { type: "string" },
      },
      required: ["sentences", "percent"],
    },
    uniqueStructureNote: {
      type: "string",
      description:
        "Kurzer eigener Satz: z.B. dass jede Iris einzigartige Strukturen hat. Nicht zur Vererbung zählen.",
    },
    inheritance: {
      type: "object",
      properties: {
        sentence: { type: "string", description: "Ein Satz Vererbung (Deutsch), ohne Struktur-Einzigartigkeit." },
        percent: { type: "string" },
      },
      required: ["sentence", "percent"],
    },
    hexCodes: {
      type: "array",
      items: { type: "string", description: "Format #RRGGBB" },
      description: "6–12 dominante Iris-Farben, kein #000000 oder #FFFFFF.",
    },
  },
  required: [
    "baseColorRarity",
    "specialFeatures",
    "combinedRarity",
    "uniqueStructureNote",
    "inheritance",
    "hexCodes",
  ],
};

const ANALYSIS_SYSTEM_PROMPT = [
  "Du analysierst ein Bild einer isolierten Iris (Augenfarbe, Muster, Ringe, Flecken).",
  "Keine medizinische Diagnose. Prozentangaben sind fiktive App-Schätzungen.",
  "",
  "WICHTIG: Arbeite lichtrobust und nicht wie eine Pipette.",
  "Ermittle die wahrscheinliche Basis-Pigmentierung der Iris auch bei harten Highlights, Schatten, Kamera-White-Balance oder Unterbelichtung.",
  "Ignoriere Spiegelungen/Glanzlichter, schwarze Pupille, Wimpern, Eyelid-Schatten und Hintergrund, wenn diese die Farbe verfälschen.",
  "hexCodes müssen die wahrgenommene Irispigmentierung repräsentieren (dominante + sekundäre Töne), nicht nur die hellsten/dunkelsten Einzelpixel.",
  "Keine willkürliche Verschiebung der Augenfarbe: ausgeleitete Töne müssen visuell plausibel zum Foto bleiben.",
  "Wenn Licht die Farbe entsättigt erscheinen lässt, gib die plausiblen zugrunde liegenden Pigmenttöne an (konservativ, nicht überkorrigieren).",
  "combinedRarity: keine detaillierte Textur; nur Farb- und Gesamt-Seltenheit.",
  "uniqueStructureNote: separater Kurzsatz zur Struktur-Einzigartigkeit — nicht in Vererbung wiederholen.",
  "hexCodes: 6–12 Werte als #RRGGBB.",
  "In allen Sätzen: keine unescaped \" im String — nutze keine Anführungszeichen im Fließtext oder ersetze durch Gedankenstriche.",
].join("\n");

type AnalysisJson = {
  baseColorRarity?: { sentence?: string; percent?: string };
  specialFeatures?: { sentence?: string };
  combinedRarity?: { sentences?: string[]; percent?: string };
  uniqueStructureNote?: string;
  inheritance?: { sentence?: string; percent?: string };
  hexCodes?: string[];
};

function extractJsonObject(text: string): string | null {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const body = fence ? fence[1]!.trim() : t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return body.slice(start, end + 1);
}

function normalizeHex(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  const m = /^#?([0-9A-F]{6})$/.exec(s);
  if (!m) return null;
  return `#${m[1]}`;
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
  if (r > g && r > b) {
    if (g > b && r - g < 28) return "amber";
    return "brown";
  }
  if (g >= r && g >= b) {
    return "green";
  }
  if (b >= r && b >= g) {
    return "blue";
  }
  return "hazel";
}

async function callGeminiAnalyze(
  inputBase64: string,
  inputMimeType: string,
  seed: number,
): Promise<AnalysisJson> {
  const generationConfig: Record<string, unknown> = {
    temperature: analysisTemperatureStrict(),
    topP: 1,
    // Genug Raum für JSON + hexCodes; sonst abgeschnitten → "unexpected end of JSON input".
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
    responseJsonSchema: IRIS_ANALYSIS_JSON_SCHEMA,
    thinkingConfig: {
      thinkingBudget: 0,
    },
  };
  if (Deno.env.get("GEMINI_ANALYSIS_NO_SEED") !== "1") {
    generationConfig.seed = seed;
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: ANALYSIS_SYSTEM_PROMPT },
          {
            inline_data: {
              mime_type: inputMimeType.includes("png") ? "image/png" : "image/jpeg",
              data: inputBase64,
            },
          },
        ],
      },
    ],
    generationConfig,
  };

  const resp = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "x-goog-api-key": NANO_BANANA_2_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* ignore */
    }
    const msg =
      parsed?.error?.message ??
      parsed?.message ??
      (typeof text === "string" && text.length ? text : "Unknown Gemini error");
    throw new Error(`Gemini analyze failed: HTTP ${resp.status} ${msg}`);
  }

  const data = await resp.json() as Record<string, unknown>;
  const cand = (data as any)?.candidates?.[0];
  const finishReason = cand?.finishReason as string | undefined;
  const blockReason = (data as any)?.promptFeedback?.blockReason as string | undefined;
  if (blockReason) {
    throw new Error(`Gemini blocked request: ${blockReason}`);
  }
  if (!cand) {
    throw new Error("Gemini returned no candidates.");
  }

  const parts = cand?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error(`Gemini returned no content parts (finishReason=${finishReason ?? "unknown"}).`);
  }

  // Nur Antwort-Text, keine Thought-Summaries (2.5 sonst mehrere parts; Mix bricht JSON.parse).
  const answerChunks: string[] = [];
  for (const p of parts as any[]) {
    if (p?.thought === true) continue;
    if (typeof p?.text === "string" && p.text.length) answerChunks.push(p.text);
  }
  const textPart = answerChunks.join("").trim();

  if (!textPart.length) {
    const usage = (data as any)?.usageMetadata;
    const hint = finishReason === "MAX_TOKENS"
      ? " Output hit MAX_TOKENS."
      : "";
    throw new Error(
      `Gemini returned empty JSON text (finishReason=${finishReason ?? "unknown"}).${hint} usage=${JSON.stringify(usage ?? {})}`,
    );
  }

  const trimmed = textPart.trim();
  let jsonStr = trimmed;
  if (!trimmed.startsWith("{")) {
    const extracted = extractJsonObject(textPart);
    if (!extracted?.length) {
      throw new Error(`Could not parse JSON from model output: ${textPart.slice(0, 200)}`);
    }
    jsonStr = extracted;
  }

  let parsed: AnalysisJson;
  try {
    parsed = JSON.parse(jsonStr) as AnalysisJson;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const tail = jsonStr.length > 400 ? jsonStr.slice(-400) : jsonStr;
    const frHint = finishReason === "MAX_TOKENS"
      ? " Response may be truncated (MAX_TOKENS); raise maxOutputTokens or shorten schema output."
      : "";
    throw new Error(`Invalid JSON from model: ${msg}. finishReason=${finishReason ?? "?"}.${frHint} tail=${tail}`);
  }

  return parsed;
}

function sanitizeAnalysis(raw: AnalysisJson) {
  const hexCodes = (raw.hexCodes ?? [])
    .map((h) => normalizeHex(String(h)))
    .filter((h): h is string => Boolean(h))
    .filter((h) => h !== "#000000" && h !== "#FFFFFF");

  const unique: string[] = [];
  for (const h of hexCodes) {
    if (!unique.includes(h)) unique.push(h);
  }

  const baseSentence = (raw.baseColorRarity?.sentence ?? "").trim() || "Keine Beschreibung der Grundfarbe.";
  const basePercent = (raw.baseColorRarity?.percent ?? "—").trim() || "—";
  const specialSentence = (raw.specialFeatures?.sentence ?? "").trim() || "Keine Besonderheiten genannt.";
  const combinedSents = Array.isArray(raw.combinedRarity?.sentences)
    ? raw.combinedRarity!.sentences!.map((s) => String(s).trim()).filter(Boolean)
    : [];
  while (combinedSents.length < 2) {
    combinedSents.push("—");
  }
  const combinedPercent = (raw.combinedRarity?.percent ?? "—").trim() || "—";
  const uniqueNote = (raw.uniqueStructureNote ?? "Jede Iris weist einzigartige Strukturen auf.").trim() || "Jede Iris weist einzigartige Strukturen auf.";
  const inhSentence = (raw.inheritance?.sentence ?? "").trim() || "Keine Vererbungs-Einschätzung.";
  const inhPercent = (raw.inheritance?.percent ?? "—").trim() || "—";

  const paletteHex = unique.length >= 3 ? unique : unique.length > 0 ? unique : ["#6B5CFF", "#00D4FF"];
  const primaryHex = paletteHex[0] ?? "#6B5CFF";
  const colorCategory = colorCategoryFromHex(primaryHex);

  return {
    baseColorRaritySentence: baseSentence,
    baseColorRarityPercent: basePercent,
    specialFeaturesSentence: specialSentence,
    combinedRaritySentences: [combinedSents[0]!, combinedSents[1]!],
    combinedRarityPercent: combinedPercent,
    uniqueStructureNote: uniqueNote,
    inheritanceSentence: inhSentence,
    inheritancePercent: inhPercent,
    primary_hex: primaryHex,
    color_category: colorCategory,
    hexCodes: paletteHex,
  };
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
    console.error("iris-analyze: missing NANO_BANANA_2_API_KEY secret.");
    return json(
      { ok: false, error: "Missing NANO_BANANA_2_API_KEY secret on the server." },
      { status: 200, headers: cors },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, { status: 200, headers: cors });
  }

  if (!body?.imageUrl || typeof body.imageUrl !== "string") {
    return json({ ok: false, error: "imageUrl is required." }, { status: 200, headers: cors });
  }

  if (!isHttpOrHttpsUrl(body.imageUrl)) {
    return json({ ok: false, error: "imageUrl must be a valid http(s) URL." }, { status: 200, headers: cors });
  }

  try {
    console.log("iris-analyze: request", { hasImageUrl: true });
    const input = await fetchImageAsBase64(body.imageUrl);
    const fingerprint = input.fingerprint;
    console.log("iris-analyze: bytes", input.bytes, "fingerprint", fingerprint.slice(0, 12) + "…");

    const cached = await getCachedAnalysis(fingerprint);
    if (cached) {
      console.log("iris-analyze: cache hit (eye_profiles)");
      return json(
        {
          ok: true,
          analysis: cached,
          fingerprint,
          source: "cache" as const,
        },
        { status: 200, headers: cors },
      );
    }

    const modelSeed = seedFromFingerprintHex(fingerprint);
    const raw = await callGeminiAnalyze(input.base64, input.mimeType, modelSeed);
    const analysis = sanitizeAnalysis(raw);
    const analysisRecord = analysis as unknown as Record<string, unknown>;
    await upsertCachedAnalysis(fingerprint, analysisRecord, GEMINI_MODEL);
    return json(
      {
        ok: true,
        analysis,
        fingerprint,
        source: "model" as const,
      },
      { status: 200, headers: cors },
    );
  } catch (e) {
    console.error("iris-analyze: failed", { message: e instanceof Error ? e.message : String(e) });
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, { status: 200, headers: cors });
  }
});
