/**
 * Production server for Hostinger Node.js Web App.
 * Serves the static Expo web export from irisart-app/dist.
 */
const fs = require('fs');
const path = require('path');

const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'irisart-app', 'dist');

function publicAppConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    appOrigin: process.env.EXPO_PUBLIC_APP_ORIGIN ?? 'https://irisart.app',
  };
}

if (!fs.existsSync(distDir)) {
  console.error(
    `[irisart] Missing build output at ${distDir}. Run "npm run build" before "npm start".`
  );
  process.exit(1);
}

/** Runtime config for Expo web (Hostinger env vars apply at process start, not always at build). */
app.get('/app-config.json', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(publicAppConfig());
});

app.use(express.static(distDir, { extensions: ['html'], index: false }));

/** Expo static export: /capture → capture.html */
app.get('*', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const clean = req.path.replace(/\/+$/, '') || '/';
  const htmlFile =
    clean === '/' ? 'index.html' : `${clean.replace(/^\//, '')}.html`;
  const htmlPath = path.join(distDir, htmlFile);

  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }

  const fallback = path.join(distDir, 'index.html');
  if (fs.existsSync(fallback)) {
    return res.sendFile(fallback);
  }

  res.status(404).send('Not found. Run npm run build to generate the web app.');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[irisart] Serving ${distDir} on port ${port}`);
});
