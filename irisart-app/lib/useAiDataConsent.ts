import { useCallback, useEffect, useState } from 'react';

import {
  acceptAiDataConsent,
  hasAcceptedAiDataConsent,
} from '@/lib/aiDataConsent';

type ConsentPhase = 'checking' | 'needed' | 'granted';

/**
 * Gates third-party AI uploads until the user explicitly consents (App Store 5.1.2).
 */
export function useAiDataConsent() {
  const [phase, setPhase] = useState<ConsentPhase>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await hasAcceptedAiDataConsent();
      if (!cancelled) setPhase(ok ? 'granted' : 'needed');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback(async () => {
    setBusy(true);
    try {
      await acceptAiDataConsent();
      setPhase('granted');
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    consentReady: phase !== 'checking',
    needsConsent: phase === 'needed',
    hasConsent: phase === 'granted',
    consentBusy: busy,
    acceptConsent: accept,
  };
}
