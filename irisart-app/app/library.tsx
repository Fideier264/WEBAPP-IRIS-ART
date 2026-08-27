import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomBar } from '@/components/AppBottomBar';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ACCOUNT_HEADER_CLEARANCE, BOTTOM_BAR_CLEARANCE } from '@/constants/Layout';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
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
  const c = Colors[scheme ?? 'light'];
  const muted = scheme === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<UserIrisItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [dualMode, setDualMode] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - 36 - 10) / 2);
  const t = useT();
  const params = useLocalSearchParams<{ pickDual?: string; textureUri?: string }>();
  const pickDualParam = params.pickDual === '1' || params.pickDual === 'true';
  const existingTexture = typeof params.textureUri === 'string' ? params.textureUri : undefined;

  useEffect(() => {
    if (pickDualParam) {
      setDualMode(true);
      setPickedIds([]);
    }
  }, [pickDualParam]);

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

  const togglePick = (id: string) => {
    const max = existingTexture && pickDualParam ? 1 : 2;
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return max === 1 ? [id] : [prev[prev.length - 1]!, id];
      return [...prev, id];
    });
  };

  const continueDual = () => {
    // Coming from shop to pick only the second iris
    if (existingTexture && pickDualParam) {
      const secondId = pickedIds[0];
      const second = secondId ? items.find((x) => x.id === secondId) : undefined;
      if (!second) return;
      router.push({
        pathname: '/shop',
        params: { textureUri: existingTexture, textureUri2: second.uri },
      });
      return;
    }
    if (pickedIds.length !== 2) return;
    const a = items.find((x) => x.id === pickedIds[0]);
    const b = items.find((x) => x.id === pickedIds[1]);
    if (!a || !b) return;
    router.push({
      pathname: '/shop',
      params: { textureUri: a.uri, textureUri2: b.uri },
    });
  };

  const pickOrderLabel = (id: string) => {
    const idx = pickedIds.indexOf(id);
    return idx >= 0 ? String(idx + 1) : null;
  };

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
          <View style={{ flex: 1, gap: 4, paddingRight: ACCOUNT_HEADER_CLEARANCE }}>
            <Text style={[styles.hTitle, { color: c.text }]}>{t('library.title')}</Text>
            <Text style={[styles.sub, { color: muted }]}>
              {dualMode ? t('library.dualHint') : user ? t('library.subSignedIn') : t('library.subSignedOut')}
            </Text>
          </View>
        </View>

        {user && items.length >= 2 ? (
          <View style={styles.dualBar}>
            {!dualMode ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setDualMode(true);
                  setPickedIds([]);
                }}
                style={({ pressed }) => [
                  styles.dualBtn,
                  { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
                ]}>
                <Text style={styles.dualBtnTxt}>{t('library.dualShop')}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDualMode(false);
                    setPickedIds([]);
                  }}
                  style={({ pressed }) => [
                    styles.dualBtnOutline,
                    { borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.9 : 1 },
                  ]}>
                  <Text style={[styles.dualBtnOutlineTxt, { color: c.text }]}>{t('library.dualCancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={pickDualParam && existingTexture ? pickedIds.length < 1 : pickedIds.length !== 2}
                  onPress={continueDual}
                  style={({ pressed }) => [
                    styles.dualBtn,
                    {
                      backgroundColor: c.tint,
                      opacity:
                        (pickDualParam && existingTexture ? pickedIds.length < 1 : pickedIds.length !== 2)
                          ? 0.45
                          : pressed
                            ? 0.9
                            : 1,
                      flex: 1,
                    },
                  ]}>
                  <Text style={styles.dualBtnTxt}>{t('library.dualContinue')}</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {!user && !authLoading ? (
          <View style={[styles.emptyCard, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[styles.empty, { color: muted }]}>{t('library.loginRequired')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: c.tint, opacity: pressed ? 0.9 : 1 },
              ]}>
              <Text style={styles.primaryText}>{t('library.loginCta')}</Text>
            </Pressable>
          </View>
        ) : null}

        {user ? (
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {loadingList ? <ActivityIndicator color={c.tint} style={{ marginTop: 20 }} /> : null}

            {items.map((x) => {
              const order = pickOrderLabel(x.id);
              const selected = order !== null;
              return (
                <View
                  key={x.id}
                  style={[
                    styles.card,
                    {
                      width: cardW,
                      borderColor: selected ? c.tint : c.border,
                      backgroundColor: c.surface,
                      borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (dualMode) togglePick(x.id);
                      else openAnalysis(x);
                    }}>
                    <Image source={{ uri: x.uri }} style={styles.thumb} resizeMode="cover" />
                    {order ? (
                      <View style={[styles.badge, { backgroundColor: c.tint }]}>
                        <Text style={styles.badgeTxt}>{order}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                  {!dualMode ? (
                    <View style={styles.row}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openAnalysis(x)}
                        style={({ pressed }) => [
                          styles.smallBtn,
                          { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.9 : 1 },
                        ]}>
                        <Text style={[styles.smallBtnTxt, { color: c.text }]}>{t('library.analyze')}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/shop', params: { textureUri: x.uri } })}
                        style={({ pressed }) => [
                          styles.smallBtn,
                          { borderColor: c.border, backgroundColor: c.surfaceAlt, opacity: pressed ? 0.9 : 1 },
                        ]}>
                        <Text style={[styles.smallBtnTxt, { color: c.text }]}>{t('library.shop')}</Text>
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
                        <Text style={[styles.smallBtnTxt, { color: muted }]}>{t('library.delete')}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {!loadingList && items.length === 0 ? (
              <View style={[styles.emptyCard, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text style={[styles.empty, { color: muted }]}>{t('library.empty')}</Text>
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
  dualBar: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  dualBtn: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  dualBtnTxt: { color: '#fff', fontSize: 13.5, fontWeight: '850' },
  dualBtnOutline: {
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dualBtnOutlineTxt: { fontSize: 13.5, fontWeight: '750' },
  grid: { gap: 10, paddingBottom: BOTTOM_BAR_CLEARANCE, flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderRadius: 18, overflow: 'hidden', padding: 10, gap: 10 },
  thumb: { width: '100%', height: 150, borderRadius: 12, backgroundColor: '#000' },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
  row: { flexDirection: 'column', gap: 6 },
  smallBtn: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  smallBtnTxt: { fontSize: 12.5, fontWeight: '750' },
  emptyCard: { width: '100%', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 12 },
  empty: { fontSize: 13.5, lineHeight: 19 },
  primaryBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 14.5, fontWeight: '850' },
});
