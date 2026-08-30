import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from '@/lib/platformFileSystem';

import { uploadTempImage } from './aiEnhance';
import { extractIrisPaletteFromUri } from './extractIrisPalette';
import { invokeEdgeFunction } from './invokeEdgeFunction';

/** Structured copy from Edge Function `iris-analyze` (German narrative + HEX list). */
export type IrisGeminiDetails = {
  baseColorRaritySentence: string;
  baseColorRarityPercent: string;
  specialFeaturesSentence: string;
  combinedRaritySentences: [string, string];
  combinedRarityPercent: string;
  uniqueStructureNote: string;
  inheritanceSentence: string;
  inheritancePercent: string;
};

export type IrisAnalysis = {
  primaryHex: string;
  secondaryHex: string;
  /** Rough numeric hint parsed from combined rarity percent (for legacy UI / stats). */
  rarityPercent: number;
  /** Full German summary (all blocks). */
  rarityText: string;
  palette: Array<{ hex: string; weight: number }>;
  gemini: IrisGeminiDetails;
  source: 'gemini';
  /** SHA-256 (hex) of the image bytes the Edge Function hashed (same as eye_profiles key). */
  imageFingerprint?: string;
  /** Whether the Edge Function served Supabase cache or called Gemini. */
  analysisProvenance?: 'cache' | 'model';
};

type EdgeAnalysis = {
  baseColorRaritySentence: string;
  baseColorRarityPercent: string;
  specialFeaturesSentence: string;
  combinedRaritySentences: string[];
  combinedRarityPercent: string;
  uniqueStructureNote?: string;
  inheritanceSentence: string;
  inheritancePercent: string;
  hexCodes: string[];
};

function parseApproximatePercent(s: string): number {
  const t = s.trim();
  if (!t || t === '—') return 5;
  const m = t.match(/([\d.]+)/);
  if (!m) return 5;
  const n = parseFloat(m[1]!);
  if (!Number.isFinite(n)) return 5;
  return Math.min(100, Math.max(0.1, n));
}

function paletteFromHexCodes(hexCodes: string[]): Array<{ hex: string; weight: number }> {
  const n = hexCodes.length;
  if (n === 0) return [{ hex: '#6B5CFF', weight: 1 }];
  // Stronger weight for earlier (more dominant) swatches.
  const weights = hexCodes.map((_, i) => n - i);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return hexCodes.map((hex, i) => ({
    hex,
    weight: weights[i]! / sum,
  }));
}

function toGeminiDetails(a: EdgeAnalysis): IrisGeminiDetails {
  const s0 = a.combinedRaritySentences[0] ?? '—';
  const s1 = a.combinedRaritySentences[1] ?? '—';
  return {
    baseColorRaritySentence: a.baseColorRaritySentence,
    baseColorRarityPercent: a.baseColorRarityPercent,
    specialFeaturesSentence: a.specialFeaturesSentence,
    combinedRaritySentences: [s0, s1],
    combinedRarityPercent: a.combinedRarityPercent,
    uniqueStructureNote: a.uniqueStructureNote ?? 'Jede Iris weist einzigartige Strukturen auf.',
    inheritanceSentence: a.inheritanceSentence,
    inheritancePercent: a.inheritancePercent,
  };
}

function buildRarityText(g: IrisGeminiDetails): string {
  const [c1, c2] = g.combinedRaritySentences;
  return [
    `${g.baseColorRaritySentence} (${g.baseColorRarityPercent})`,
    g.specialFeaturesSentence,
    `${c1} ${c2} (${g.combinedRarityPercent})`,
    g.uniqueStructureNote,
    `${g.inheritanceSentence} (${g.inheritancePercent})`,
  ].join('\n\n');
}

async function applyExtractedPalette(result: IrisAnalysis, paletteUri?: string): Promise<IrisAnalysis> {
  if (!paletteUri) return result;
  try {
    const extracted = await extractIrisPaletteFromUri(paletteUri);
    if (!extracted.length) return result;
    const primaryHex = extracted[0]!.hex;
    const secondaryHex = extracted[1]?.hex ?? primaryHex;
    return { ...result, primaryHex, secondaryHex, palette: extracted };
  } catch (e) {
    console.warn('iris palette extraction failed', e instanceof Error ? e.message : String(e));
    return result;
  }
}

/** Re-sample palette swatches from the enhanced iris image (e.g. after cache hit). */
export async function withIrisPaletteFromImage(
  result: IrisAnalysis,
  paletteUri?: string
): Promise<IrisAnalysis> {
  return applyExtractedPalette(result, paletteUri);
}

/** In-memory: one network call per texture URI (Review + Results share the same result). */
const analysisCache = new Map<string, IrisAnalysis>();
const analysisInflight = new Map<string, Promise<IrisAnalysis>>();
const analysisCacheByFingerprint = new Map<string, IrisAnalysis>();
const analysisInflightByFingerprint = new Map<string, Promise<IrisAnalysis>>();
const persistedAnalysisMap = new Map<string, IrisAnalysis>();
let persistedLoaded = false;
const ANALYSIS_CACHE_FILE = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}irisart_analysis_cache_v1.json`;

async function fileFingerprint(uri: string): Promise<string | null> {
  try {
    const info = (await FileSystem.getInfoAsync(uri, { md5: true } as any)) as any;
    if (!info?.exists) return null;
    const md5 = typeof info.md5 === 'string' ? info.md5 : '';
    const size = typeof info.size === 'number' ? String(info.size) : '0';
    return `${md5 || uri}|${size}`;
  } catch {
    return null;
  }
}

async function ensurePersistedAnalysisLoaded() {
  if (persistedLoaded) return;
  persistedLoaded = true;
  try {
    const info = await FileSystem.getInfoAsync(ANALYSIS_CACHE_FILE);
    if (!info.exists) return;
    const raw = await FileSystem.readAsStringAsync(ANALYSIS_CACHE_FILE);
    const parsed = JSON.parse(raw) as Record<string, IrisAnalysis>;
    for (const [k, v] of Object.entries(parsed)) {
      if (!k || !v || typeof v !== 'object') continue;
      persistedAnalysisMap.set(k, v);
      analysisCacheByFingerprint.set(k, v);
    }
  } catch {
    // ignore corrupted cache
  }
}

async function flushPersistedAnalysis() {
  try {
    const obj = Object.fromEntries(persistedAnalysisMap.entries());
    await FileSystem.writeAsStringAsync(ANALYSIS_CACHE_FILE, JSON.stringify(obj));
  } catch {
    // non-fatal
  }
}

/** Drop cache when starting a completely new session (optional). */
export function clearIrisAnalysisCache() {
  analysisCache.clear();
  analysisInflight.clear();
  analysisCacheByFingerprint.clear();
  analysisInflightByFingerprint.clear();
  persistedAnalysisMap.clear();
  void FileSystem.deleteAsync(ANALYSIS_CACHE_FILE, { idempotent: true });
}

/** Sofortiges Ergebnis wenn Review dieselbe `textureUri` schon analysiert hat (kein Lade-Flash). */
export function peekIrisAnalysisCache(uri: string): IrisAnalysis | undefined {
  return analysisCache.get(uri);
}

/** Seed URI / stable-key caches (e.g. gallery irisId or enhance fingerprint) without re-running Gemini. */
export function seedIrisAnalysisCache(
  uri: string | undefined,
  analysis: IrisAnalysis,
  stableKey?: string
) {
  if (uri) analysisCache.set(uri, analysis);
  if (stableKey) {
    analysisCacheByFingerprint.set(stableKey, analysis);
    persistedAnalysisMap.set(stableKey, analysis);
    void flushPersistedAnalysis();
  }
  if (analysis.imageFingerprint) {
    analysisCacheByFingerprint.set(analysis.imageFingerprint, analysis);
  }
}

export function peekIrisAnalysisByStableKey(stableKey: string): IrisAnalysis | undefined {
  return analysisCacheByFingerprint.get(stableKey) ?? persistedAnalysisMap.get(stableKey);
}

async function requestIrisAnalyze(imageUrl: string): Promise<{
  analysis: EdgeAnalysis;
  fingerprint?: string;
  provenance?: 'cache' | 'model';
}> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    const invoke = await invokeEdgeFunction('iris-analyze', { imageUrl });

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
      lastError = new Error(
        [
          `Edge function iris-analyze failed${status ? ` (HTTP ${status})` : ''}.`,
          anyErr?.message ? `Message: ${String(anyErr.message)}` : undefined,
          bodyText ? `Body: ${bodyText}` : undefined,
        ]
          .filter(Boolean)
          .join('\n')
      );
      const retryable = status === 429 || status === 500 || status === 503 || status === 546 || status === 504;
      if (!retryable) throw lastError;
      continue;
    }

    const data = invoke.data as
      | {
          ok?: boolean;
          analysis?: EdgeAnalysis;
          error?: string;
          fingerprint?: string;
          source?: 'cache' | 'model';
        }
      | null;
    if (!data) {
      lastError = new Error('Iris analysis failed (no response data).');
      continue;
    }
    if (data.ok === false || !data.analysis) {
      lastError = new Error(data.error ?? 'Iris analysis failed.');
      continue;
    }
    return {
      analysis: data.analysis,
      fingerprint: typeof data.fingerprint === 'string' ? data.fingerprint : undefined,
      provenance: data.source === 'cache' || data.source === 'model' ? data.source : undefined,
    };
  }
  throw lastError ?? new Error('Iris analysis failed.');
}

async function analyzeIrisUncached(uri: string): Promise<IrisAnalysis> {
  const workingUri =
    uri.startsWith('http://') || uri.startsWith('https://')
      ? (
          await FileSystem.downloadAsync(
            uri,
            `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}irisart_analyze_${Date.now()}.jpg`
          )
        ).uri
      : uri;

  // Smaller image = fewer vision tokens + faster upload (512px is enough for palette + text).
  const base = await ImageManipulator.manipulateAsync(workingUri, [], { base64: false });
  const w = base.width ?? 0;
  const h = base.height ?? 0;
  if (!w || !h) throw new Error('Could not read image dimensions.');

  const size = Math.min(w, h);
  const originX = Math.max(0, Math.floor((w - size) / 2));
  const originY = Math.max(0, Math.floor((h - size) / 2));
  const target = Math.min(512, size);

  const prepared = await ImageManipulator.manipulateAsync(
    workingUri,
    [{ crop: { originX, originY, width: size, height: size } }, { resize: { width: target, height: target } }],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.82 }
  );

  const uploaded = await uploadTempImage(prepared.uri);
  const { analysis: edge, fingerprint, provenance } = await requestIrisAnalyze(uploaded.signedUrl);

  const hexCodes = edge.hexCodes?.length ? edge.hexCodes : ['#6B5CFF', '#00D4FF'];
  const palette = paletteFromHexCodes(hexCodes);
  const gemini = toGeminiDetails(edge);

  const primaryHex = palette[0]?.hex ?? '#6B5CFF';
  const secondaryHex = palette[1]?.hex ?? primaryHex;

  return {
    primaryHex,
    secondaryHex,
    rarityPercent: parseApproximatePercent(gemini.combinedRarityPercent),
    rarityText: buildRarityText(gemini),
    palette,
    gemini,
    source: 'gemini',
    imageFingerprint: fingerprint,
    analysisProvenance: provenance,
  };
}

/**
 * Gemini-Analyse (Edge `iris-analyze`). Gleiche URI = gecacht; parallele Aufrufe teilen eine Request.
 * Optional `stableKey` (enhance fingerprint / iris id) pins the result across signed-URL changes.
 * Optional `paletteUri` — enhanced iris image used to extract the displayed color palette.
 */
export async function analyzeIris(
  uri: string,
  opts?: { stableKey?: string; paletteUri?: string }
): Promise<IrisAnalysis> {
  await ensurePersistedAnalysisLoaded();
  const stableKey = opts?.stableKey;
  const paletteUri = opts?.paletteUri;

  if (stableKey) {
    const byKey = analysisCacheByFingerprint.get(stableKey) ?? persistedAnalysisMap.get(stableKey);
    if (byKey) {
      analysisCache.set(uri, byKey);
      return applyExtractedPalette(byKey, paletteUri);
    }
  }

  const hit = analysisCache.get(uri);
  if (hit) return applyExtractedPalette(hit, paletteUri);

  const localUri =
    uri.startsWith('http://') || uri.startsWith('https://')
      ? (
          await FileSystem.downloadAsync(
            uri,
            `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}irisart_analyze_source_${Date.now()}.jpg`
          )
        ).uri
      : uri;

  const fp = await fileFingerprint(localUri);
  if (fp) {
    const fpHit = analysisCacheByFingerprint.get(fp);
    if (fpHit) {
      analysisCache.set(uri, fpHit);
      if (stableKey) {
        analysisCacheByFingerprint.set(stableKey, fpHit);
        persistedAnalysisMap.set(stableKey, fpHit);
        await flushPersistedAnalysis();
      }
      return applyExtractedPalette(fpHit, paletteUri);
    }
    const persisted = persistedAnalysisMap.get(fp);
    if (persisted) {
      analysisCacheByFingerprint.set(fp, persisted);
      analysisCache.set(uri, persisted);
      if (stableKey) {
        analysisCacheByFingerprint.set(stableKey, persisted);
        persistedAnalysisMap.set(stableKey, persisted);
        await flushPersistedAnalysis();
      }
      return applyExtractedPalette(persisted, paletteUri);
    }
  }

  let inflight =
    (stableKey ? analysisInflightByFingerprint.get(stableKey) : undefined) ??
    (fp ? analysisInflightByFingerprint.get(fp) : undefined) ??
    analysisInflight.get(uri);

  if (!inflight) {
    inflight = (async () => {
      try {
        const result = await analyzeIrisUncached(localUri);
        analysisCache.set(uri, result);
        if (fp) {
          analysisCacheByFingerprint.set(fp, result);
          persistedAnalysisMap.set(fp, result);
        }
        if (stableKey) {
          analysisCacheByFingerprint.set(stableKey, result);
          persistedAnalysisMap.set(stableKey, result);
        }
        await flushPersistedAnalysis();
        return result;
      } finally {
        analysisInflight.delete(uri);
        if (fp) analysisInflightByFingerprint.delete(fp);
        if (stableKey) analysisInflightByFingerprint.delete(stableKey);
      }
    })();
    analysisInflight.set(uri, inflight);
    if (fp) analysisInflightByFingerprint.set(fp, inflight);
    if (stableKey) analysisInflightByFingerprint.set(stableKey, inflight);
  }
  return applyExtractedPalette(await inflight, paletteUri);
}
