# IrisART

Expo-App (Web, iOS, Android) mit Supabase Edge Functions für Iris-Analyse, Bildverbesserung und merchOne-Bestellungen.

## Projektstruktur

| Pfad | Inhalt |
|------|--------|
| `irisart-app/` | Expo Router App (Frontend) |
| `supabase/functions/` | Edge Functions (`iris-analyze`, `iris-enhance`, `create-merchone-order`) |
| `supabase/migrations/` | Datenbank-Migrationen |
| `.env` | Lokale Umgebungsvariablen (nicht in Git) |

## Lokale Entwicklung

```bash
# 1. Umgebung
cp .env.example .env
# .env mit echten Werten füllen

# 2. App
cd irisart-app
npm install
npm run web
```

Supabase-Secrets und Function-Deploy: siehe `supabase/functions/README.md`.

## Web-Deployment

Die App exportiert statisches Web (`expo export`) und wird in Produktion von **`server.js`** (Express) ausgeliefert — passend für **Hostinger Node.js Web App**.

Lokal testen (nach Build):

```bash
npm run build
npm start
# → http://localhost:3000
```

### Hostinger (Node.js Web App) — empfohlen

1. **hPanel** → Websites → **Add website** → **Node.js Web App**
2. **GitHub-Repository** verbinden (Branch `main`)
3. **Build-Einstellungen** (Framework: *Other* / Sonstiges):

| Einstellung | Wert |
|-------------|------|
| Root-Verzeichnis | `.` (Repo-Root) |
| Build-Befehl | `npm run build` |
| Start-Befehl | `npm start` |
| Entry-Datei | `server.js` |
| Node.js-Version | **22.x** |

4. **Environment Variables** — **vor dem Build** setzen (beim Domain-Wechsel erneut prüfen; fehlen sie, bleibt die Seite schwarz):

| Variable | Pflicht |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | ja |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ja |
| `EXPO_PUBLIC_APP_ORIGIN` | ja (z. B. `https://irisart.app`) |
| `EXPO_PUBLIC_LEGAL_OPERATOR_NAME` | empfohlen |
| `EXPO_PUBLIC_LEGAL_CONTACT_EMAIL` | empfohlen |
| `EXPO_PUBLIC_LEGAL_ADDRESS` | empfohlen |
| `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM` | optional |
| `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM` | optional |

Nach dem Setzen **Deploy / Rebuild** auslösen. Die Web-App liest Supabase-Zugangsdaten zusätzlich zur Build-Zeit zur **Laufzeit** über `https://irisart.app/app-config.json` vom Node-Server — ein reiner App-Neustart reicht oft, ein Rebuild ist nur für andere `EXPO_PUBLIC_*`-Werte nötig.

5. **Deploy** klicken. Hostinger führt aus: `npm install` → `npm run build` → `npm start`.

`PORT` setzt Hostinger automatisch — `server.js` nutzt `process.env.PORT`.

**Hinweis:** Supabase Edge Functions und deren Secrets (`NANO_BANANA_2_API_KEY`, …) laufen weiterhin auf Supabase, nicht auf Hostinger. Nur die Expo-Web-App wird auf Hostinger gehostet.

### Vercel (Alternative)

Siehe `vercel.json`. Environment Variables wie oben.

### Statisches Hosting (ohne Node)

- Build: `npm run build`
- Publish-Verzeichnis: `irisart-app/dist`

## iOS (EAS Build + TestFlight)

Voraussetzungen: [Apple Developer Program](https://developer.apple.com/programs/) (99 €/Jahr), Expo-Konto (`npx eas login`).

### 1) EAS-Projekt verknüpfen

```bash
cd irisart-app
npm install
npx eas login
npm run eas:init
```

`eas init` legt die `projectId` in `app.json` an und verknüpft das Repo mit Expo.

### 2) Build-Secrets (EAS Environment)

Supabase- und Legal-Werte müssen **zum Build-Zeitpunkt** gesetzt sein (native Apps lesen kein Hostinger-Runtime-Config):

```bash
cd irisart-app
npx eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://…supabase.co" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ…" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_LEGAL_OPERATOR_NAME --value "Amir Figut" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_LEGAL_CONTACT_EMAIL --value "contact@irisart.app" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_LEGAL_ADDRESS --value "Lucy-Hillebrandstr. 14, App. 6016, 55128 Mainz, Deutschland" --environment production --visibility plaintext
```

Optional: `EXPO_PUBLIC_MERCHONE_CATALOG` oder SKU-Variablen wie in `.env.example`.

Für **Preview/TestFlight intern** dieselben Variablen auch unter `--environment preview` anlegen.

### 3) Ersten iOS-Build starten

```bash
npm run eas:build:ios:preview
```

EAS fragt nach Apple-Zugangsdaten (oder App Store Connect API Key). Nach dem Build: `.ipa` in **TestFlight** laden oder QR-Link auf dem Gerät installieren.

Production / App Store:

```bash
npm run eas:build:ios
npm run eas:submit:ios
```

### 4) Apple / Supabase für die native App

| Thema | Wert / Aktion |
|--------|----------------|
| Bundle ID | `app.irisart.mobile` (in `app.json`) |
| URL Scheme | `irisartapp` |
| OAuth Redirect | `irisartapp://auth/callback` in Supabase **Authentication → URL configuration** |
| Privacy URL | `https://irisart.app/privacy` (App Store Connect) |
| Sign in with Apple | **Pflicht**, solange Google-Login auf iOS aktiv ist — als nächster Dev-Schritt |

Details Auth: `supabase/AUTH.md`.

## GitHub einrichten

```bash
git init   # bereits erledigt, wenn du dieses README aus dem Repo liest
git add .
git commit -m "Initial commit: IrisART Expo app + Supabase"
git branch -M main
git remote add origin https://github.com/DEIN_USER/irisart.git
git push -u origin main
```

## Wichtig

- **Niemals** `.env` oder API-Keys ins Repository committen.
- Server-Secrets (`NANO_BANANA_2_API_KEY`, `MERCHONE_API_*`, …) nur in Supabase Edge Function Secrets setzen.
