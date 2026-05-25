import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomBar } from '@/components/AppBottomBar';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { getUserIrisLibrary, removeUserIris, type UserIrisItem } from '@/lib/userIrisLibrary';

export default function LibraryScreen() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const muted = scheme === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';
  const [items, setItems] = useState<UserIrisItem[]>([]);
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - 36 - 10) / 2);

  const reload = useCallback(async () => {
    const list = await getUserIrisLibrary();
    setItems(list);
  }, []);

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
        <Text style={[styles.hTitle, { color: c.text }]}>Meine Galerie</Text>
        <Text style={[styles.sub, { color: muted }]}>
          Alle gespeicherten Iris-Renderings. Tippe auf eine Iris für Analyse oder Shop.
        </Text>

        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {items.map((x) => (
            <View key={x.id} style={[styles.card, { width: cardW, borderColor: c.border, backgroundColor: c.surface }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/results', params: { uri: x.uri } })}>
                <Image source={{ uri: x.uri }} style={styles.thumb} resizeMode="cover" />
              </Pressable>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/results', params: { uri: x.uri } })}
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

          {items.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: c.border, backgroundColor: c.surface }]}>
              <Text style={[styles.empty, { color: muted }]}>
                Noch keine Iris gespeichert. Starte einen neuen Scan.
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <AppBottomBar active="library" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10, gap: 8 },
  hTitle: { fontSize: 22, fontWeight: '900' },
  sub: { fontSize: 13.5, lineHeight: 18.5, marginBottom: 6 },
  grid: { gap: 10, paddingBottom: 120, flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', padding: 10, gap: 10 },
  thumb: { width: '100%', height: 150, borderRadius: 12, backgroundColor: '#000' },
  row: { flexDirection: 'column', gap: 6 },
  smallBtn: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  smallBtnTxt: { fontSize: 12.5, fontWeight: '750' },
  emptyCard: { width: '100%', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  empty: { fontSize: 13.5, lineHeight: 19 },
});

