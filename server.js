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

if (!fs.existsSync(distDir)) {
  console.error(
    `[irisart] Missing build output at ${distDir}. Run "npm run build" before "npm start".`
  );
  process.exit(1);
}

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
