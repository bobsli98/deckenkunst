/* Stimmungen: welche Szenen zu welcher Laune passen. Eine Szene darf in mehreren Stimmungen vorkommen. */
DK.GENRES = [
  {
    id: 'alle', name: 'Überrasch mich', glyph: '✦', desc: 'Alle Welten, bunt gemischt',
    a: '#7a5cff', b: '#ff6fb1', scenes: null,
  },
  {
    id: 'ruhig', name: 'Zur Ruhe kommen', glyph: '☾', desc: 'Langsam und sanft – zum Einschlafen',
    a: '#3b4cca', b: '#8fb8ff',
    scenes: ['gluehwuermchen', 'sternspuren', 'hanami', 'enso', 'quallen', 'aurora', 'galaxie', 'kaustik',
      'harmonograph', 'lavalampe', 'bambushain', 'wolkenhimmel', 'schneefall', 'regenteich', 'glasdach', 'laternenfluss', 'kraniche'],
  },
  {
    id: 'regen', name: 'Regenwetter', glyph: '☂', desc: 'Glasdach, Teich, Gewitter',
    a: '#2d5f7a', b: '#9fd4ff', scenes: ['glasdach', 'regenteich', 'kaustik', 'quallen', 'laternenfluss'],
  },
  {
    id: 'winter', name: 'Winter & Kälte', glyph: '❄', desc: 'Schneefall, Eisblumen, Polarnacht',
    a: '#5a8fd6', b: '#e2f1ff', scenes: ['schneefall', 'eisblumen', 'aurora', 'sternspuren', 'galaxie'],
  },
  {
    id: 'sommer', name: 'Sommer & Wärme', glyph: '☀', desc: 'Wolken, Sonnenflecken, laue Nächte',
    a: '#ff9a3c', b: '#ffe27a',
    scenes: ['wolkenhimmel', 'komorebi', 'gluehwuermchen', 'feuerwerk', 'bluetenmeer', 'kaustik', 'koi', 'lavalampe'],
  },
  {
    id: 'japan', name: 'Japan', glyph: '和', desc: 'Kirschblüten, Bambus, Tusche, Laternen',
    a: '#d23c4b', b: '#ffc4d0',
    scenes: ['hanami', 'bambushain', 'komorebi', 'enso', 'koi', 'bluetenmeer', 'feuerwerk', 'regenteich', 'laternenfluss', 'kraniche'],
  },
  {
    id: 'kosmos', name: 'Weltall', glyph: '✶', desc: 'Galaxien, Nebel, Sternspuren',
    a: '#5b2a9e', b: '#58c7ff', scenes: ['galaxie', 'nebel', 'sternspuren', 'wurmloch', 'aurora', 'attraktor'],
  },
  {
    id: 'leben', name: 'Lebendige Natur', glyph: '❦', desc: 'Schwärme, Quallen, Schleimpilze',
    a: '#2f9e6a', b: '#b8f28a',
    scenes: ['schwarm', 'quallen', 'gluehwuermchen', 'schleimpilz', 'reaktion', 'koi', 'lebenszellen', 'kraniche'],
  },
  {
    id: 'abstrakt', name: 'Abstrakt & Geometrisch', glyph: '◈', desc: 'Muster, Fraktale, Mathematik',
    a: '#00a6a6', b: '#f5f5a0',
    scenes: ['kaleidoskop', 'interferenz', 'harmonograph', 'attraktor', 'lebenszellen', 'reaktion', 'seide', 'lavalampe', 'nebel', 'zeichenregen'],
  },
  {
    id: 'party', name: 'Party', glyph: '♫', desc: 'Wild und laut – am besten mit Mikrofon (M)',
    a: '#ff2e88', b: '#ffd23f',
    scenes: ['feuerwerk', 'wurmloch', 'kaleidoskop', 'interferenz', 'seide', 'schwarm', 'lavalampe', 'attraktor', 'zeichenregen'],
  },
];
