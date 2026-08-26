# Art-Template Overlays

PNG mit **transparentem Bereich** für die Iris (Rest: Rahmen, Deko, Text).

Für den dynamischen Iris-Tint: Overlay idealerweise **Graustufen** (weiß/grau/schwarz + Alpha).
Die App färbt das Template zur Laufzeit mit der gemittelten Iris-Farbe (Vorschau + Druck).

## Datei anlegen (wichtig!)

1. PNG nach `irisart-app/assets/art-templates/` legen (z. B. `mein-template.png`)
2. Eintrag in `lib/artTemplates.ts` mit `require('@/assets/art-templates/mein-template.png')`
3. **PNG + `artTemplates.ts` committen und pushen** — ohne Git-Push fehlt die Datei auf Hostinger und die Vorlage erscheint nicht
4. Hostinger neu deployen / App neu bauen

## Eintrag in `artTemplates.ts`

`aspectRatio` = **exakt** `Pixelbreite ÷ Pixelhöhe` der PNG (Datei-Infos in Photoshop/Explorer).
Falsche Werte (z. B. von einem anderen Template kopiert) **verzerren** Loch und Partikel.

```ts
{
  id: 'mein-template',
  title: 'Mein Template',
  aspectRatio: 2129 / 2048, // exakt Breite ÷ Höhe dieser PNG
  colorFamilies: ['any'],   // Graustufen-Tint: immer anzeigen
  irisHole: { x: 0.24, y: 0.22, w: 0.53, h: 0.55 },
  irisScale: 1.05,
  overlayImage: require('@/assets/art-templates/mein-template.png'),
},
```

`colorFamilies`: `brown` | `blue` | `green` | `hazel` | `gray` | `amber` | **`any`**.  
Bei farbgefilterten Vorlagen ohne Treffer: im Shop **„Alle Templates“** wählen.

## Loch / Iris — keine App-Maske

- Die Iris-Textur liegt als ganzes Bild in einem rechteckigen Slot unter der PNG.
- Sichtbare Form = nur die **Transparenz** der PNG.
- `irisHole`: Bounding-Box des Lochs, normiert 0–1.

## Skalierung

| Option | Bedeutung |
|--------|-----------|
| `irisResizeMode: 'contain'` (Standard) | Ganzes Iris-Bild sichtbar |
| `irisResizeMode: 'cover'` | Slot gefüllt, ggf. Ränder abgeschnitten |
| `irisScale` | Extra-Zoom (1 = normal) |
| `irisSlotBackground` | Farbe hinter der Iris, Standard `#000000` |
