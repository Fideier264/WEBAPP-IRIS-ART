import React, { useMemo } from 'react';

import { LegalDocumentScreen } from '@/components/LegalDocumentScreen';
import { getPrivacyDocument } from '@/lib/legalDocuments';
import { useLocale, useT } from '@/lib/i18n';

export default function PrivacyScreen() {
  const t = useT();
  const { locale } = useLocale();
  const document = useMemo(() => getPrivacyDocument(locale), [locale]);

  return <LegalDocumentScreen document={document} backLabel={t('common.back')} />;
}
