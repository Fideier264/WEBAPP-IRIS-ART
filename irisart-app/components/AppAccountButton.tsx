import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { useAuth } from '@/lib/auth';
import { useColorScheme } from './useColorScheme';

/** Floating top-right Account / Login control on every screen. */
export function AppAccountButton() {
  const scheme = useColorScheme();
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  // Already on the account screen — no need for a second entry.
  if (pathname === '/account') return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: Math.max(10, insets.top + 6), right: 18 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={user ? 'Account' : 'Login'}
        hitSlop={8}
        onPress={() => router.push('/account')}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: c.border, backgroundColor: c.surface },
          pressed && { opacity: 0.85 },
        ]}>
        <Text style={[styles.txt, { color: c.text }]}>
          {loading ? '…' : user ? 'Account' : 'Login'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    zIndex: 40,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  txt: { fontSize: 13.5, fontWeight: '750' },
});
