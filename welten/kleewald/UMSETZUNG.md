# Kleewald – technischer Stand

Einzeldatei-Welt auf dem Gerüst von Noctiluca (three.js r187, mit esbuild in eine HTML-Datei gebündelt). Liegt unter `welten/kleewald`; die gebaute Datei `kleewald.html` wird mit eingecheckt. **Eine Einheit ist ein Millimeter.**

## Bauen und Testen

```
npm ci && node build.mjs    # -> dist/index.html, dann nach kleewald.html kopieren
node build.mjs --dev                                           # ohne Minify
node tools/shots.mjs shots/x_ "" 1100 620 '[{"t":16,"name":"a","pos":[x,y,z],"yaw":0,"pitch":0}]'
```

Headless-Chromium mit SwiftShader, 1–3 s pro Bild. States: `pos, ground, yaw, pitch, t, season (0 Frühling, 1 Sommer, 2 Herbst, 3 Winter), mode, settle, name, js`. Am Ende des Protokolls stehen Konsolenfehler – immer prüfen, ein Shader-Fehler lässt ein Material stillschweigend verschwinden. `tools/play2.mjs` testet Start, Taste R und Gehen. `tools/find*.mjs` und `map.mjs` sind veraltet.

Test-Hooks: `__set`, `__stats`, `__player`, `__sky`, `__world`, `__birds`, `__giant` (`__giant.start()` holt den Ameisenbären), `__giants`, `__forceOrigin(sx, sz)`, `__newWorld(seed)`. Bodennahe Ansichten im dichten Gras sind im Software-Renderer sehr langsam (Minuten pro Bild).

## Aufbau (src/)

- `world.js` – Höhe (Rasen, Steingärten, Rinnsale, Teiche, Kieswege, Wurzeln der echten Bäume), `veg()` mit Feldern lawn / clover / flower / moss / leaf, Sites (0 Ameisenhügel, 1 grosser Fund, 2 kleiner Fund, 3 Mini-Fund), Brücken (Streichholz, Zweig), Papierschiffchen (`waterToriiAt`), Landmarken `markAt` (0 Gartenschlauch, 1 Sonnenblumen), echte Bäume `volcanoAt` (kind 0 Laubbaum, 1 Fichte), `crownCover()`. Arten: `SP = GRAS, KLEE, LOEWE, BLUME, PILZ, BLATT, ROCK, ZWEIG`.
- `shaders.js`, `sky.js` – Erd-Atmosphäre, Wolken in echter Höhe (`CLOUD_H`), `uShade` = gefleckter Kronenschatten der vier nächsten Bäume, `uDew` = Morgentau.
- `post.js` – Makro-Tiefenschärfe (Fokus = Mitte des Bildes, Blende sinkt mit der Flughöhe), Bloom, Strahlen, ACES.
- `terrain.js` – Boden (Humus, Streu, Moos, Laub, Kies mit Einzelkörnern, Schlamm), Wasser.
- `flora.js` – Halme als gefaltete Bänder, Klee, Löwenzahn (Blüte und Pusteblume wechseln über `aSwap`/`uSwap`), Gänseblümchen, Pilze, Laubhaufen, Kiesel, Zweige; Tau-Glitzern; `Grass` = Moos und Keimlinge.
- `structures.js` – Fundstücke als Drehkörper und Röhren (`lathe`, `pipe`), Materialien paint / gloss (Porzellan, Lack) / metal / glass; begehbare Flächen (`walk`, `domes`).
- `fauna.js` – Ameisen, Marienkäfer, Schnecken (`Fauna`), der Riese (`Giant`), Partikel je Jahreszeit, fliegende Insekten (`Birds`).
- `giants.js` – echte Bäume, Gartenschlauch, Sonnenblumen.
- `audio.js` – Spieluhr, Wind, Wasser, Grashüpfer, Grillen, Hummel, ferne Vögel, Rasenmäher, Schritte des Riesen.

Jedes System hat `update`, `clear()` (neue Welt) und `rebase(sx, sz)` (Ursprung verschieben).

## Regeln, die man nicht brechen sollte

- Alle Rastergrössen teilen `ORIGIN_STEP = 40000`; Hashes laufen auf absoluten Zellindizes; Rauschen wird an absoluten Koordinaten abgetastet.
- Shader-Texturskalen mit höchstens 4 Nachkommastellen (sonst springt die Textur beim Verschieben des Ursprungs).
- `geometryViewDir` existiert erst ab `lights_fragment_begin`; davor `normalize(vViewPosition)` verwenden.
- Normalen nie aus Nulllängen-Vektoren. Fade im Depth-Material aus.
- Vegetation und Gras über `siteWeight` aus Wegen und Plätzen halten.

## Nie verifiziert

Bildrate auf echter Grafikkarte, Klang, Touch-Bedienung. Keine Kollision mit Bäumen, Bauten oder der Unterseite schwebender Felsen.
