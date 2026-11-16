# Noctiluca – technischer Stand

Einzeldatei-Welt auf dem Gerüst von Hanagasumi v4 (three.js r187, mit esbuild in eine HTML-Datei gebündelt). Liegt als Seitenprojekt unter `welten/noctiluca` im deckenkunst-Repo; die gebaute Datei `noctiluca.html` wird mit eingecheckt.

## Bauen und Testen

```
npm ci && node build.mjs    # -> dist/index.html, dann nach noctiluca.html kopieren
node build.mjs --dev                                           # ohne Minify
node tools/shots.mjs shots/x_ "" 1100 620 '[{"t":16,"name":"a","pos":[x,y,z],"yaw":0,"pitch":0}]'
```

Headless-Chromium mit SwiftShader, 1–3 s pro Bild. States: `pos, ground, yaw, pitch, t, season (0 Blüte, 1 Glut, 2 Nebel, 3 Frost), mode, settle, name, js`. Am Ende des Protokolls stehen Konsolenfehler – immer prüfen, ein Shader-Fehler lässt ein Material stillschweigend verschwinden. `tools/play2.mjs` testet Start, Taste R und Gehen. `tools/find*.mjs` und `map.mjs` sind veraltet.

Test-Hooks: `__set`, `__stats`, `__player`, `__sky`, `__world`, `__birds`, `__skyland`, `__forceOrigin(sx, sz)`, `__newWorld(seed)`.

## Aufbau (src/)

- `world.js` – Höhe (Kontinente, Hügel, Gebirge, Tafelberge, Sinterterrassen mit `tz`/`pool`), Flüsse, Sites (0 Observatorium, 1 Ringtor-Prozession, 2 Steinkreis, 3 Ringtor auf Kuppe), Brücken, Wasser-Ringtore, `floatAt` (schwebende Felsen), `markAt` (Bögen, Kristallnadeln), `volcanoAt` (Berge mit Kristallkrone), Vegetation. Arten: `SP = SCHIRM, KORALLE, PILZ, QUASTE, KOLBEN, FARN, ROCK, CRYSTAL`.
- `sky.js`, `shaders.js` – Atmosphäre (türkis, pfirsichfarbener Dunst), Ringplanet fix am Südhimmel (`PLANET_R`, Phase aus Sonnenrichtung, Ringschatten), zwei Monde, Finsternis (`sky.eclipse`), Polarlicht, Nebel. `U.uGlow = max(Nacht, Finsternis)` treibt alles Leuchten. `U.uTrail` + `trailGlow()` = Lichtspur.
- `terrain.js` – Bodenmaterial (aux: Wald, Hain-Zone / −Sinter, Pflaster, Schilf / −Becken), Wasser mit Leuchtplankton.
- `flora.js` – Texturen, Pflanzen-Builder mit Leuchtgewicht pro Vertex (`aGlow`), `foliageMaterial(tex, key, bend, trans, alphaTest, glow)`, `SEASON_LOOK` für die vier Zyklen, Gras mit Leuchtspur.
- `structures.js` – Ringtor, Obelisk, Schwebestein, Steinkreis, Sanktum, Armillarsphäre, Turm, Rotunde, Brücke; `checkGates()` meldet Durchschreiten an `ctx.onGate`.
- `skyland.js` – schwebende Felsen (instanziert, 6 Varianten, landbar über `groundAt(x, z, h, y)`), Wasserfälle, Bäume darauf, Felsbögen, Kristallnadeln, Kristallkronen.
- `fauna.js` – Stelzer und Ameisenbär (gleiche Gangart, `kinds`), Glashelm, Partikel je Zyklus, Leuchtschwärme, Himmelswale (`Birds`).
- `audio.js` – Wind, Wasser, Pads und Glastöne, Rufe, Walgesang, Kristallklingen, Torklang.
- `main.js`, `ui.js`, `post.js`, `noise.js`, `textures.js`, `worker.js` wie zuvor.

Jedes System hat `update`, `clear()` (neue Welt) und `rebase(sx, sz)` (Ursprung verschieben).

## Regeln, die man nicht brechen sollte

- Alle Rastergrössen teilen `ORIGIN_STEP = 40000`; Hashes laufen auf absoluten Zellindizes; Rauschen wird an absoluten Koordinaten abgetastet.
- Shader-Texturskalen mit höchstens 4 Nachkommastellen (sonst springt die Textur beim Verschieben des Ursprungs).
- `geometryViewDir` existiert erst ab `lights_fragment_begin`; davor `normalize(vViewPosition)` verwenden.
- Normalen nie aus Nulllängen-Vektoren. Fade im Depth-Material aus.
- Vegetation und Gras über `siteWeight` aus Wegen und Plätzen halten.

## Nie verifiziert

Bildrate auf echter Grafikkarte, Klang, Touch-Bedienung. Keine Kollision mit Bäumen, Bauten oder der Unterseite schwebender Felsen.
