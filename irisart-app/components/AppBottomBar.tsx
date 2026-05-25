import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';

export function AppBottomBar({
  active,
  shopTextureUri,
}: {
  active: 'library' | 'scan' | 'shop';
  shopTextureUri?: string;
}) {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingBottom: Math.max(8, insets.bottom) }]}>
      <View style={[styles.wrap, { borderColor: c.border, backgroundColor: c.surface }]}>
      <BarBtn
        label="Galerie"
        active={active === 'library'}
        onPress={() => router.replace('/library')}
        tint={c.tint}
        text={c.text}
      />
      <BarBtn
        label="Scan"
        active={active === 'scan'}
        onPress={() => router.replace('/')}
        tint={c.tint}
        text={c.text}
      />
      <BarBtn
        label="Shop"
        active={active === 'shop'}
        onPress={() => router.replace({ pathname: '/shop', params: shopTextureUri ? { textureUri: shopTextureUri } : {} })}
        tint={c.tint}
        text={c.text}
      />
      </View>
    </View>
  );
}

function BarBtn({
  label,
  active,
  onPress,
  tint,
  text,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tint: string;
  text: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        active && { backgroundColor: 'rgba(124,92,255,0.14)' },
        pressed && { opacity: 0.85 },
      ]}>
      <Text style={[styles.txt, { color: active ? tint : text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 0,
    zIndex: 30,
  },
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 6,
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  txt: {
    fontSize: 13.5,
    fontWeight: '800',
  },
});

