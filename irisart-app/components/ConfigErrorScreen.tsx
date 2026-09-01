import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';

/** Shown when Supabase env vars are missing at build time and runtime. */
export function ConfigErrorScreen({ missing }: { missing?: string[] }) {
  const c = useAppColors();
  const keys =
    missing && missing.length > 0
      ? missing
      : ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: c.pageText }]}>Konfiguration unvollständig</Text>
          <Text style={[styles.body, { color: c.pageMuted }]}>
            Supabase-Zugangsdaten fehlen. Auf Hostinger müssen die Variablen in der Node.js Web App gesetzt sein —
            sie werden beim Start von server.js ausgelesen (nicht nur beim Build).
          </Text>
          <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.boxTitle, { color: c.text }]}>Fehlt:</Text>
            {keys.map((key) => (
              <Text key={key} style={[styles.mono, { color: c.text }]}>
                {key}
              </Text>
            ))}
          </View>
          <Text style={[styles.body, { color: c.pageMuted }]}>
            Hostinger → Node.js Web App → Environment Variables prüfen → App neu starten (Redeploy). Danach Hard-Refresh
            (Strg+F5).
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: '800' },
  body: { fontSize: 14.5, lineHeight: 21 },
  box: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  boxTitle: { fontSize: 14, fontWeight: '750' },
  mono: { fontFamily: 'monospace', fontSize: 13.5 },
});
