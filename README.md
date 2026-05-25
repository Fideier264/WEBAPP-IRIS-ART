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

## Web-Deployment (statischer Export)

Die App ist für statisches Web-Hosting konfiguriert (`app.json` → `web.output: static`).

```bash
cd irisart-app
npm ci
npm run build:web
```

Der Build liegt in `irisart-app/dist/`.

### Vercel

1. Repository auf GitHub pushen.
2. In [Vercel](https://vercel.com) neues Projekt aus dem Repo importieren.
3. **Root Directory:** `irisart-app` (oder Root mit `vercel.json` im Repo-Root verwenden).
4. **Environment Variables** (Production + Preview):
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM` (optional)
   - `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM` (optional)

Build-Befehl und Output sind in `vercel.json` vorkonfiguriert.

### Andere Hosts (Netlify, Cloudflare Pages, GitHub Pages)

- Build: `cd irisart-app && npm ci && npm run build:web`
- Publish directory: `irisart-app/dist`

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
