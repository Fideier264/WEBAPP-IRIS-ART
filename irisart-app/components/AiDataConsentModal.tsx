import { BlurView } from 'expo-blur';
import React from 'react';
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
  /** Optional dismiss (e.g. account settings). Gate screens omit this so the card stays. */
  onDismiss?: () => void;
};

/**
 * Camera-permission-style gate: blurs the screen and shows a card disclosing
 * what / who / why for third-party AI before the user can continue (App Store 5.1.2).
 */
export function AiDataConsentModal({ visible, busy, onAccept, onDismiss }: Props) {
  const c = useAppColors();
  const t = useT();

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
          <Text style={[styles.body, { color: c.muted }]}>{t('aiConsent.lead')}</Text>

          <ScrollView style={styles.details} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <Text style={[styles.detailTitle, { color: c.text }]}>{t('aiConsent.whatTitle')}</Text>
            <Text style={[styles.detailBody, { color: c.muted }]}>{t('aiConsent.whatBody')}</Text>
            <Text style={[styles.detailTitle, { color: c.text }]}>{t('aiConsent.whoTitle')}</Text>
            <Text style={[styles.detailBody, { color: c.muted }]}>{t('aiConsent.whoBody')}</Text>
            <Text style={[styles.detailTitle, { color: c.text }]}>{t('aiConsent.whyTitle')}</Text>
            <Text style={[styles.detailBody, { color: c.muted }]}>{t('aiConsent.whyBody')}</Text>
            <Text style={[styles.detailBody, { color: c.muted, marginTop: 8 }]}>{t('aiConsent.note')}</Text>
          </ScrollView>

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

          {onDismiss ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  backgroundColor: c.surfaceAlt,
                  borderColor: c.border,
                  opacity: pressed || busy ? 0.88 : 1,
                },
              ]}>
              <Text style={[styles.secondaryText, { color: c.text }]}>{t('aiConsent.decline')}</Text>
            </Pressable>
          ) : null}
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
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
    maxHeight: '82%',
  },
  title: { fontSize: 18, fontWeight: '750' },
  body: { fontSize: 13.5, lineHeight: 19.5 },
  details: { maxHeight: 260 },
  detailTitle: { fontSize: 13.5, fontWeight: '800', marginTop: 10 },
  detailBody: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '750' },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 14.5, fontWeight: '750' },
});
