import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppColors } from '@/lib/appTheme';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

/** Shown when the production web build was deployed without required env vars. */
export function ConfigErrorScreen() {
  const c = useAppColors();
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.title, { color: c.pageText }]}>Konfiguration unvollständig</Text>
          <Text style={[styles.body, { color: c.pageMuted }]}>
            Die App wurde ohne Supabase-Zugangsdaten gebaut. Das passiert oft nach einem Domain-Wechsel, wenn die
            Umgebungsvariablen auf Hostinger nicht gesetzt oder kein neuer Build ausgelöst wurde.
          </Text>
          <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[styles.boxTitle, { color: c.text }]}>Fehlt im Build:</Text>
            {missing.map((key) => (
              <Text key={key} style={[styles.mono, { color: c.text }]}>
                {key}
              </Text>
            ))}
          </View>
          <Text style={[styles.body, { color: c.pageMuted }]}>
            Hostinger → Node.js Web App → Environment Variables setzen, dann erneut deployen (Build neu ausführen).
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
