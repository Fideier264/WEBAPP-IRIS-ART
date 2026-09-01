/**
 * Operator / Impressum placeholders for Privacy Policy & Terms.
 * Fill via env before App Store / production launch.
 */
import Constants from 'expo-constants';

export type LegalOperator = {
  productName: string;
  operatorName: string;
  contactEmail: string;
  addressLine: string;
  website: string;
  effectiveDate: string;
};

function env(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const map: Record<string, string> = {
    EXPO_PUBLIC_LEGAL_OPERATOR_NAME: 'legalOperatorName',
    EXPO_PUBLIC_LEGAL_CONTACT_EMAIL: 'legalContactEmail',
    EXPO_PUBLIC_LEGAL_ADDRESS: 'legalAddress',
    EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE: 'legalEffectiveDate',
    EXPO_PUBLIC_APP_ORIGIN: 'appOrigin',
  };
  const extraKey = map[name];
  const fromExtra = extraKey ? extra[extraKey] : undefined;
  return typeof fromExtra === 'string' && fromExtra.trim() ? fromExtra.trim() : undefined;
}

export function getLegalOperator(): LegalOperator {
  return {
    productName: 'IrisArt',
    operatorName: env('EXPO_PUBLIC_LEGAL_OPERATOR_NAME') ?? 'Amir Figut',
    contactEmail: env('EXPO_PUBLIC_LEGAL_CONTACT_EMAIL') ?? 'contact@irisart.app',
    addressLine:
      env('EXPO_PUBLIC_LEGAL_ADDRESS') ?? 'Lucy-Hillebrandstr. 14, App. 6016, 55128 Mainz, Deutschland',
    website: env('EXPO_PUBLIC_APP_ORIGIN') ?? 'https://irisart.app',
    effectiveDate: env('EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE') ?? '2026-09-01',
  };
}
