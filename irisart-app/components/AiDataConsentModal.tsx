import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAppColors } from '@/lib/appTheme';
import { useT } from '@/lib/i18n';

type Props = {
  visible: boolean;
  busy?: boolean;
  onAccept: () => void;
};

/**
 * Camera-permission-style gate: blurs the screen and shows a compact card
 * disclosing AI data sharing before the user can continue.
 * Declining is not a leave action — the blur + card stay until they agree.
 */
export function AiDataConsentModal({ visible, busy, onAccept }: Props) {
  const c = useAppColors();
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      {Platform.OS === 'web' ? (
        <View style={[StyleSheet.absoluteFill, styles.webDim]} />
      ) : (
        <BlurView intensity={60} tint={c.isDarkPage ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      )}
      <View style={[StyleSheet.absoluteFill, styles.dim]} />

      <View style={styles.center}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={[styles.title, { color: c.text }]}>{t('aiConsent.title')}</Text>
          <Text style={[styles.body, { color: c.muted }]}>{t('aiConsent.cardSummary')}</Text>

          {expanded ? (
            <ScrollView style={styles.details} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <Text style={[styles.detailTitle, { color: c.text }]}>{t('aiConsent.whatTitle')}</Text>
              <Text style={[styles.detailBody, { color: c.muted }]}>{t('aiConsent.whatBody')}</Text>
              <Text style={[styles.detailTitle, { color: c.text }]}>{t('aiConsent.whoTitle')}</Text>
              <Text style={[styles.detailBody, { color: c.muted }]}>{t('aiConsent.whoBody')}</Text>
              <Text style={[styles.detailTitle, { color: c.text }]}>{t('aiConsent.whyTitle')}</Text>
              <Text style={[styles.detailBody, { color: c.muted }]}>{t('aiConsent.whyBody')}</Text>
              <Text style={[styles.detailBody, { color: c.muted, marginTop: 6 }]}>{t('aiConsent.note')}</Text>
            </ScrollView>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => setExpanded((v) => !v)}
            style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1, alignSelf: 'flex-start' }]}>
            <Text style={[styles.link, { color: c.tint }]}>
              {expanded ? t('aiConsent.hideDetails') : t('aiConsent.readDetails')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onAccept}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: c.tint, opacity: pressed || busy ? 0.88 : 1 },
            ]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{t('aiConsent.accept')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  webDim: { backgroundColor: 'rgba(10,11,16,0.55)' },
  dim: { backgroundColor: 'rgba(10,11,16,0.32)' },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
    maxHeight: '78%',
  },
  title: { fontSize: 18, fontWeight: '750' },
  body: { fontSize: 13.5, lineHeight: 19.5 },
  details: { maxHeight: 180 },
  detailTitle: { fontSize: 13.5, fontWeight: '800', marginTop: 8 },
  detailBody: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  link: { fontSize: 13.5, fontWeight: '750', textDecorationLine: 'underline' },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '750' },
});
