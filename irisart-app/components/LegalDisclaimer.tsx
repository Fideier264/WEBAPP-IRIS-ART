import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/lib/appTheme';
import { useT, type TranslationKey } from '@/lib/i18n';

type DisclaimerVariant = 'home' | 'results' | 'capture' | 'account';

const COPY: Record<DisclaimerVariant, { title?: TranslationKey; body: TranslationKey }> = {
  home: { title: 'disclaimer.homeTitle', body: 'disclaimer.homeBody' },
  results: { title: 'disclaimer.resultsTitle', body: 'disclaimer.resultsBody' },
  capture: { body: 'disclaimer.captureBody' },
  account: { title: 'disclaimer.accountTitle', body: 'disclaimer.accountBody' },
};

export function LegalDisclaimer({
  variant,
  compact,
}: {
  variant: DisclaimerVariant;
  compact?: boolean;
}) {
  const c = useAppColors();
  const t = useT();
  const copy = COPY[variant];
  const title = copy.title ? t(copy.title) : null;
  const emphasize = variant === 'results';

  return (
    <View
      accessibilityRole="text"
      style={[
        styles.box,
        compact && styles.boxCompact,
        {
          backgroundColor: emphasize ? 'rgba(220,160,40,0.12)' : c.surface,
          borderColor: emphasize ? 'rgba(220,160,40,0.45)' : c.border,
        },
      ]}>
      {title ? (
        <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      ) : null}
      <Text
        style={[styles.body, compact && styles.bodyCompact, { color: c.muted }]}
      >
        {t(copy.body)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    alignSelf: 'stretch',
    width: '100%',
  },
  boxCompact: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  title: { fontSize: 13.5, fontWeight: '800' },
  body: { fontSize: 12.5, lineHeight: 18, flexShrink: 1 },
  bodyCompact: { fontSize: 11.5, lineHeight: 16 },
});
