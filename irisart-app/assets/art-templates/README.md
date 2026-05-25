# Art-Template Overlays

PNG mit **transparentem Bereich** für die Iris (Rest: Rahmen, Deko, Text).

## Datei

- Ein Overlay pro Vorlage, z. B. `brown-poster-01.png`
- **`aspectRatio`** in der App = **exakt** `Pixelbreite ÷ Pixelhöhe` dieser PNG (z. B. 1080×1350 → `1080/1350`).

## Loch / Iris — keine App-Maske

- Die Iris-Textur (Nano Banana) wird **nicht** elliptisch ausgeschnitten.
- Sie liegt als **ganzes Bild** in einem **rechteckigen Slot** unter der PNG.
- **Sichtbare Form** = nur die **Transparenz** deiner PNG (rund, oval, … egal).
- **`irisHole`**: dieselbe **Bounding-Box** wie dein Loch — normiert **0–1** zur PNG-Größe:
  - `x`, `y`: linke obere Ecke des **umschließenden Rechtecks** des Lochs
  - `w`, `h`: Breite und Höhe dieses Rechtecks  
  - In Figma/Photoshop: Rechteck um das Loch ziehen, Position/Größe in px durch Bildbreite bzw. -höhe teilen.

## Skalierung der Iris im Slot

| Option | Bedeutung |
|--------|-----------|
| `irisResizeMode: 'contain'` (Standard) | **Komplettes** Iris-Bild sichtbar, Seitenverhältnis erhalten; ggf. schwarze Balken (wie Nano-Banana-Hintergrund). |
| `irisResizeMode: 'cover'` | Slot komplett gefüllt; Ränder der Textur können abgeschnitten werden. |
| `irisScale` | Zusätzlicher Zoom (1 = normal), z. B. `1.08` — wirkt wie „näher ran“, schneidet eher Ränder weg. |
| `irisSlotBackground` | Farbe hinter der Textur im Slot, Standard `#000000`. |

**Workflow:** Zuerst `irisHole` so setzen, dass Rechteck und Loch in der PNG übereinstimmen. Dann bei Bedarf `cover` + leichtes `irisScale` feintunen.

Tipp: Loch in der PNG und Bounding-Box möglichst **gleich groß** wählen, dann wirkt `contain` am saubersten.

## Einbindung

In `lib/artTemplates.ts` einen Eintrag ergänzen:

```ts
overlayImage: require('@/assets/art-templates/dein-overlay.png'),
```

und `colorFamilies` setzen (`brown`, `blue`, `green`, `hazel`, `gray`, `amber`, oder `any`).
