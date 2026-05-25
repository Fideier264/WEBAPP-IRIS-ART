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
    },
  };
};

