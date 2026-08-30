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
  };
  const extraKey = map[name];
  const fromExtra = extraKey ? extra[extraKey] : undefined;
  return typeof fromExtra === 'string' && fromExtra.trim() ? fromExtra.trim() : undefined;
}

export function getLegalOperator(): LegalOperator {
  return {
    productName: 'IrisArt',
    operatorName: env('EXPO_PUBLIC_LEGAL_OPERATOR_NAME') ?? '[Betreiber / Firmenname eintragen]',
    contactEmail: env('EXPO_PUBLIC_LEGAL_CONTACT_EMAIL') ?? 'privacy@irisart.app',
    addressLine: env('EXPO_PUBLIC_LEGAL_ADDRESS') ?? '[Anschrift eintragen]',
    effectiveDate: env('EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE') ?? '2026-08-30',
  };
}
