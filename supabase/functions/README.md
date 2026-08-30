# Edge Functions

> **Accounts / cloud gallery:** see [`AUTH.md`](./AUTH.md) for Email + Google Auth setup and the `user_irises` migration.

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

### `create-merchone-order` (manuell / Admin)

Ruft `POST https://api.merchone.com/api/v1/orders` mit **Basic Auth** auf.

**Wichtig — Custom-Druck:** Configurator-SKUs mit `-PIC…` / `-APO…` haben bereits Artwork eingebettet; merchOne **ignoriert** dann `file.front.url`. Die Function strippt diesen Suffix und bestellt die **Blueprint-SKU** (z. B. `CVS0200201LMF2-PIC83638470` → `CVS0200201LMF2`) inkl. `items[].file.front.url` = personalisierte HTTPS-Druckdatei.

**Kundenbestellungen laufen über Stripe** (`create-checkout-session` + `stripe-webhook`). Direkte Aufrufe sind standardmäßig **gesperrt**, außer `MERCHONE_ALLOW_DIRECT_ORDERS=1`.

| Secret | Bedeutung |
|--------|-----------|
| **`MERCHONE_API_USER`** | Store API user (Dashboard → Store → Settings). |
| **`MERCHONE_API_KEY`** | Store API key. |
| `MERCHONE_ORDERS_IS_TEST` | Standard **`true`** (Testorders). Zum Live-Modus: `0` oder `false`. |
| `MERCHONE_ALLOWED_SKUS` | Optional: kommagetrennte Allowlist. |
| `MERCHONE_ALLOW_DIRECT_ORDERS` | Nur `1` für manuelle Tests ohne Stripe. |

### Stripe Checkout (`create-checkout-session` + `stripe-webhook`)

**Flow:** App lädt Druckdatei hoch → `create-checkout-session` → Redirect zu Stripe → nach Zahlung `checkout.session.completed` → Webhook legt merchOne-Order an.

| Secret | Bedeutung |
|--------|-----------|
| **`STRIPE_SECRET_KEY`** | `sk_test_…` / `sk_live_…` |
| **`STRIPE_WEBHOOK_SECRET`** | `whsec_…` vom Stripe Webhook Endpoint |
| `STRIPE_PRODUCT_CATALOG` | Bevorzugt: JSON `[{"sku":"CVS…","amountCents":1999,"label":"20 × 20 cm"}]` |
| `STRIPE_AMOUNT_BY_SKU` | Alternativ: `{"CVS0200201LMF2-PIC83638470":1999}` (Cent) |
| `MERCHONE_SKU_CANVAS_<N>CM` | Legacy: z. B. `MERCHONE_SKU_CANVAS_20CM` = merchOne-SKU |
| `STRIPE_AMOUNT_CENTS_<N>CM` | Legacy: z. B. `STRIPE_AMOUNT_CENTS_20CM=1999` |
| *(Bundled default)* | Ohne Secrets: SKU aus `irisart-app/config/productCatalog.json` (20 cm / 19,99 €) |
| `STRIPE_CURRENCY` | Standard `eur` |
| `APP_ORIGIN` | Öffentliche Web-URL (Success/Cancel), z. B. `https://deine-domain.de` |
| `CHECKOUT_ALLOWED_ORIGINS` | Optional: Allowlist für `appOrigin` aus der App |
| `SUPABASE_SERVICE_ROLE_KEY` | Für Idempotenz-Tabelle `stripe_webhook_events` |

**Migration:** `supabase/migrations/20260425140000_stripe_webhook_events.sql`

**Deploy:**
```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
```

**Stripe Dashboard → Developers → Webhooks:** Endpoint  
`https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`  
Event: `checkout.session.completed`

**App (.env):** SKUs + optionale Anzeige-Preise `EXPO_PUBLIC_PRICE_EUR_30CM` / `60CM`, optional `EXPO_PUBLIC_APP_ORIGIN`.

**Deploy:** Function `create-merchone-order` deployen und Secrets setzen.

### `delete-account` (Konto löschen)

App-Store-Pflicht: angemeldete Nutzer können Konto + Galerie in der App löschen (`/account`).

Die Function prüft den **User-JWT** (`/auth/v1/user`), löscht Storage `user-irises/{uid}/…`, Zeilen in `user_irises` und den Auth-User (Admin API).

| Secret | Bedeutung |
|--------|-----------|
| **`SUPABASE_SERVICE_ROLE_KEY`** | Admin-Delete + Storage/DB |
| `SUPABASE_URL` | Projekt-URL |
| `SUPABASE_ANON_KEY` | Optional für `/auth/v1/user`; sonst Service Role |

```bash
supabase functions deploy delete-account
```

`verify_jwt = true` in `config.toml` — **kein** `--no-verify-jwt`. Anon-JWTs werden zusätzlich abgelehnt.
