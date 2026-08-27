import type { ImageSourcePropType } from 'react-native';

import { templateMatchesFamilies, type EyeColorFamily } from './irisColorFamily';

/**
 * Normiertes Rechteck für die Iris (0–1 relativ zur Template-Breite/-Höhe).
 * Dein Overlay-PNG muss dasselbe Seitenverhältnis wie `aspectRatio` haben; Loch und Rand skalieren mit.
 */
export type IrisHoleNorm = {
  /** linke Kante 0–1 — **Bounding-Box** des transparenten Lochs (gleiche Maße wie in der PNG) */
  x: number;
  /** obere Kante 0–1 */
  y: number;
  /** Breite 0–1 */
  w: number;
  /** Höhe 0–1 */
  h: number;
  /**
   * @deprecated Nur noch für Platzhalter-Rahmen ohne PNG. **Kein** Kreis-Clip mehr:
   * Die sichtbare Form kommt allein aus dem transparenten Bereich deiner Overlay-PNG.
   */
  circular?: boolean;
};

export type ArtTemplate = {
  id: string;
  title: string;
  subtitle?: string;
  /** Breite / Höhe des Template-Bitmaps (z. B. 4/5 für Hochformat-Poster) */
  aspectRatio: number;
  /** Für welche Augenfarben das Template gedacht ist; `any` = immer anzeigen */
  colorFamilies: EyeColorFamily[];
  /**
   * Primäres Iris-Loch (Einzel-Templates; bei Dual = erstes Loch / linkes Auge).
   * Rechteck = Bounding-Box des transparenten Bereichs in der PNG.
   */
  irisHole: IrisHoleNorm;
  /**
   * Mehrere Cutouts (z. B. Zwei-Augen-Templates). Wenn gesetzt und length ≥ 2,
   * werden `textureUri` / `textureUri2` … nacheinander in diese Löcher gesetzt.
   * Fehlt das Feld, gilt nur `irisHole`.
   */
  irisHoles?: IrisHoleNorm[];
  /**
   * Wie die Textur in dieses Rechteck passt:
   * - `contain` (Standard): **ganzes** Iris-Bild sichtbar, ggf. schwarze Ränder (wie Nano-Banana-Hintergrund).
   * - `cover`: Rechteck ausfüllen, dabei Ränder der Textur abschneiden.
   */
  irisResizeMode?: 'contain' | 'cover';
  /** Hintergrund hinter der Textur im Slot (z. B. #000000 wie Nano-Banana) */
  irisSlotBackground?: string;
  /**
   * PNG mit transparentem Bereich für die Iris. Oben drüber, full-bleed.
   * Für Iris-Tint: Graustufen-PNG verwenden und `tintWithIrisColor: true` setzen.
   */
  overlayImage?: ImageSourcePropType;
  /**
   * Wenn true: Overlay wird mit Iris-Farbe getintet (nur Graustufen-PNGs).
   * Wenn false/undefined: Overlay-Farben bleiben unverändert (fertige Farb-Templates).
   */
  tintWithIrisColor?: boolean;
  /**
   * Nur wirksam mit `tintWithIrisColor: true`.
   * Wenn true: statt einer Durchschnittsfarbe werden Iris-Farben winkel-/radial
   * aufs Overlay gemappt (mehrfarbige Augen → unterschiedliche Töne am Template).
   */
  multiColorTint?: boolean;
  /** Zoom um den Mittelpunkt des Slots (1 = kein Extra-Zoom). Erhöhen = näher ran, dabei mehr Rand abgeschnitten. */
  irisScale?: number;
};

/** Alle Iris-Löcher eines Templates (1 = Einzel, ≥2 = Dual/Multi). */
export function getArtTemplateHoles(template: ArtTemplate): IrisHoleNorm[] {
  if (template.irisHoles && template.irisHoles.length > 0) return template.irisHoles;
  return [template.irisHole];
}

export function isDualEyeTemplate(template: ArtTemplate): boolean {
  return getArtTemplateHoles(template).length >= 2;
}

/**
 * Beispiel-Templates ohne PNG — nur zum Testen von Filter + Platzierung.
 * Ersetze/ergänze durch eigene Overlays (Loch = Transparenz in der PNG).
 */
export const ART_TEMPLATES: ArtTemplate[] = [
{
  id: 'galaxyblue',
  title: 'Blue Galaxy',
  subtitle: 'Optional',
  aspectRatio: 2048 / 2050, // Breite ÷ Höhe deines PNG (z. B. 1080×1350 → 1080/1350)
  colorFamilies: ['blue','gray'], // oder z. B. ['blue','gray']
  irisHole: {
    x: 0.22,
    y: 0.218,
    w: 0.561,
    h: 0.561,   // Höhe relativ zur Bildhöhe
    circular: true,
  },
  irisScale: 1.05, // optional: etwas reinzoomen
  overlayImage: require('@/assets/art-templates/galaxyblue.png'),
},
{
  id: 'galaxygreeen',
  title: 'Green Galaxy',
  subtitle: 'Optional',
  aspectRatio: 2294 / 1824, // Breite ÷ Höhe deines PNG (z. B. 1080×1350 → 1080/1350)
  colorFamilies: ['green','hazel','gray'], // oder z. B. ['brown','hazel']
  irisHole: {
    x: 0.276,
    y: 0.262,
    w: 0.477,
    h: 0.477,   // Höhe relativ zur Bildhöhe
    circular: true,
  },
  irisScale: 1.05, // optional: etwas reinzoomen
  overlayImage: require('@/assets/art-templates/galaxygreen.png'),
},
{
  id: 'galaxy.grau',
  title: 'Galaxy',
  subtitle: 'Graustufen — Mehrfarben-Tint aus der Iris',
  aspectRatio: 2132 / 1984,
  colorFamilies: ['any'],
  tintWithIrisColor: true,
  multiColorTint: true,
  irisHole: {
    x: 0.281,
    y: 0.2661,
    w: 0.4371,
    h: 0.4688,
    circular: true,
  },
  irisScale: 1.31,
  overlayImage: require('@/assets/art-templates/galaxygrau.png'),
},
{
  id: 'template.shards.grau',
  title: 'Shattered',
  subtitle: 'Graustufen — Mehrfarben-Tint aus der Iris',
  aspectRatio: 2129 / 2048,
  colorFamilies: ['any'],
  tintWithIrisColor: true,
  multiColorTint: true,
  irisHole: {
    x: 0.156,
    y: 0.173,
    w: 0.71,
    h: 0.66,
    circular: true,
  },
  irisScale: 1.05,
  overlayImage: require('@/assets/art-templates/template.shards.grau.png'),
},

{
  id: 'doublegalaxy',
  title: 'Double Galaxy',
  subtitle: 'Zwei Iris — Farbe je Seite aus dem jeweiligen Auge',
  aspectRatio: 2134 / 1984,
  colorFamilies: ['any'],
  tintWithIrisColor: true,
  // Durchschnittsfarbe je Seite (klarer als Multi-Noise bei Dual)
  multiColorTint: false,
  irisResizeMode: 'cover',
  irisHole: {
    x: 0.2038,
    y: 0.1683,
    w: 0.54208,
    h: 0.6,
  },
  irisHoles: [
    { x: 0.2038, y: 0.1683, w: 0.3308, h: 0.3644 }, // oben links = 1. Iris
    { x: 0.4705, y: 0.45, w: 0.38, h: 0.4 }, // unten rechts = 2. Iris
  ],
  irisScale: 1.25,
  overlayImage: require('@/assets/art-templates/doublegalaxy.png'),
},

{
  id: 'mein-test-01',
  title: 'Test brown galaxy',
  subtitle: 'Optional',
  aspectRatio: 2132 / 1984, // tatsächliche PNG-Maße
  colorFamilies: ['brown'], // oder z. B. ['brown','hazel']
  irisHole: {
    x: 0.273,
    y: 0.2572,
    w: 0.455,
    h: 0.48,
  },
  irisResizeMode: 'contain',
  irisScale: 1,
  overlayImage: require('@/assets/art-templates/testbrown.png'),
},

];

export function filterTemplatesByEyeFamilies(
  userFamilies: EyeColorFamily[],
  templates: ArtTemplate[] = ART_TEMPLATES
): ArtTemplate[] {
  return templates.filter((t) => templateMatchesFamilies(t.colorFamilies, userFamilies));
}

export function getArtTemplateById(id: string): ArtTemplate | undefined {
  const key = id.trim();
  if (!key) return undefined;
  return ART_TEMPLATES.find((t) => t.id === key);
}
