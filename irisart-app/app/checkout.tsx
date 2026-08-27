import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArtTemplateComposite } from '@/components/ArtTemplateComposite';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ACCOUNT_HEADER_CLEARANCE } from '@/constants/Layout';
import {
  openCheckoutUrl,
  rememberCheckoutTemplate,
  rememberCheckoutTexture,
  rememberCheckoutTexture2,
  requestCreateCheckoutSession,
  restoreCheckoutTemplate,
  restoreCheckoutTexture,
  restoreCheckoutTexture2,
} from '@/lib/createStripeCheckout';
import { getArtTemplateById, isDualEyeTemplate } from '@/lib/artTemplates';
import { useT, type TranslationKey } from '@/lib/i18n';
import {
  catalogHasPayableSkus,
  getCatalogProducts,
  getCatalogSource,
  uniqueCategories,
  type CatalogProduct,
} from '@/lib/merchOneCatalog';
import { uploadCheckoutArtwork } from '@/lib/orderPrintUpload';

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function paramString(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  return undefined;
}

function translateCategoryLabel(category: string, categoryLabel: string, t: TFn): string {
  if (category === 'canvas') return t('catalog.canvas');
  return categoryLabel;
}

function translateDescription(description: string | undefined, t: TFn): string | undefined {
  if (!description) return undefined;
  if (description === 'Galerie-Leinwand' || description === 'Gallery canvas') {
    return t('catalog.galleryCanvas');
  }
  return description;
}

export default function CheckoutScreen() {
  const scheme = useColorScheme();
  const cs = scheme ?? 'light';
  const c = Colors[cs];
  const muted = cs === 'dark' ? 'rgba(243,245,255,0.62)' : 'rgba(10,11,16,0.62)';
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - 36 - 10) / 2);
  const t = useT();

  const params = useLocalSearchParams<{
    textureUri?: string | string[];
    textureUri2?: string | string[];
    templateId?: string | string[];
    canceled?: string | string[];
  }>();
  const paramTexture = paramString(params.textureUri);
  const paramTexture2 = paramString(params.textureUri2);
  const paramTemplateId = paramString(params.templateId);
  const canceled = paramString(params.canceled) === '1' || paramString(params.canceled) === 'true';

  const [textureUri, setTextureUri] = useState<string | undefined>(paramTexture);
  const [textureUri2, setTextureUri2] = useState<string | undefined>(paramTexture2);
  const [templateId, setTemplateId] = useState<string | undefined>(paramTemplateId);

  useEffect(() => {
    if (paramTexture) {
      setTextureUri(paramTexture);
      rememberCheckoutTexture(paramTexture);
    } else {
      const restored = restoreCheckoutTexture();
      if (restored) setTextureUri(restored);
    }

    if (paramTexture2) {
      setTextureUri2(paramTexture2);
      rememberCheckoutTexture2(paramTexture2);
    } else if (paramTexture) {
      // New single-texture navigation clears second iris
      rememberCheckoutTexture2(undefined);
      setTextureUri2(undefined);
    } else {
      const restored2 = restoreCheckoutTexture2();
      if (restored2) setTextureUri2(restored2);
    }

    if (paramTemplateId) {
      setTemplateId(paramTemplateId);
      rememberCheckoutTemplate(paramTemplateId);
    } else {
      const restoredTemplate = restoreCheckoutTemplate();
      if (restoredTemplate) setTemplateId(restoredTemplate);
    }
  }, [paramTexture, paramTexture2, paramTemplateId]);

  const template = useMemo(
    () => (templateId ? getArtTemplateById(templateId) : undefined),
    [templateId]
  );

  const products = useMemo(() => getCatalogProducts(), []);
  const categories = useMemo(() => uniqueCategories(products), [products]);
  const payable = catalogHasPayableSkus();

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 'canvas');
  const visibleProducts = useMemo(
    () => products.filter((p) => p.category === categoryId),
    [products, categoryId]
  );

  const [selectedId, setSelectedId] = useState(visibleProducts[0]?.id ?? products[0]?.id ?? '');

  useEffect(() => {
    if (!visibleProducts.find((p) => p.id === selectedId)) {
      setSelectedId(visibleProducts[0]?.id ?? '');
    }
  }, [visibleProducts, selectedId]);

  const selected: CatalogProduct | null =
    products.find((p) => p.id === selectedId) ?? visibleProducts[0] ?? null;

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

  const [status, setStatus] = useState<'idle' | 'uploading' | 'redirecting' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputSurface = { backgroundColor: c.surfaceAlt, borderColor: c.border, color: c.text };
  const busy = status === 'uploading' || status === 'redirecting';
  const selectedCatLabel = selected
    ? translateCategoryLabel(selected.category, selected.categoryLabel, t)
    : '';
  const selectedDesc = selected ? translateDescription(selected.description, t) : undefined;

  async function onPay() {
    setErrorMsg(null);

    if (!textureUri) {
      setErrorMsg(t('checkout.errNoArt'));
      setStatus('error');
      return;
    }
    if (!templateId || !template) {
      setErrorMsg(t('checkout.errNoTemplate'));
      setStatus('error');
      return;
    }
    if (isDualEyeTemplate(template) && !textureUri2) {
      setErrorMsg(t('checkout.errNoSecondIris'));
      setStatus('error');
      return;
    }
    if (!selected) {
      setErrorMsg(t('checkout.errNoProduct'));
      setStatus('error');
      return;
    }
    if (!selected.sku) {
      setErrorMsg(t('checkout.errNoSku'));
      setStatus('error');
      return;
    }

    const cc = country.trim().toUpperCase().slice(0, 2);
    if (cc.length !== 2) {
      setErrorMsg(t('checkout.errCountry'));
      setStatus('error');
      return;
    }
    if ((cc === 'US' || cc === 'CA') && !region.trim()) {
      setErrorMsg(t('checkout.errRegion'));
      setStatus('error');
      return;
    }
    if (!email.trim() || !firstName.trim() || !lastName.trim() || !street.trim() || !city.trim() || !postcode.trim()) {
      setErrorMsg(t('checkout.errRequired'));
      setStatus('error');
      return;
    }

    try {
      setStatus('uploading');
      rememberCheckoutTexture(textureUri);
      rememberCheckoutTexture2(textureUri2);
      rememberCheckoutTemplate(templateId);
      const { printFileUrl } = await uploadCheckoutArtwork({
        textureUri,
        textureUri2,
        templateId,
        printAspectRatio: selected.printAspectRatio,
      });

      setStatus('redirecting');
      const catLabel = translateCategoryLabel(selected.category, selected.categoryLabel, t);
      const stripeTitle = `${catLabel} ${selected.title}`.trim();
      const res = await requestCreateCheckoutSession({
        printFileUrl,
        templateId,
        productSku: selected.sku,
        productLabel: `IrisArt ${stripeTitle} · ${template.title}`,
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
        externalId: `irisart_${Date.now()}`,
      });

      if (!res.ok) {
        setErrorMsg(res.error);
        setStatus('error');
        return;
      }

      await openCheckoutUrl(res.url);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

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
            <Text style={[styles.chipText, { color: c.text }]}>{t('checkout.back')}</Text>
          </Pressable>
          <Text style={[styles.hTitle, { color: c.text }]} numberOfLines={1}>
            {t('checkout.title')}
          </Text>
          <View style={{ width: ACCOUNT_HEADER_CLEARANCE }} />
        </View>

        {!textureUri ? (
          <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('checkout.noImage')}</Text>
            <Text style={[styles.cardBody, { color: muted }]}>{t('checkout.noImageBody')}</Text>
          </View>
        ) : !template ? (
          <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('checkout.noTemplate')}</Text>
            <Text style={[styles.cardBody, { color: muted }]}>{t('checkout.noTemplateBody')}</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {canceled ? (
              <View style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{t('checkout.canceledTitle')}</Text>
                <Text style={[styles.cardBody, { color: muted }]}>{t('checkout.canceledBody')}</Text>
              </View>
            ) : null}

            {!payable ? (
              <View style={[styles.card, { borderColor: 'rgba(220,160,40,0.55)', backgroundColor: c.surface }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{t('checkout.catalogNoSku')}</Text>
                <Text style={[styles.cardBody, { color: muted }]}>
                  {t('checkout.catalogNoSkuBody', { source: getCatalogSource() })}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: c.text }]}>{t('checkout.printMotif')}</Text>
            <View style={[styles.summaryCard, { borderColor: c.border, backgroundColor: c.surface }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>{template.title}</Text>
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <ArtTemplateComposite
                  key={`checkout:${template.id}:${textureUri}:${textureUri2 ?? ''}`}
                  textureUri={textureUri}
                  textureUri2={textureUri2}
                  template={template}
                  width={Math.min(width - 36, 320)}
                />
              </View>
              <Text style={[styles.cardBody, { color: muted }]}>{t('checkout.printHint')}</Text>
            </View>

            <Text style={[styles.sectionTitle, { color: c.text }]}>{t('checkout.pickProduct')}</Text>
            {categories.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                {categories.map((cat) => {
                  const active = cat.id === categoryId;
                  return (
                    <Pressable
                      key={cat.id}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setCategoryId(cat.id)}
                      style={({ pressed }) => [
                        styles.catChip,
                        {
                          borderColor: active ? c.tint : c.border,
                          backgroundColor: active ? 'rgba(124,92,255,0.14)' : c.surfaceAlt,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}>
                      <Text style={[styles.catChipText, { color: c.text }]}>
                        {translateCategoryLabel(cat.id, cat.label, t)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.productGrid}>
              {visibleProducts.map((p) => {
                const active = p.id === selected?.id;
                const photoUri = p.imageUrl || textureUri;
                const catLabel = translateCategoryLabel(p.category, p.categoryLabel, t);
                const desc = translateDescription(p.description, t);
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => setSelectedId(p.id)}
                    style={({ pressed }) => [
                      styles.productCard,
                      {
                        width: cardW,
                        borderColor: active ? c.tint : c.border,
                        backgroundColor: c.surface,
                        opacity: pressed ? 0.92 : 1,
                      },
                    ]}>
                    <View style={styles.productPhotoWrap}>
                      <Image source={{ uri: photoUri }} style={styles.productPhoto} resizeMode="cover" />
                      {active ? (
                        <View style={[styles.selectedBadge, { backgroundColor: c.tint }]}>
                          <Text style={styles.selectedBadgeText}>{t('common.selected')}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.productTitle, { color: c.text }]} numberOfLines={2}>
                      {p.title}
                    </Text>
                    <Text style={[styles.productMeta, { color: muted }]} numberOfLines={1}>
                      {catLabel}
                      {desc ? ` · ${desc}` : ''}
                    </Text>
                    <Text style={[styles.productPrice, { color: c.text }]}>{p.priceLabel}</Text>
                  </Pressable>
                );
              })}
            </View>

            {selected ? (
              <View style={[styles.summaryCard, { borderColor: c.border, backgroundColor: c.surface }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{t('checkout.selection')}</Text>
                <Text style={[styles.cardBody, { color: muted }]}>
                  {selectedCatLabel} — {selected.title}
                  {selectedDesc ? `\n${selectedDesc}` : ''}
                </Text>
                <Text style={[styles.summaryPrice, { color: c.text }]}>{selected.priceLabel}</Text>
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: c.text }]}>{t('checkout.shipping')}</Text>
            <View style={styles.form}>
              <LabeledInput label={t('checkout.email')} value={email} onChangeText={setEmail} keyboardType="email-address" style={inputSurface} />
              <LabeledInput label={t('checkout.firstName')} value={firstName} onChangeText={setFirstName} style={inputSurface} />
              <LabeledInput label={t('checkout.lastName')} value={lastName} onChangeText={setLastName} style={inputSurface} />
              <LabeledInput label={t('checkout.company')} value={company} onChangeText={setCompany} style={inputSurface} />
              <LabeledInput label={t('checkout.street')} value={street} onChangeText={setStreet} style={inputSurface} />
              <LabeledInput label={t('checkout.street2')} value={street2} onChangeText={setStreet2} style={inputSurface} />
              <LabeledInput label={t('checkout.postcode')} value={postcode} onChangeText={setPostcode} style={inputSurface} />
              <LabeledInput label={t('checkout.city')} value={city} onChangeText={setCity} style={inputSurface} />
              <LabeledInput
                label={t('checkout.country')}
                value={country}
                onChangeText={(v) => setCountry(v.toUpperCase().slice(0, 2))}
                autoCapitalize="characters"
                maxLength={2}
                style={inputSurface}
              />
              <LabeledInput
                label={t('checkout.region')}
                value={region}
                onChangeText={setRegion}
                style={inputSurface}
              />
              <LabeledInput label={t('checkout.telephone')} value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" style={inputSurface} />
            </View>

            {errorMsg ? (
              <View style={[styles.card, { borderColor: 'rgba(220,80,80,0.5)', backgroundColor: c.surface }]}>
                <Text style={[styles.cardTitle, { color: c.text }]}>{t('checkout.payFailed')}</Text>
                <Text style={[styles.cardBody, { color: c.text }]}>{errorMsg}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onPay()}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: c.tint,
                  opacity: busy ? 0.55 : pressed ? 0.88 : 1,
                },
              ]}>
              {busy ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.primaryBtnText}>
                    {status === 'uploading' ? t('checkout.uploading') : t('checkout.redirecting')}
                  </Text>
                </View>
              ) : (
                <Text style={styles.primaryBtnText}>
                  {selected?.priceLabel
                    ? t('checkout.payCtaPrice', { price: selected.priceLabel })
                    : t('checkout.payCta')}
                </Text>
              )}
            </Pressable>
            <Text style={[styles.legal, { color: muted }]}>{t('checkout.legal')}</Text>
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
  scroll: { paddingBottom: 48, gap: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  catRow: { gap: 8, paddingBottom: 2 },
  catChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  catChipText: { fontSize: 13.5, fontWeight: '750' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  productPhotoWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#111',
    position: 'relative',
  },
  productPhoto: { width: '100%', height: '100%' },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedBadgeText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  productTitle: {
    fontSize: 15.5,
    fontWeight: '850',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  productMeta: { fontSize: 12.5, marginTop: 2, paddingHorizontal: 10 },
  productPrice: { fontSize: 14.5, fontWeight: '800', marginTop: 6, paddingHorizontal: 10 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardBody: { fontSize: 14, lineHeight: 20 },
  summaryPrice: { fontSize: 18, fontWeight: '850', marginTop: 4 },
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
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryBtnText: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  legal: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
