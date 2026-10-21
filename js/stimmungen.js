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
      'harmonograph', 'lavalampe', 'bambushain', 'wolkenhimmel', 'schneefall', 'regenteich', 'glasdach', 'laternenfluss',
      'kraniche', 'pusteblume', 'sternbilder', 'ozeanunten', 'biolumineszenz', 'tempel'],
  },
  {
    id: 'regen', name: 'Regenwetter', glyph: '☂', desc: 'Glasdach, Tempel, Neon im Regen',
    a: '#2d5f7a', b: '#9fd4ff', scenes: ['glasdach', 'regenteich', 'tempel', 'neonnacht', 'kaustik', 'quallen', 'laternenfluss'],
  },
  {
    id: 'winter', name: 'Winter & Kälte', glyph: '❄', desc: 'Schneefall, Eisblumen, Polarnacht',
    a: '#5a8fd6', b: '#e2f1ff', scenes: ['schneefall', 'eisblumen', 'aurora', 'sternspuren', 'galaxie', 'sternbilder'],
  },
  {
    id: 'sommer', name: 'Sommer & Wärme', glyph: '☀', desc: 'Wolken, Falter, laue Nächte',
    a: '#ff9a3c', b: '#ffe27a',
    scenes: ['wolkenhimmel', 'komorebi', 'gluehwuermchen', 'feuerwerk', 'bluetenmeer', 'kaustik', 'koi', 'lavalampe',
      'pusteblume', 'schmetterlinge', 'biolumineszenz'],
  },
  {
    id: 'meer', name: 'Meer & Küste', glyph: '≋', desc: 'Leuchtende Wellen, Blick von unten',
    a: '#0e7c9b', b: '#7ff0e0', scenes: ['biolumineszenz', 'ozeanunten', 'kaustik', 'quallen', 'koi', 'regenteich', 'laternenfluss'],
  },
  {
    id: 'japan', name: 'Japan', glyph: '和', desc: 'Kirschblüten, Tempel, Neon-Gassen',
    a: '#d23c4b', b: '#ffc4d0',
    scenes: ['hanami', 'bambushain', 'komorebi', 'enso', 'koi', 'bluetenmeer', 'feuerwerk', 'regenteich', 'laternenfluss',
      'kraniche', 'neonnacht', 'tempel'],
  },
  {
    id: 'kosmos', name: 'Weltall', glyph: '✶', desc: 'Galaxien, Sternbilder, Warp',
    a: '#5b2a9e', b: '#58c7ff', scenes: ['galaxie', 'nebel', 'sternspuren', 'wurmloch', 'aurora', 'attraktor', 'sternbilder', 'sternenflug'],
  },
  {
    id: 'leben', name: 'Lebendige Natur', glyph: '❦', desc: 'Schwärme, Falter, Schleimpilze',
    a: '#2f9e6a', b: '#b8f28a',
    scenes: ['schwarm', 'quallen', 'gluehwuermchen', 'schleimpilz', 'reaktion', 'koi', 'lebenszellen', 'kraniche', 'schmetterlinge', 'pusteblume'],
  },
  {
    id: 'abstrakt', name: 'Abstrakt & Geometrisch', glyph: '◈', desc: 'Muster, Fraktale, Mathematik',
    a: '#00a6a6', b: '#f5f5a0',
    scenes: ['kaleidoskop', 'interferenz', 'harmonograph', 'attraktor', 'lebenszellen', 'reaktion', 'seide', 'lavalampe', 'nebel',
      'zeichenregen', 'oszilloskop', 'mystify'],
  },
  {
    id: 'retro', name: 'Retro & Bildschirmschoner', glyph: '▣', desc: 'Synthwave, Mystify, DVD-Logo',
    a: '#ff3cac', b: '#2b86c5', scenes: ['synthwave', 'oszilloskop', 'mystify', 'sternenflug', 'dvdlogo', 'zeichenregen', 'lebenszellen'],
  },
  {
    id: 'party', name: 'Party', glyph: '♫', desc: 'Wild und laut – am besten mit Mikrofon (M)',
    a: '#ff2e88', b: '#ffd23f',
    scenes: ['feuerwerk', 'wurmloch', 'kaleidoskop', 'interferenz', 'seide', 'schwarm', 'lavalampe', 'attraktor', 'zeichenregen',
      'synthwave', 'oszilloskop', 'sternenflug', 'neonnacht'],
  },
];
