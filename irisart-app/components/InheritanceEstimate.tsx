import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '@/lib/appTheme';
import { useT } from '@/lib/i18n';
import {
  INHERITANCE_COLOR_OPTIONS,
  inferInheritanceEyeColor,
  lookupChildColorOdds,
  type InheritanceEyeColor,
} from '@/lib/inheritanceOdds';

type Props = {
  primaryHex: string;
  paletteHexes: string[];
};

const COLOR_LABEL: Record<InheritanceEyeColor, 'results.inheritanceColorBrown' | 'results.inheritanceColorGreen' | 'results.inheritanceColorBlueGray'> = {
  brown: 'results.inheritanceColorBrown',
  green: 'results.inheritanceColorGreen',
  blueGray: 'results.inheritanceColorBlueGray',
};

export function InheritanceEstimate({ primaryHex, paletteHexes }: Props) {
  const c = useAppColors();
  const t = useT();
  const selfColor = useMemo(
    () => inferInheritanceEyeColor(primaryHex, paletteHexes),
    [primaryHex, paletteHexes]
  );
  const [partnerColor, setPartnerColor] = useState<InheritanceEyeColor | null>(null);

  const odds = partnerColor ? lookupChildColorOdds(selfColor, partnerColor) : null;

  return (
    <View style={{ gap: 10 }}>
      <Text style={[styles.title, { color: c.muted }]}>{t('results.inheritance')}</Text>

      <Text style={[styles.body, { color: c.text }]}>
        {t('results.inheritanceYourColor', { color: t(COLOR_LABEL[selfColor]) })}
      </Text>

      <Text style={[styles.label, { color: c.muted }]}>{t('results.inheritancePartnerLabel')}</Text>
      <View style={styles.chips}>
        {INHERITANCE_COLOR_OPTIONS.map((id) => {
          const active = partnerColor === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPartnerColor(id)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: active ? c.cardChipBorderActive : c.cardChipBorder,
                  backgroundColor: active ? c.cardChipBgActive : c.cardChipBg,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}>
              <Text style={[styles.chipText, { color: active ? c.cardChipTextActive : c.cardChipText }]}>
                {t(COLOR_LABEL[id])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {odds ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.body, { color: c.text }]}>
            {t('results.inheritancePairIntro', {
              self: t(COLOR_LABEL[selfColor]),
              partner: t(COLOR_LABEL[partnerColor!]),
            })}
          </Text>
          <View style={[styles.oddsBox, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
            <OddsRow label={t('results.inheritanceColorGreen')} value={odds.green} />
            <OddsRow label={t('results.inheritanceColorBlueGray')} value={odds.blueGray} />
            <OddsRow label={t('results.inheritanceColorBrown')} value={odds.brown} />
          </View>
          {odds.heterozygousNote ? (
            <Text style={[styles.footnote, { color: c.muted }]}>{t('results.inheritanceHeterozygousNote')}</Text>
          ) : null}
          <Text style={[styles.citation, { color: c.muted }]}>{t('results.inheritanceCitation')}</Text>
        </View>
      ) : (
        <Text style={[styles.hint, { color: c.muted }]}>{t('results.inheritancePickPartner')}</Text>
      )}
    </View>
  );
}

function OddsRow({ label, value }: { label: string; value: string }) {
  const c = useAppColors();
  return (
    <View style={styles.oddsRow}>
      <Text style={[styles.oddsLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.oddsValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 12.5, fontWeight: '750', letterSpacing: 0.15, textTransform: 'uppercase' },
  label: { fontSize: 12, fontWeight: '650' },
  body: { fontSize: 13.5, lineHeight: 19.5 },
  hint: { fontSize: 12.5, lineHeight: 18, fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  oddsBox: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  oddsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  oddsLabel: { fontSize: 13, fontWeight: '650', flex: 1 },
  oddsValue: { fontSize: 13.5, fontWeight: '800' },
  footnote: { fontSize: 11, lineHeight: 15.5 },
  citation: { fontSize: 10, lineHeight: 14, opacity: 0.85 },
});
