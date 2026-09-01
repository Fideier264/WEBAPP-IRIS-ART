import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import {
  isPublicAppConfigReady,
  loadPublicAppConfig,
  missingConfigKeys,
  type PublicAppConfig,
} from '@/lib/appConfig';
import { initSupabase } from '@/lib/supabase';
import { BootLoadingScreen } from '@/components/BootLoadingScreen';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';

type Props = { children: React.ReactNode };

export function AppBootstrap({ children }: Props) {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [config, setConfig] = useState<PublicAppConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadPublicAppConfig();
        if (cancelled) return;
        if (!isPublicAppConfigReady(loaded)) {
          setConfig(loaded);
          setStatus('error');
          return;
        }
        initSupabase(loaded);
        setConfig(loaded);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <BootLoadingScreen label="IrisArt wird geladen…" />;
  if (status === 'error') {
    return <ConfigErrorScreen missing={config ? missingConfigKeys(config) : undefined} />;
  }
  return <>{children}</>;
}
