# Edge Functions

## Reproduzierbarkeit (gleiches Foto → gleiche App-Daten)

Generative Modelle bleiben **nicht zu 100 % deterministisch** (Google garantiert das auch bei `seed` nicht). Wir machen das Verhalten **praktisch stabil** durch:

- **`temperature: 0`** (Ausnahme nur mit explizitem Opt-in, siehe unten)
- **`seed`** aus **Bild-Hash** (Analyse) bzw. **Hash(Bild + Hintergrund + `artStyle`)** (Bildgenerierung)
- **Supabase-Cache** `eye_profiles`: gleiche Bild-Bytes (SHA-256) → **kein zweiter Gemini-Aufruf** für die Textanalyse

### Secrets (Supabase → Edge Functions)

| Secret | Funktion |
|--------|----------|
| **`SUPABASE_SERVICE_ROLE_KEY`** | Pflicht für **`iris-analyze`**, damit `eye_profiles` gelesen/geschrieben werden kann (steht meist nicht automatisch in allen Projekten — in den Function Secrets setzen). |
| `SUPABASE_URL` | Basis-URL des Projekts (oft von Supabase gesetzt). |

### `iris-analyze` (Text + HEX)

| Secret (optional) | Standard | Bedeutung |
|-------------------|----------|-----------|
| `GEMINI_ANALYSIS_ALLOW_NONZERO_TEMP` | aus | Wenn `1`, darf `GEMINI_ANALYSIS_TEMPERATURE` genutzt werden, maximal **0.1**. Sonst immer **0**. |
| `GEMINI_ANALYSIS_TEMPERATURE` | `0` | Nur relevant mit `ALLOW_NONZERO_TEMP=1`. |
| `GEMINI_ANALYSIS_NO_SEED` | aus | Wenn `1`, wird kein `seed` an Gemini gesendet (falls die API 400 liefert). |

**Cache:** Tabelle `public.eye_profiles` (Migration im Repo). Nur **Service Role** (keine RLS-Policies für Clients).

Die Analyse speichert zusätzlich `primary_hex` und `color_category` im `analysis`-Objekt (aus dominanter Irisfarbe abgeleitet). `iris-enhance` nutzt diese Werte zur Farbkorrektur im Prompt (Lichtstich ignorieren, Basisfarbe strikt halten).

### `iris-enhance` (Nano Banana / Iris-Bild)

| Secret (optional) | Standard | Bedeutung |
|-------------------|----------|-----------|
| **`GEMINI_IMAGE_MODEL`** | **`gemini-3.1-flash-image-preview`** | Standard: **Nano Banana 3.1** (Preview). Für nur 2.5: `gemini-2.5-flash-image` setzen. |
| **`GEMINI_IMAGE_MODELS`** | — | Optional: **kommagetrennte** Liste, Reihenfolge = Versuchsreihenfolge, z. B. `gemini-3.1-flash-image-preview,gemini-2.5-flash-image`. Überschreibt die Kombination aus `GEMINI_IMAGE_MODEL` + Fallback. |
| `GEMINI_IMAGE_FALLBACK_MODEL` | auto | Zweites Modell bei Fehlversuch (wenn nicht gesetzt: bei Primary ≠ `gemini-2.5-flash-image` wird **`gemini-2.5-flash-image`** probiert). Ignoriert, wenn `GEMINI_IMAGE_MODELS` gesetzt ist. |
| `GEMINI_IMAGE_ENABLE_IMAGE_CONFIG` | aus | Wenn **`1`**: `imageConfig` (aspectRatio + imageSize) mitsenden. **Standard aus** — ohne dieses Flag nur minimale `generationConfig`, oft nötig um **HTTP 500** zu vermeiden. |
| `GEMINI_IMAGE_SIZE` | `1K` | Nur wenn `ENABLE_IMAGE_CONFIG=1`: `512`, `1K`, `2K`, `4K`. |
| `GEMINI_API_VERSION` | `v1beta` | Optional `v1` testen, falls Google die Route ändert. |
| `GEMINI_IMAGE_ALLOW_NONZERO_TEMP` | aus | Wenn `1`, max. **0.1** aus `GEMINI_IMAGE_TEMPERATURE`. Sonst **0**. |
| `GEMINI_IMAGE_TEMPERATURE` | `0` | Nur mit `ALLOW_NONZERO_TEMP=1`. |
| `GEMINI_IMAGE_USE_GLOBAL_SEED` | aus | Wenn `1`, wird **`GEMINI_IMAGE_SEED`** statt Hash(Bild+Hintergrund+`artStyle`) verwendet. |
| `GEMINI_IMAGE_SEED` | `42` | Nur bei `USE_GLOBAL_SEED=1`. |
| `GEMINI_IMAGE_NO_SEED` | aus | Kein `seed` im Request. |
| `GEMINI_IMAGE_USE_FILE_API` | an | Wenn **`0`**: kein Upload über die **Gemini Files API**; nur Inline-Base64. Standard (**nicht** `0`): Bild per **resumable Upload** nach `upload/v1beta/files`, dann **`file_data` / `fileUri`** in `generateContent` — oft weniger **HTTP 500** als sehr große Inline-Payloads. |
| `GEMINI_IMAGE_FETCH_TIMEOUT_MS` | `110000` | Max. Wartezeit **pro** `generateContent`-Aufruf (ms). Bei Timeout → nächster Versuch. Zu niedrig: Abbruch mitten in langsamer Preview-Generierung. |
| `GEMINI_IMAGE_MAX_ATTEMPTS_PER_MODEL` | `6` (compact) | Max. Versuche **pro Modell** in der kompakten Strategie (überschreibbar). |
| `GEMINI_IMAGE_EXTENDED_ATTEMPTS` | aus | Wenn **`1`**: wieder die **lange** Versuchsliste (File + viele Inline-Varianten pro Modell) — nur zum Debuggen; erhöht Laufzeit und **504**-Risiko. |

**Body:** `artStyle` (string, optional) — gleiches Quellbild + gleicher `artStyle` + gleicher `backgroundMode` → gleicher serverseitiger Seed (soweit die API mitspielt).

`iris-enhance` liest (wenn verfügbar) `primary_hex` + `color_category` aus `eye_profiles.analysis` über den Bild-Fingerprint und injiziert diese als strikte Farbpalette in den Gemini-Edit-Prompt.

**HTTP 504 (Gateway Timeout):** Die Funktion oder ein Gemini-Aufruf war zu lange ohne fertige Antwort (typisch: viele sequenzielle Versuche oder sehr langsames Preview-Modell). Standard ist jetzt eine **kompakte** Versuchsreihenfolge **pro Modell** statt „alle File-Versuche für alle Modelle, dann alle Inline-Versuche“. Bei **504** weiterhin: **`GEMINI_IMAGE_MODEL=gemini-2.5-flash-image`** testen oder **`GEMINI_IMAGE_FETCH_TIMEOUT_MS`** leicht erhöhen (z. B. `130000`).

Bei **500 Internal** (und generell): **`iris-enhance` neu deployen**. Zuerst wird (sofern `GEMINI_IMAGE_USE_FILE_API` nicht `0`) per **Files API** referenziert, danach weiterhin **Inline `inlineData`** als Fallback. **`inlineData`** nutzt **camelCase** (wie die offizielle JS-API), **`imageConfig`** nur mit **`GEMINI_IMAGE_ENABLE_IMAGE_CONFIG=1`**. Nur 2.5 erzwingen: **`GEMINI_IMAGE_MODEL=gemini-2.5-flash-image`**. Zum Testen: **`GEMINI_IMAGE_NO_SEED=1`**.

**Hinweis:** Zweimal dieselbe Datei mit **unterschiedlichen Upload-URLs** ist unkritisch für den **Server-Cache**, solange die **heruntergeladenen Bytes identisch** sind (gleicher Crop/Export). Die App cached zusätzlich lokal über Datei-URI und MD5.

Falls die API **`seed` nicht unterstützt** (HTTP 400): **`GEMINI_IMAGE_NO_SEED=1`** bzw. **`GEMINI_ANALYSIS_NO_SEED=1`** setzen — `temperature` bleibt niedrig; die **DB-Cache**-Schicht liefert bei Analyse trotzdem identische JSON-Ergebnisse nach dem ersten Lauf.

### `create-merchone-order` (Native App → merchOne)

Ruft `POST https://api.merchone.com/api/v1/orders` mit **Basic Auth** auf (Blueprint-SKU + `file.front.url` = HTTPS-Druckdatei).

| Secret | Bedeutung |
|--------|-----------|
| **`MERCHONE_API_USER`** | Store API user (Dashboard → Store → Settings). |
| **`MERCHONE_API_KEY`** | Store API key. |
| `MERCHONE_ORDERS_IS_TEST` | Standard **`true`** (Testorders). Zum Live-Modus: `0` oder `false` setzen (nur wenn Store aktiv und gewollt). |
| `MERCHONE_ALLOWED_SKUS` | Optional: kommagetrennte Allowlist erlaubter `product_sku`-Werte (Absicherung gegen manipulierte App-Requests). |

**App (.env):** `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM`, `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM` — echte Blueprint-SKUs aus merchOne (kein Secret).

**Deploy:** Function `create-merchone-order` deployen und Secrets setzen.
