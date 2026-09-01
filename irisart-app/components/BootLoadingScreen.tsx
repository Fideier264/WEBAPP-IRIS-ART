import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/** Early boot UI — must work before theme providers mount (font preload). */
export function BootLoadingScreen({ label }: { label?: string }) {
  return (
    <View style={styles.root}>
      <ActivityIndicator color="#7C5CFF" size="large" />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F8FF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
  },
  label: { fontSize: 14, textAlign: 'center', color: 'rgba(10,11,16,0.62)' },
});
