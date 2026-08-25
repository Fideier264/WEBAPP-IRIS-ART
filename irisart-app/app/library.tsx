import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomBar } from '@/components/AppBottomBar';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/lib/auth';
import { getUserIrisLibrary, removeUserIris, type UserIrisItem } from '@/lib/userIrisLibrary';
import { seedIrisAnalysisCache } from '@/lib/analyzeIris';

function openAnalysis(item: UserIrisItem) {
  if (item.analysis) {
    seedIrisAnalysisCache(item.uri, item.analysis, item.id);
    if (item.fingerprint) seedIrisAnalysisCache(item.uri, item.analysis, item.fingerprint);
  }
  router.push({
    pathname: '/results',
    params: {
      uri: item.uri,
      irisId: item.id,
      ...(item.fingerprint ? { irisFingerprint: item.fingerprint } : {}),
    },
  });
}

export default function LibraryScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const muted = scheme === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<UserIrisItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - 36 - 10) / 2);

  const reload = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoadingList(true);
    try {
      const list = await getUserIrisLibrary();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={
          scheme === 'dark'
            ? ['rgba(124,92,255,0.22)', 'rgba(0,212,255,0.06)', 'rgba(5,6,10,0)']
            : ['rgba(91,92,255,0.12)', 'rgba(0,212,255,0.04)', 'rgba(247,248,255,0)']
        }
        start={{ x: 0.15, y: 0.05 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.hTitle, { color: c.text }]}>Meine Galerie</Text>
            <Text style={[styles.sub, { color: muted }]}>
              {user
                ? 'Alle gespeicherten Iris-Renderings. Tippe auf eine Iris für Analyse oder Shop.'
                : 'Zum Speichern und Anzeigen deiner Iris-Bilder bitte anmelden.'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/account')}
            style={({ pressed }) => [
              styles.accountChip,
              { borderColor: c.border, backgroundColor: c.surface },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={[styles.accountChipText, { color: c.text }]}>
              {authLoading ? '…' : user ? 'Account' : 'Login'}
            </Text>
          </Pressable>
        </View>

        {!user && !authLoading ? (
          <View style={[styles.emptyCard, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[styles.empty, { color: muted }]}>
              Login required to save and view your iris gallery. Generation still works without an account.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={styles.primaryText}>Login / Create account</Text>
            </Pressable>
          </View>
        ) : null}

        {user ? (
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {loadingList ? <ActivityIndicator color={c.tint} style={{ marginTop: 20 }} /> : null}

            {items.map((x) => (
              <View key={x.id} style={[styles.card, { width: cardW, borderColor: c.border, backgroundColor: c.surface }]}>
                <Pressable accessibilityRole="button" onPress={() => openAnalysis(x)}>
                  <Image source={{ uri: x.uri }} style={styles.thumb} resizeMode="cover" />
                </Pressable>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openAnalysis(x)}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.9 : 1 },
                    ]}>
                    <Text style={[styles.smallBtnTxt, { color: c.text }]}>Analyse</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/shop', params: { textureUri: x.uri } })}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.9 : 1 },
                    ]}>
                    <Text style={[styles.smallBtnTxt, { color: c.text }]}>Shop</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={async () => {
                      await removeUserIris(x.id);
                      await reload();
                    }}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.9 : 1 },
                    ]}>
                    <Text style={[styles.smallBtnTxt, { color: muted }]}>Löschen</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {!loadingList && items.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text style={[styles.empty, { color: muted }]}>
                  Noch keine Iris gespeichert. Starte einen neuen Scan — fertige Renderings werden automatisch in deinem Account gespeichert.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        <AppBottomBar active="library" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hTitle: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 13.5, lineHeight: 18.5, marginBottom: 6 },
  accountChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  accountChipText: { fontSize: 13.5, fontWeight: '750' },
  grid: { gap: 10, paddingBottom: 120, flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: 10, gap: 10 },
  thumb: { width: '100%', height: 150, borderRadius: 12, backgroundColor: '#000' },
  row: { flexDirection: 'column', gap: 6 },
  smallBtn: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  smallBtnTxt: { fontSize: 12.5, fontWeight: '750' },
  emptyCard: { width: '100%', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 12 },
  empty: { fontSize: 13.5, lineHeight: 19 },
  primaryBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 14.5, fontWeight: '850' },
});
