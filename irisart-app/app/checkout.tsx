import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { requestCreateMerchOneOrder } from '@/lib/createMerchOneOrder';
import { getCanvasProductOptions, hasConfiguredCanvasSkus } from '@/lib/merchOneCatalog';
import { uploadOrderPrintFile } from '@/lib/orderPrintUpload';

export default function CheckoutScreen() {
  const scheme = useColorScheme();
  const cs = scheme ?? 'light';
  const c = Colors[cs];
  const muted = cs === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';

  const params = useLocalSearchParams<{ textureUri?: string }>();
  const textureUri = typeof params.textureUri === 'string' ? params.textureUri : undefined;

  const options = useMemo(() => getCanvasProductOptions(), []);
  const skusOk = hasConfiguredCanvasSkus();

  const [selectedSku, setSelectedSku] = useState<string | null>(options[0]?.sku ?? null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [street, setStreet] = useState('');
  const [street2, setStreet2] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry] = useState('DE');
  const [region, setRegion] = useState('');
  const [telephone, setTelephone] = useState('');

  const [status, setStatus] = useState<'idle' | 'uploading' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isTestOrder, setIsTestOrder] = useState(false);

  const inputSurface = { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text };

  async function onOrder() {
    setErrorMsg(null);
    if (!textureUri) {
      setErrorMsg('Kein Kunstwerk (textureUri).');
      setStatus('error');
      return;
    }
    if (!selectedSku) {
      setErrorMsg('Bitte eine Leinwandgröße wählen.');
      setStatus('error');
      return;
    }
    if (!skusOk) {
      setErrorMsg('Leinwand-SKUs fehlen in der App-Konfiguration (.env).');
      setStatus('error');
      return;
    }

    const cc = country.trim().toUpperCase().slice(0, 2);
    if (cc.length !== 2) {
      setErrorMsg('Land als ISO-2 Code (z. B. DE).');
      setStatus('error');
      return;
    }
    if ((cc === 'US' || cc === 'CA') && !region.trim()) {
      setErrorMsg('Bundesland/Region für US/CA erforderlich.');
      setStatus('error');
      return;
    }

    if (!email.trim() || !firstName.trim() || !lastName.trim() || !street.trim() || !city.trim() || !postcode.trim()) {
      setErrorMsg('Bitte alle Pflichtfelder der Lieferadresse ausfüllen.');
      setStatus('error');
      return;
    }

    try {
      setStatus('uploading');
      const printFileUrl = await uploadOrderPrintFile(textureUri);

      setStatus('submitting');
      const ext = `irisart_${Date.now()}`;
      const res = await requestCreateMerchOneOrder({
        printFileUrl,
        productSku: selectedSku,
        shipping: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          company: company.trim() || undefined,
          street: street.trim(),
          street2: street2.trim() || undefined,
          city: city.trim(),
          postcode: postcode.trim(),
          country: cc,
          region: region.trim() || undefined,
          telephone: telephone.trim() || undefined,
        },
        externalId: ext,
      });

      if (!res.ok) {
        setErrorMsg(res.error);
        setStatus('error');
        return;
      }

      setOrderId(res.orderId);
      setIsTestOrder(res.isTest);
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  const busy = status === 'uploading' || status === 'submitting';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: c.border, backgroundColor: c.surface },
              pressed && { opacity: 0.85 },
            ]}>
            <Text style={[styles.chipText, { color: c.text }]}>Zurück</Text>
          </Pressable>
          <Text style={[styles.hTitle, { color: c.text }]} numberOfLines={1}>
            Bestellen
          </Text>
          <View style={{ width: 72 }} />
        </View>

        {!textureUri ? (
          <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>Kein Bild</Text>
            <Text style={[styles.cardBody, { color: muted }]}>Bitte vom Shop aus „Leinwand bestellen“ wählen.</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionTitle, { color: c.text }]}>Dein Motiv</Text>
            <View style={[styles.previewCard, { borderColor: c.border, backgroundColor: c.surface }]}>
              <Image source={{ uri: textureUri }} style={styles.previewImg} resizeMode="cover" />
            </View>

            {!skusOk ? (
              <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>SKUs konfigurieren</Text>
                <Text style={[styles.cardBody, { color: muted }]}>
                  Trage in der .env die merchOne-Blueprint-SKUs ein: EXPO_PUBLIC_MERCHONE_SKU_CANVAS_30CM und
                  EXPO_PUBLIC_MERCHONE_SKU_CANVAS_60CM (Werte aus dem merchOne-Dashboard).
                </Text>
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: c.text }]}>Format</Text>
            <View style={styles.sizeRow}>
              {options.map((o) => {
                const active = o.sku === selectedSku;
                return (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => setSelectedSku(o.sku)}
                    style={({ pressed }) => [
                      styles.sizePill,
                      {
                        borderColor: active ? c.tint : c.border,
                        backgroundColor: active ? 'rgba(124,92,255,0.14)' : c.surfaceAlt,
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}>
                    <Text style={[styles.sizePillText, { color: c.text }]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { color: c.text }]}>Lieferadresse</Text>
            <View style={styles.form}>
              <LabeledInput label="E-Mail" value={email} onChangeText={setEmail} keyboardType="email-address" style={inputSurface} />
              <LabeledInput label="Vorname" value={firstName} onChangeText={setFirstName} style={inputSurface} />
              <LabeledInput label="Nachname" value={lastName} onChangeText={setLastName} style={inputSurface} />
              <LabeledInput label="Firma (optional)" value={company} onChangeText={setCompany} style={inputSurface} />
              <LabeledInput label="Straße, Nr." value={street} onChangeText={setStreet} style={inputSurface} />
              <LabeledInput label="Adresszusatz" value={street2} onChangeText={setStreet2} style={inputSurface} />
              <LabeledInput label="PLZ" value={postcode} onChangeText={setPostcode} style={inputSurface} />
              <LabeledInput label="Stadt" value={city} onChangeText={setCity} style={inputSurface} />
              <LabeledInput
                label="Land (ISO-2, z. B. DE)"
                value={country}
                onChangeText={(t) => setCountry(t.toUpperCase().slice(0, 2))}
                autoCapitalize="characters"
                maxLength={2}
                style={inputSurface}
              />
              <LabeledInput
                label="Region/Bundesland (Pflicht für US/CA)"
                value={region}
                onChangeText={setRegion}
                style={inputSurface}
              />
              <LabeledInput label="Telefon" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" style={inputSurface} />
            </View>

            {errorMsg ? (
              <View style={[styles.card, { borderColor: 'rgba(220,80,80,0.5)', backgroundColor: c.surface }]}>
                <Text style={[styles.cardBody, { color: c.text }]}>{errorMsg}</Text>
              </View>
            ) : null}

            {status === 'done' ? (
              <View style={[styles.card, { borderColor: c.tint, backgroundColor: c.surface }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>Bestellung übermittelt</Text>
                <Text style={[styles.cardBody, { color: muted }]}>
                  {orderId ? `merchOne Order-ID: ${orderId}` : 'Bestellung angenommen.'}
                  {isTestOrder ? '\n(Testbestellung — laut Server-Konfiguration nicht produktiv.)' : ''}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy || status === 'done' || !skusOk}
              onPress={() => void onOrder()}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: c.tint,
                  opacity: busy || status === 'done' || !skusOk ? 0.5 : pressed ? 0.88 : 1,
                },
              ]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {status === 'done' ? 'Bestellt' : 'Bestellen'}
                </Text>
              )}
            </Pressable>
            <Text style={[styles.legal, { color: muted }]}>
              Mit „Bestellen“ wird eine Bestellung bei merchOne ausgelöst (Druck & Versand). Zahlungsabwicklung
              folgt in einer späteren Version — aktuell nur API-Anlage gemäß Server-Einstellung (Sandbox/Test möglich).
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
  maxLength,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  style: { backgroundColor: string; borderColor: string; color: string };
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: style.color }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        maxLength={maxLength}
        placeholderTextColor="rgba(128,128,140,0.85)"
        style={[
          styles.input,
          {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            color: style.color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 18, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 72,
    alignItems: 'center',
  },
  chipText: { fontSize: 13.5, fontWeight: '600' },
  hTitle: { flex: 1, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  scroll: { paddingBottom: 40, gap: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  previewCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    aspectRatio: 1,
    maxHeight: 320,
    alignSelf: 'center',
    width: '100%',
  },
  previewImg: { width: '100%', height: '100%' },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardBody: { fontSize: 14, lineHeight: 20 },
  sizeRow: { flexDirection: 'column', gap: 10 },
  sizePill: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sizePillText: { fontSize: 15, fontWeight: '700' },
  form: { gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', opacity: 0.9 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  legal: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
