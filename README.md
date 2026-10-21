# Deckenkunst

Generative Welten für die Zimmerdecke: 33 Szenen in 10 Stimmungen, die sich alle paar Minuten weich ineinander überblenden.
Jede Szene würfelt bei jedem Auftritt ihre Parameter neu aus (Farben, Tageszeit, Formen, Anzahl, Verhalten), deshalb sieht kein Abend aus wie der andere.

## Starten

`index.html` doppelklicken. Es braucht weder Installation noch Internet.
Am besten in Chrome oder Edge öffnen, dann **F** oder Doppelklick für Vollbild.

Beim Start fragt Deckenkunst **„Wonach ist dir heute?“** und zeigt dazu die Stimmungen als Karten.
Wählst du nichts aus, geht es nach 25 Sekunden mit der zuletzt gewählten Stimmung weiter, sodass der Beamer auch unbeaufsichtigt startet.
Mit **G** wechselst du die Stimmung jederzeit; die laufende Szene blendet dann weich in eine passende über.

## Stimmungen und Szenen

| Stimmung | Szenen |
|----------|--------|
| ✦ Überrasch mich | alle 33 |
| ☾ Zur Ruhe kommen | Glühwürmchen, Sternspuren, Hanami, Ensō, Tiefsee, Polarlicht, Galaxie, Unter Wasser, Harmonograph, Lavalampe, Bambushain, Wolkenhimmel, Schneefall, Regenteich, Glasdach, Laternenfluss, Kraniche |
| ☂ Regenwetter | Glasdach im Regen, Regenteich, Unter Wasser, Tiefsee, Laternenfluss |
| ❄ Winter & Kälte | Schneefall, Eisblumen, Polarlicht, Sternspuren, Galaxie |
| ☀ Sommer & Wärme | Wolkenhimmel, Komorebi, Glühwürmchen, Feuerwerk, Blütenmeer, Unter Wasser, Koi, Lavalampe |
| 和 Japan | Hanami bei Nacht, Bambushain, Komorebi, Ensō, Koi-Teich, Blütenmeer, Feuerwerk (Hanabi), Regenteich, Laternenfluss, Tausend Kraniche |
| ✶ Weltall | Galaxie, Sternennebel, Sternspuren, Wurmloch, Polarlicht, Seltsamer Attraktor |
| ❦ Lebendige Natur | Schwarm, Tiefsee, Glühwürmchen, Schleimpilz, Reaktion–Diffusion, Koi, Lebenszellen, Kraniche |
| ◈ Abstrakt & Geometrisch | Kaleidoskop, Interferenz, Harmonograph, Attraktor, Lebenszellen, Reaktion–Diffusion, Seidenstrom, Lavalampe, Sternennebel, Zeichenregen |
| ♫ Party | Feuerwerk, Wurmloch, Kaleidoskop, Interferenz, Seidenstrom, Schwarm, Lavalampe, Attraktor, Zeichenregen (am besten mit **M** fürs Mikrofon) |

Ein paar Highlights:

- **Glasdach im Regen:** Tropfen wirken als kleine Linsen und spiegeln den Himmel kopfüber. Sie wachsen zusammen, rinnen ab und wischen dabei den Beschlag weg. Als Variante gibt es ein Gewitter mit Blitzen.
- **Hanami bei Nacht:** der Blick von unten in eine Kirschbaumkrone mit Mond, fallenden Blütenblättern und Himmelslaternen, die in die Ferne steigen
- **Bambushain:** perspektivisch zum Himmel zusammenlaufende Halme, die sich im Wind wiegen. Windböen laufen rundherum durch den Hain.
- **Glühwürmchen:** pulsgekoppelte Oszillatoren, die sich wie in der Natur von selbst synchronisieren und danach wieder von vorn beginnen
- **Sternspuren:** eine Langzeitbelichtung des Himmels, die sich vor deinen Augen entwickelt, mit Sternschnuppen
- **Tausend Kraniche:** Origami-Kraniche als echte kleine 3D-Papiermodelle mit Flügelschlag
- **Eisblumen:** Frost wächst in 60°-Verzweigungen wie echtes Eis über die Dachluke und taut wieder ab

## Tasten

| Taste | Wirkung |
|-------|---------|
| Leertaste / → | nächste Szene (innerhalb der Stimmung) |
| ← | vorherige Szene |
| G | Stimmung wechseln |
| 1 – 0 | eine der ersten zehn Szenen direkt wählen (alle Szenen findest du in der Hilfe) |
| R | aktuelle Szene neu würfeln |
| L | Szene festhalten (kein automatischer Wechsel) |
| P | Pause |
| F / Doppelklick | Vollbild |
| + / − (oder ↑ / ↓) | Helligkeit |
| M | Mikrofon: Bässe und Lautstärke treiben die Szenen an |
| Q | Sparmodus ein/aus |
| T | Szenentitel ein/aus |
| I | Leistungsanzeige (fps, Auflösung, Restzeit) |
| H | Hilfe mit klickbarer Szenenliste |

Mit der Maus kannst du in fast jede Szene eingreifen: Blüten zerstreuen, Koi füttern, Laternen aussetzen, Feuerwerk zünden,
im Glasdach einen Blitz auslösen oder Glühwürmchen gemeinsam aufblitzen lassen.

## Schwache Geräte: der Sparmodus

Läuft Deckenkunst auf einem älteren Laptop oder Mini-PC, hilft der **Sparmodus** (Taste **Q**). Er
- rendert mit 60 % der Auflösung und begrenzt auf 30 Bilder pro Sekunde,
- halbiert die Zahl der Teilchen, Sterne und Agenten,
- blendet über Schwarz über, sodass nie zwei Szenen gleichzeitig gerechnet werden.

Ruckelt es dauerhaft, schaltet sich der Sparmodus **von selbst ein** und merkt sich das. Ausserdem senkt jede Szene ihre
Auflösung schrittweise, sobald die Bildrate einbricht. Mit **Q** kannst du jederzeit umschalten; die Wahl wird gespeichert.

## Einstellungen per Adresse

An die Adresse lassen sich Parameter anhängen, zum Beispiel `index.html?stimmung=ruhig&dauer=600&titel=0`:

- `stimmung=winter`: direkt mit dieser Stimmung starten, ohne Auswahl (`alle ruhig regen winter sommer japan kosmos leben abstrakt party`)
- `auswahl=0`: Startbildschirm überspringen und die zuletzt gewählte Stimmung nehmen
- `dauer=300`: Sekunden pro Szene (Standard 150, ±25 % Zufall)
- `fade=10`: Dauer der Überblendung in Sekunden (Standard 7)
- `titel=0`: Szenennamen ausblenden
- `spar=1` oder `spar=0`: Sparmodus erzwingen oder verbieten
- `szene=koi`: mit genau dieser Szene starten
- `nur=aurora,galaxie,koi`: nur diese Szenen zeigen

Zum Einschlafen eignet sich zum Beispiel `index.html?stimmung=ruhig&dauer=600&titel=0`, dazu die Helligkeit mit **−** herunterdrehen.

## Tipps für den Beamer

- **Schwarz ist kein Licht.** Die meisten Szenen leben auf schwarzem Grund, das wirkt an der Decke wie schwebendes Licht.
  Je besser der Schwarzwert des Beamers, desto magischer. LED- und Laser-Beamer sind dabei klar im Vorteil.
- Den Beamer **flach auf den Boden oder Nachttisch** legen und nach oben richten. Die Szenen haben kein Oben und Unten.
- Der Bildschirm bleibt dank „Wake Lock“ wach. Zur Sicherheit trotzdem in den Energieoptionen von Windows
  den Bildschirm-Timeout für den Beamer-Betrieb ausschalten.

## Eigene Szenen bauen

Jede Szene ist eine Datei in `js/scenes/`. Eine reine Shader-Szene braucht nur ein paar Zeilen:

```js
DK.shaderScene({
  id: 'meine', name: 'Meine Szene', sub: 'Untertitel',
  setup: () => ({ u_speed: DK.rand(0.5, 2) }),   // wird bei jedem Auftritt neu gewürfelt
  fs: `
uniform float u_speed;
void main() {
  vec2 uv = uvc();
  vec3 col = hsv2rgb(vec3(u_hue + length(uv) - u_time * 0.1 * u_speed, 0.8, 1.0));
  outColor = vec4(col * 0.5, 1.0);
}`,
});
```

Danach die Datei in `index.html` per `<script>` einbinden und die `id` in `js/stimmungen.js` einer oder mehreren Stimmungen zuordnen.
Für Canvas-2D- oder eigene WebGL-Szenen lohnt sich ein Blick in `koi.js` oder `reaktion.js`. Das Grundmuster ist immer
`DK.register({ id, name, type, create })`, wobei `create` ein Objekt mit `render(t, dt, env)` zurückgibt.
`env.q` ist die Qualitätsstufe (1 normal, 0.5 im Sparmodus), damit die Szene ihre Teilchenzahl anpassen kann.

`tools/server.ps1` ist ein Mini-Webserver, nur fürs Entwickeln. Im Alltag reicht der Doppelklick.

## Alles in einer Datei

`tools/build-single.ps1` baut `dist/deckenkunst.html`: eine einzige Datei (rund 220 KB), in der CSS und alle Skripte eingebettet sind.
Ideal für einen USB-Stick oder den Beamer-Laptop – kopieren, doppelklicken, fertig.

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-single.ps1
```

## Online stellen mit GitHub Pages

Deckenkunst ist eine rein statische Seite und braucht keinen Build-Schritt.
Im Repository unter **Settings → Pages** als Quelle **Deploy from a branch**, Branch `main`, Ordner `/ (root)` wählen.
Nach ein bis zwei Minuten läuft die Seite unter `https://<benutzername>.github.io/deckenkunst/`.
Über HTTPS funktionieren Mikrofon und Wachhalten zuverlässig, und die gespeicherten Einstellungen bleiben pro Gerät erhalten.
(Die Datei `.nojekyll` sorgt dafür, dass GitHub die Dateien unverändert ausliefert.)
Hinweis: Mit einem kostenlosen GitHub-Konto funktioniert Pages nur bei öffentlichen Repositories.
