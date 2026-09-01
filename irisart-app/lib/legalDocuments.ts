import { getLegalOperator, type LegalOperator } from './legalOperator';
import type { Locale } from './i18n/types';

export type LegalSection = { heading: string; paragraphs: string[] };

export type LegalDocument = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

function op(): LegalOperator {
  return getLegalOperator();
}

function privacyDe(o: LegalOperator): LegalDocument {
  return {
    title: 'Datenschutzerklärung',
    intro: `Gültig ab ${o.effectiveDate}. Diese Erklärung beschreibt, wie ${o.productName} (${o.operatorName}) personenbezogene Daten verarbeitet — insbesondere Iris-/Augenfotos und daraus abgeleitete Kunstwerke.`,
    sections: [
      {
        heading: '1. Verantwortlicher',
        paragraphs: [
          `${o.operatorName}`,
          o.addressLine,
          `Kontakt Datenschutz / Anfragen: ${o.contactEmail}`,
          'Bitte ersetze Platzhalter (Firmenname, Anschrift, E-Mail) vor dem öffentlichen Launch bzw. dem App-Store-Eintrag durch deine echten Angaben.',
        ],
      },
      {
        heading: '2. Was IrisArt ist — und was nicht',
        paragraphs: [
          `${o.productName} ist ein Unterhaltungs- und Kunstprodukt: Du kannst ein Auge fotografieren oder hochladen, ein Iris-Rendering erzeugen, Farben/Seltenheit als kreative Schätzung sehen und Druckprodukte bestellen.`,
          'IrisArt ist kein medizinischer Service, keine Iridologie, keine Diagnose und kein Gentest. Auswertungstexte und Prozentangaben sind Algorithmische Schätzungen zur Unterhaltung.',
        ],
      },
      {
        heading: '3. Iris-Fotos und biometriebezogene Daten',
        paragraphs: [
          'Augen- bzw. Iris-Bilder können als biometriebezogene bzw. besonders sensible Daten gelten (z. B. nach DSGVO Art. 9 und Apple-Richtlinien zu Biometrics). Wir verarbeiten sie nur, um die von dir gewünschten Kunst- und Analysefunktionen bereitzustellen — nicht zur Identitätsprüfung, Authentifizierung oder Personenwiedererkennung in anderen Kontexten.',
          'Erfasst werden können: Kamerafotos oder Uploads des Auges, zugeschnittene Ausschnitte, KI-veredelte Iris-Texturen, optionale Farb-/Unterhaltungsanalysen sowie technische Metadaten (z. B. Zeitstempel, Geräte-/Browserinformationen, Session).',
          'Rechtsgrundlage (soweit einschlägig): Einwilligung und/oder Vertragserfüllung (Nutzung der App, Speicherung in der Galerie, Bestellung). Du kannst Einwilligungen widerrufen und Daten löschen (siehe unten).',
        ],
      },
      {
        heading: '4. Zweck der Verarbeitung',
        paragraphs: [
          'Erzeugung und Anzeige von Iris-Kunst (Templates, Tönung, Vorschau).',
          'Optionale Unterhaltungsanalyse (Farben, Seltenheitshinweise) — ausdrücklich keine Diagnose.',
          'Konto und Galerie: Speichern deiner Renderings und Analysen, wenn du dich anmeldest.',
          'Bestellung und Versand von Druckprodukten über Zahlungs- und Fulfillment-Partner.',
          'Betrieb, Sicherheit, Missbrauchsvermeidung und Fehleranalyse der App.',
        ],
      },
      {
        heading: '5. Speicherung und Drittanbieter',
        paragraphs: [
          'Technische Infrastruktur (Authentifizierung, Dateispeicher, Serverfunktionen): Supabase bzw. vergleichbare Hosting-/Backend-Dienste.',
          'KI-Verarbeitung: externe Modelle/APIs können Bildausschnitte oder abgeleitete Daten verarbeiten, um Enhancement oder Analyse zu erzeugen. Wir setzen sie nur für die genannten App-Funktionen ein.',
          'Zahlung: Stripe (Checkout, Zahlungsabwicklung).',
          'Druck/Versand: merchOne oder vergleichbare Produktionspartner — dafür werden Druckdatei und Lieferadresse benötigt.',
          'Hosting der Web-App kann bei einem Webhoster liegen. Anbieter können Server-Logs (IP, User-Agent) speichern.',
        ],
      },
      {
        heading: '6. Speicherdauer',
        paragraphs: [
          'Lokale bzw. temporäre Verarbeitungsdaten (z. B. Cache, Session) werden nur so lange gehalten, wie für die Funktion nötig.',
          'Galerie und Kontoinhalte bleiben, bis du sie löschst oder dein Konto löschst.',
          'Abgeschlossene Bestellungen und Rechnungsdaten können bei Zahlungs- und Versandpartnern aus gesetzlichen Aufbewahrungspflichten länger gespeichert bleiben — auch nach Kontolöschung.',
        ],
      },
      {
        heading: '7. Deine Rechte und Löschung',
        paragraphs: [
          'Du kannst Auskunft, Berichtigung, Löschung, Einschränkung und Datenübertragbarkeit verlangen sowie der Verarbeitung widersprechen, soweit gesetzlich vorgesehen.',
          `In der App (Konto): einzelne Galerie-Einträge löschen oder „Konto löschen“. Dabei werden Login, Galerie-Bilder und gespeicherte Analysen in IrisArt entfernt.`,
          `Weitere Anfragen: ${o.contactEmail}.`,
        ],
      },
      {
        heading: '8. Kinder / Minderjährige',
        paragraphs: [
          'IrisArt richtet sich nicht an Kinder unter 13 Jahren (bzw. dem in deiner Region geltenden Mindestalter). Wenn du glaubst, dass ein Kind Daten übermittelt hat, kontaktiere uns zur Löschung.',
        ],
      },
      {
        heading: '9. Änderungen',
        paragraphs: [
          'Wir können diese Erklärung anpassen. Die aktuelle Fassung ist in der App unter „Datenschutz“ und unter der Web-Route /privacy erreichbar.',
        ],
      },
    ],
  };
}

function privacyEn(o: LegalOperator): LegalDocument {
  return {
    title: 'Privacy Policy',
    intro: `Effective ${o.effectiveDate}. This policy explains how ${o.productName} (${o.operatorName}) processes personal data — especially iris/eye photos and derived artwork.`,
    sections: [
      {
        heading: '1. Controller',
        paragraphs: [
          `${o.operatorName}`,
          o.addressLine,
          `Privacy / requests: ${o.contactEmail}`,
          'Replace placeholders (legal name, address, email) with your real details before public launch or App Store submission.',
        ],
      },
      {
        heading: '2. What IrisArt is — and is not',
        paragraphs: [
          `${o.productName} is an entertainment and art product: capture or upload an eye, generate an iris rendering, see creative color/rarity estimates, and order print products.`,
          'IrisArt is not a medical service, iridology, diagnosis, or genetic test. Result text and percentages are algorithmic estimates for entertainment.',
        ],
      },
      {
        heading: '3. Iris photos and biometric-related data',
        paragraphs: [
          'Eye/iris images may be treated as biometric-related or sensitive data (e.g. GDPR Art. 9 and Apple biometric guidance). We process them only to provide the art and analysis features you request — not for identity verification, authentication, or recognizing you in other contexts.',
          'We may process: camera photos or uploads, cropped eye regions, AI-enhanced iris textures, optional entertainment color analysis, and technical metadata (timestamps, device/browser info, session).',
          'Legal bases (where applicable): consent and/or contract performance (using the app, saving to your gallery, placing an order). You may withdraw consent and delete data (see below).',
        ],
      },
      {
        heading: '4. Purposes',
        paragraphs: [
          'Creating and displaying iris art (templates, tinting, previews).',
          'Optional entertainment analysis (colors, rarity notes) — explicitly not a diagnosis.',
          'Account and gallery: storing renderings and analyses when you sign in.',
          'Ordering and shipping print products via payment and fulfillment partners.',
          'Operating, securing, and debugging the app; preventing abuse.',
        ],
      },
      {
        heading: '5. Storage and processors',
        paragraphs: [
          'Backend (auth, file storage, edge functions): Supabase or comparable hosting/backend services.',
          'AI processing: external models/APIs may process image crops or derived data for enhancement or analysis, only for the app features described here.',
          'Payments: Stripe (checkout and payment processing).',
          'Print/shipping: merchOne or similar production partners — requiring the print file and shipping address.',
          'The web app may be hosted by a web hosting provider. Providers may keep server logs (IP, user agent).',
        ],
      },
      {
        heading: '6. Retention',
        paragraphs: [
          'Temporary/local processing data (cache, session) is kept only as long as needed for the feature.',
          'Gallery and account content remain until you delete them or delete your account.',
          'Completed orders and invoicing data may be retained by payment and shipping partners under legal record-keeping rules — including after account deletion.',
        ],
      },
      {
        heading: '7. Your rights and deletion',
        paragraphs: [
          'You may request access, correction, deletion, restriction, portability, and object to processing where the law provides.',
          'In the app (Account): delete individual gallery items or use “Delete account”. That removes login, gallery images, and stored analyses in IrisArt.',
          `Further requests: ${o.contactEmail}.`,
        ],
      },
      {
        heading: '8. Children',
        paragraphs: [
          'IrisArt is not directed at children under 13 (or the minimum age required in your region). If you believe a child submitted data, contact us for deletion.',
        ],
      },
      {
        heading: '9. Changes',
        paragraphs: [
          'We may update this policy. The current version is available in the app under Privacy and at the web route /privacy.',
        ],
      },
    ],
  };
}

function termsDe(o: LegalOperator): LegalDocument {
  return {
    title: 'Allgemeine Geschäftsbedingungen (AGB)',
    intro: `Gültig ab ${o.effectiveDate}. Diese AGB gelten für die Nutzung von ${o.productName} (App und Website) und den Kauf von Druckprodukten über ${o.operatorName}.`,
    sections: [
      {
        heading: '1. Anbieter',
        paragraphs: [
          `${o.operatorName}`,
          o.addressLine,
          `Kontakt: ${o.contactEmail}`,
          'Platzhalter vor dem Launch durch echte Anbieterdaten ersetzen.',
        ],
      },
      {
        heading: '2. Leistungsbeschreibung',
        paragraphs: [
          `${o.productName} bietet digitale Werkzeuge zur Erstellung von Iris-Kunst aus Nutzerfotos, optionale Unterhaltungsanalysen sowie die Bestellung physischer Drucke über Partner.`,
          'Inhalte der Analyse sind ausdrücklich zur Unterhaltung und keine medizinische, genetische oder iridologische Beratung.',
        ],
      },
      {
        heading: '3. Nutzerpflichten und Inhalte',
        paragraphs: [
          'Du darfst nur Fotos hochladen, zu deren Nutzung du berechtigt bist (eigenes Auge bzw. Einwilligung der abgebildeten Person).',
          'Verboten sind rechtswidrige, missbräuchliche oder die Rechte Dritter verletzende Inhalte sowie der Versuch, die Dienste zur Identitätsprüfung oder Überwachung zu missbrauchen.',
          'Du bleibst für deine Uploads verantwortlich. Mit dem Upload räumst du uns die für Betrieb, Verarbeitung, Vorschau und Druckauftrag erforderlichen Nutzungsrechte ein.',
        ],
      },
      {
        heading: '4. Iris-/Biometriebezogene Nutzung',
        paragraphs: [
          'Augenbilder werden zur Kunst- und Analysefunktion verarbeitet. Es findet keine Identitätsauthentifizierung per Iris statt.',
          'Details zur Datenverarbeitung stehen in der Datenschutzerklärung (/privacy).',
        ],
      },
      {
        heading: '5. Konto',
        paragraphs: [
          'Ein Konto ist optional für Galerie-Speicherung. Zugangsdaten sind geheim zu halten.',
          'Du kannst das Konto in der App löschen. Bestellhistorien bei Partnern können aus gesetzlichen Gründen bestehen bleiben.',
        ],
      },
      {
        heading: '6. Bestellungen, Zahlung, Versand',
        paragraphs: [
          'Druckprodukte werden über Stripe bezahlt und über Produktionspartner hergestellt und versendet.',
          'Preise und verfügbare Formate ergeben sich aus dem jeweiligen Checkout. Lieferzeiten und Versandbedingungen können vom Partner abhängen.',
          'Nach erfolgreicher Zahlung wird das Druckmotiv als Datei an den Partner übermittelt. Korrekturen nach Produktionsstart sind ggf. nicht möglich.',
        ],
      },
      {
        heading: '7. Widerruf / Verbraucherrechte',
        paragraphs: [
          'Für digitale Inhalte und personalisierte Waren können gesetzliche Ausnahme- oder Sonderregelungen gelten (z. B. personalisierte Drucke).',
          'Informationen zu Widerruf und Verbraucherrechten werden im Checkout bzw. in den Zahlungs-/Partnerbedingungen ergänzt, sobald der Anbieter final feststeht. Kontaktiere uns bei Fragen: ' +
            o.contactEmail +
            '.',
        ],
      },
      {
        heading: '8. Verfügbarkeit und Haftung',
        paragraphs: [
          'Wir bemühen uns um einen stabilen Betrieb, garantieren aber keine ununterbrochene Verfügbarkeit.',
          'KI-Ergebnisse können fehlerhaft oder ungenau sein. Soweit gesetzlich zulässig, haften wir nicht für Unterhaltungsschätzungen oder rein ästhetische Abweichungen zwischen Vorschau und Druck.',
          'Unberührt bleiben zwingende Haftungstatbestände (Vorsatz, grobe Fahrlässigkeit, Verletzung von Leben, Körper, Gesundheit, Produkthaftung).',
        ],
      },
      {
        heading: '9. Schlussbestimmungen',
        paragraphs: [
          'Es gilt das Recht des Sitzstaates des Anbieters, soweit keine zwingenden Verbraucherschutzvorschriften entgegenstehen.',
          'Sollten einzelne Klauseln unwirksam sein, bleibt der Rest wirksam.',
          'Aktuelle AGB: in der App unter „AGB“ und unter /terms im Web.',
        ],
      },
    ],
  };
}

function termsEn(o: LegalOperator): LegalDocument {
  return {
    title: 'Terms of Service',
    intro: `Effective ${o.effectiveDate}. These terms govern use of ${o.productName} (app and website) and purchases of print products from ${o.operatorName}.`,
    sections: [
      {
        heading: '1. Provider',
        paragraphs: [
          `${o.operatorName}`,
          o.addressLine,
          `Contact: ${o.contactEmail}`,
          'Replace placeholders with real provider details before launch.',
        ],
      },
      {
        heading: '2. Service description',
        paragraphs: [
          `${o.productName} provides tools to create iris art from user photos, optional entertainment analysis, and ordering of physical prints via partners.`,
          'Analysis content is for entertainment only and is not medical, genetic, or iridological advice.',
        ],
      },
      {
        heading: '3. User obligations and content',
        paragraphs: [
          'Upload only photos you are allowed to use (your own eye or consent of the person depicted).',
          'Unlawful, abusive, or rights-infringing content is prohibited, as is using the service for identity checks or surveillance.',
          'You remain responsible for your uploads. By uploading, you grant us the rights needed to operate processing, previews, and print fulfillment.',
        ],
      },
      {
        heading: '4. Iris / biometric-related use',
        paragraphs: [
          'Eye images are processed for art and analysis features. IrisArt does not authenticate identity via iris recognition.',
          'Details are in the Privacy Policy (/privacy).',
        ],
      },
      {
        heading: '5. Account',
        paragraphs: [
          'An account is optional for gallery storage. Keep credentials confidential.',
          'You may delete your account in the app. Partner order records may remain where legally required.',
        ],
      },
      {
        heading: '6. Orders, payment, shipping',
        paragraphs: [
          'Print products are paid via Stripe and produced/shipped by manufacturing partners (e.g. merchOne).',
          'Prices and formats are shown at checkout. Delivery times may depend on the partner.',
          'After successful payment the print artwork is sent to the partner. Changes after production starts may not be possible.',
        ],
      },
      {
        heading: '7. Withdrawal / consumer rights',
        paragraphs: [
          'Digital content and personalized goods may be subject to statutory exceptions.',
          'Withdrawal and consumer-rights notices will be completed for your jurisdiction once the legal entity is finalized. Contact ' +
            o.contactEmail +
            ' with questions.',
        ],
      },
      {
        heading: '8. Availability and liability',
        paragraphs: [
          'We aim for reliable service but do not guarantee uninterrupted availability.',
          'AI outputs may be inaccurate. To the extent permitted by law, we are not liable for entertainment estimates or purely aesthetic differences between preview and print.',
          'Mandatory liability (intent, gross negligence, personal injury, product liability) remains unaffected.',
        ],
      },
      {
        heading: '9. Final provisions',
        paragraphs: [
          'The law of the provider’s seat applies unless mandatory consumer protections require otherwise.',
          'If a clause is invalid, the remainder stays in force.',
          'Current terms: in the app under Terms and at /terms on the web.',
        ],
      },
    ],
  };
}

export function getPrivacyDocument(locale: Locale): LegalDocument {
  const o = op();
  return locale === 'de' ? privacyDe(o) : privacyEn(o);
}

export function getTermsDocument(locale: Locale): LegalDocument {
  const o = op();
  return locale === 'de' ? termsDe(o) : termsEn(o);
}
