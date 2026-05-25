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
| Node.js-Version | **20.x** |

4. **Environment Variables** — **vor dem ersten Deploy** setzen (werden beim **Build** in die App eingebettet):

| Variable | Pflicht |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | ja |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ja |
| `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM` | optional |
| `EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM` | optional |

5. **Deploy** klicken. Hostinger führt aus: `npm install` → `npm run build` → `npm start`.

`PORT` setzt Hostinger automatisch — `server.js` nutzt `process.env.PORT`.

**Hinweis:** Supabase Edge Functions und deren Secrets (`NANO_BANANA_2_API_KEY`, …) laufen weiterhin auf Supabase, nicht auf Hostinger. Nur die Expo-Web-App wird auf Hostinger gehostet.

### Vercel (Alternative)

Siehe `vercel.json`. Environment Variables wie oben.

### Statisches Hosting (ohne Node)

- Build: `npm run build`
- Publish-Verzeichnis: `irisart-app/dist`

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
