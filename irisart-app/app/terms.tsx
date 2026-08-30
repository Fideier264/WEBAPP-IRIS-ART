import React, { useMemo } from 'react';

import { LegalDocumentScreen } from '@/components/LegalDocumentScreen';
import { getTermsDocument } from '@/lib/legalDocuments';
import { useLocale, useT } from '@/lib/i18n';

export default function TermsScreen() {
  const t = useT();
  const { locale } = useLocale();
  const document = useMemo(() => getTermsDocument(locale), [locale]);

  return <LegalDocumentScreen document={document} backLabel={t('common.back')} />;
}
