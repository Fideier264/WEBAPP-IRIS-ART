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
  /** Wo die Iris-Textur liegt (unter dem Overlay). Rechteck = gleiche Bounding-Box wie das Loch in der PNG. */
  irisHole: IrisHoleNorm;
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
   * Später: `require('@/assets/art-templates/dein-overlay.png')`
   */
  overlayImage?: ImageSourcePropType;
  /** Zoom um den Mittelpunkt des Slots (1 = kein Extra-Zoom). Erhöhen = näher ran, dabei mehr Rand abgeschnitten. */
  irisScale?: number;
};

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
  id: 'mein-test-01',
  title: 'Test brown galaxy',
  subtitle: 'Optional',
  aspectRatio: 533 / 496, // Breite ÷ Höhe deines PNG (z. B. 1080×1350 → 1080/1350)
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
