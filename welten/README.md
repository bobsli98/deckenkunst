# Welten

Zwei Seitenprojekte neben Deckenkunst: begehbare, endlos prozedural erzeugte 3D-Landschaften, jede als eine einzige HTML-Datei.
Sie teilen keinen Code mit der Deckenkunst-App und ändern an ihr nichts.

| Welt | Datei | Worum es geht |
|------|-------|---------------|
| 花霞 **Hanagasumi** | [`hanagasumi/hanagasumi.html`](hanagasumi/hanagasumi.html) | Japan: Tempel, Pagoden, Torii, Kirschblüten, Bambushaine, Flüsse und Brücken, Ameisenbären mit Strohhut. Tag-Nacht-Zyklus und vier Jahreszeiten. |
| **Noctiluca** | [`noctiluca/noctiluca.html`](noctiluca/noctiluca.html) | Ein fremder Mond unter einem Ringplaneten: Schirmbäume, Glaskorallen, schwebende Felsen mit Wasserfällen, Sinterterrassen, Ringtore einer verschwundenen Kultur, Himmelswale. Jeden Mittag eine Finsternis, nachts leuchtet alles. Vier Zyklen: Blüte, Glut, Nebel, Frost. |

## Starten

Die HTML-Datei in Chrome oder Edge öffnen (braucht WebGL 2, kein Internet). Auf **Erkunden** klicken, dann:

- **W A S D** + Maus bewegen und umsehen, **Shift** schneller, **Leertaste / C** steigen und sinken
- **F** Gehen ↔ Fliegen, **G** automatische Kamerafahrt
- **1–4** Tageszeit (Noctiluca: **5** Mittagsfinsternis), **Q / E** Zeit zurück / vor
- **J** nächste Jahreszeit bzw. nächster Zyklus, **R** neue Welt, **K** Grafikqualität, **M** Ton, **N** Musik, **H** alle Tasten

Eine bestimmte Welt öffnest du mit `?seed=Nummer` hinter dem Dateinamen; die zuletzt erzeugte merkt sich der Browser.

## Bauen

Der Quellcode liegt jeweils in `src/` (three.js, mit esbuild in eine Datei gebündelt):

```
cd welten/noctiluca      # oder welten/hanagasumi
npm ci
npm run build            # -> dist/index.html, danach nach noctiluca.html kopieren
```

`tools/shots.mjs` und `tools/play2.mjs` sind Testskripte mit Playwright (Headless-Chromium). Details zum Aufbau von Noctiluca stehen in [`noctiluca/UMSETZUNG.md`](noctiluca/UMSETZUNG.md), die Idee in [`noctiluca/KONZEPT.md`](noctiluca/KONZEPT.md).

## Bekannte Grenzen

Getestet nur im Software-Renderer (Standbilder und Tastenabläufe). Nicht geprüft: Bildrate auf echter Grafikkarte, Ton und Musik, Touch-Bedienung. Beim Gehen gibt es keine Kollision mit Bäumen und Gebäuden.
