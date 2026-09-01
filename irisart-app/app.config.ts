import path from 'path';

import 'dotenv/config';
import { config as loadDotEnv } from 'dotenv';

// Load workspace-root .env first (per project request), then allow irisart-app/.env to override if present.
loadDotEnv({ path: path.resolve(__dirname, '..', '.env') });
loadDotEnv({ path: path.resolve(__dirname, '.env') });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('./app.json');

export default ({ config }: { config: Record<string, any> }) => {
  const base = appJson?.expo ?? {};

  return {
    ...config,
    ...base,
    extra: {
      ...(base.extra ?? {}),
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      appOrigin: process.env.EXPO_PUBLIC_APP_ORIGIN ?? 'https://irisart.app',
      // Bake catalog into the web build (Hostinger runtime env alone is not enough for Expo).
      merchoneCatalog: process.env.EXPO_PUBLIC_MERCHONE_CATALOG ?? null,
      legalOperatorName: process.env.EXPO_PUBLIC_LEGAL_OPERATOR_NAME ?? 'Amir Figut',
      legalContactEmail: process.env.EXPO_PUBLIC_LEGAL_CONTACT_EMAIL ?? 'contact@irisart.app',
      legalAddress:
        process.env.EXPO_PUBLIC_LEGAL_ADDRESS ??
        'Lucy-Hillebrandstr. 14, App. 6016, 55128 Mainz, Deutschland',
      legalEffectiveDate: process.env.EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE ?? '2026-09-01',
    },
  };
};
