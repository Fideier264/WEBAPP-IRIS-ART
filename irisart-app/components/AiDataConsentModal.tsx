import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { useT } from '@/lib/i18n';

type Props = {
  visible: boolean;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

/**
 * Apple 5.1.2 / AI data sharing: disclose what is sent, to whom, and get permission
 * before iris images leave the device for third-party AI.
 */
export function AiDataConsentModal({ visible, busy, onAccept, onDecline }: Props) {
  const c = useAppColors();
  const t = useT();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDecline}>
      <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: c.pageText }]}>{t('aiConsent.title')}</Text>
          <Text style={[styles.lead, { color: c.pageMuted }]}>{t('aiConsent.lead')}</Text>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('aiConsent.whatTitle')}</Text>
            <Text style={[styles.cardBody, { color: c.muted }]}>{t('aiConsent.whatBody')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('aiConsent.whoTitle')}</Text>
            <Text style={[styles.cardBody, { color: c.muted }]}>{t('aiConsent.whoBody')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('aiConsent.whyTitle')}</Text>
            <Text style={[styles.cardBody, { color: c.muted }]}>{t('aiConsent.whyBody')}</Text>
          </View>

          <Text style={[styles.note, { color: c.pageMuted }]}>{t('aiConsent.note')}</Text>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onAccept}
            style={({ pressed }) => [
              styles.primary,
              { backgroundColor: c.tint, opacity: pressed || busy ? 0.88 : 1 },
            ]}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>{t('aiConsent.accept')}</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onDecline}
            style={({ pressed }) => [
              styles.secondary,
              { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed || busy ? 0.88 : 1 },
            ]}>
            <Text style={[styles.secondaryText, { color: c.text }]}>{t('aiConsent.decline')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 12 },
  title: { fontSize: 22, fontWeight: '850', letterSpacing: 0.2 },
  lead: { fontSize: 14.5, lineHeight: 21 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontSize: 14.5, fontWeight: '800' },
  cardBody: { fontSize: 13.5, lineHeight: 19.5 },
  note: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  footer: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  primary: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryText: { color: '#fff', fontSize: 15.5, fontWeight: '850' },
  secondary: {
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  secondaryText: { fontSize: 15, fontWeight: '750' },
});
