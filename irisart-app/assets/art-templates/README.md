# Art-Template Overlays

PNG mit **transparentem Loch** für die Iris. Zwei Arten:

| Typ | PNG | Flags | Ergebnis |
|-----|-----|-------|----------|
| **Fertig eingefärbt** | z. B. blaue Galaxie | Flags weglassen | Overlay bleibt wie in der Datei |
| **Einfarb-Tint** | Graustufen | `tintWithIrisColor: true` | Eine gemittelte Iris-Farbe |
| **Mehrfarben-Tint** | Graustufen | `tintWithIrisColor: true` **und** `multiColorTint: true` | Iris-Farben winkel-/radial aufs Overlay (Hazel etc.) |

---

## Checkliste: neues Template

1. **PNG exportieren** (idealerweise sRGB, ohne eingebettetes Farbprofil-Chaos)
2. Datei nach `irisart-app/assets/art-templates/dein-name.png`
3. **Pixelmaße notieren** (Breite × Höhe) — z. B. Explorer → Eigenschaften, oder Photoshop
4. **Loch-Bounding-Box** messen (Rechteck um das transparente Loch, in px)
5. Eintrag in `lib/artTemplates.ts` (siehe unten)
6. **PNG + `artTemplates.ts` committen & pushen**
7. Hostinger neu deployen

Ohne Git-Push der PNG erscheint die Vorlage live nicht.

---

## Felder richtig ausfüllen

```ts
{
  id: 'shattered',                    // eindeutig, keine Leerzeichen nötig
  title: 'Shattered',                 // Anzeigename im Shop
  aspectRatio: 2129 / 2048,           // EXAKT Breite ÷ Höhe DIESER PNG
  colorFamilies: ['any'],             // Filter; bei Tint-Vorlagen meist 'any'
  tintWithIrisColor: true,            // nur bei Graustufen-PNG!
  multiColorTint: true,               // optional: mehrere Iris-Farben räumlich mappen
  irisHole: {
    x: 0.241,                         // links = LochLinksPx / Breite
    y: 0.224,                         // oben  = LochObenPx / Höhe
    w: 0.534,                         //      = LochBreitePx / Breite
    h: 0.554,                         //      = LochHöhePx / Höhe
    circular: true,                   // nur Hinweis; Form kommt aus PNG-Alpha
  },
  irisScale: 1.05,                    // optional Zoom der Iris im Slot
  irisResizeMode: 'contain',          // oder 'cover'
  overlayImage: require('@/assets/art-templates/dein-name.png'),
},
```

### `aspectRatio` (wichtig gegen Verzerrung)

- Immer **diese** Datei messen: `Breite / Höhe` (z. B. `2129 / 2048`).
- **Nie** Werte von einem anderen Template kopieren.

### `irisHole`

1. In Photoshop/Figma Rechteck um das **transparente Loch** ziehen.  
2. Werte **durch Bildbreite bzw. -höhe teilen** → 0–1.  
3. Loch in der PNG und `irisHole` sollen übereinstimmen, sonst sitzt die Iris falsch.

Tipp: Bei kreisrundem Loch in px oft `w_px ≈ h_px`; in normierten Werten kann `w ≠ h` sein, wenn die PNG nicht quadratisch ist — das ist korrekt.

### `tintWithIrisColor` / `multiColorTint`

- `tintWithIrisColor: true` → Graustufen-Overlay einfärben (eine Durchschnittsfarbe).
- zusätzlich `multiColorTint: true` → Farben der Iris **örtlich** übernehmen (Winkel ums Loch + Innen/Außen-Ring). Gut für mehrfarbige / Hazel-Augen.
- Flags weglassen → farbiges Overlay unverändert (Blue Galaxy bleibt blau).

### `colorFamilies`

`brown` | `blue` | `green` | `hazel` | `gray` | `amber` | **`any`**.  
Shop-Filter „Passend zur Farbe“ blendet Vorlagen ohne Treffer aus — dann **„Alle Templates“** nutzen.

---

## Skalierung der Iris

| Option | Bedeutung |
|--------|-----------|
| `irisResizeMode: 'contain'` | Ganzes Iris-Bild sichtbar |
| `irisResizeMode: 'cover'` | Slot gefüllt, ggf. Ränder abgeschnitten |
| `irisScale` | Extra-Zoom (1 = normal) |
| `irisSlotBackground` | Farbe hinter der Iris, Standard `#000000` |
