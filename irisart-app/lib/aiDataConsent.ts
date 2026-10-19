import AsyncStorage from '@react-native-async-storage/async-storage';

/** Bump when consent copy or recipients change so users must re-approve. */
export const AI_DATA_CONSENT_VERSION = 'v1';

const STORAGE_KEY = 'irisart_ai_data_consent_v1';

type StoredConsent = {
  version: string;
  acceptedAt: string;
};

let memoryAcceptedVersion: string | null = null;

export async function hasAcceptedAiDataConsent(): Promise<boolean> {
  if (memoryAcceptedVersion === AI_DATA_CONSENT_VERSION) return true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed?.version === AI_DATA_CONSENT_VERSION && parsed.acceptedAt) {
      memoryAcceptedVersion = AI_DATA_CONSENT_VERSION;
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function acceptAiDataConsent(): Promise<void> {
  const payload: StoredConsent = {
    version: AI_DATA_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
  };
  memoryAcceptedVersion = AI_DATA_CONSENT_VERSION;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function revokeAiDataConsent(): Promise<void> {
  memoryAcceptedVersion = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
