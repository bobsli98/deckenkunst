/* Deckenkunst – Kern: Szenen-Register, Zufall, Farben, Simplex-Noise */
(function () {
  'use strict';
  const DK = (window.DK = window.DK || {});

  DK.scenes = [];
  DK.register = (scene) => DK.scenes.push(scene);

  DK.TAU = Math.PI * 2;
  DK.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  DK.randInt = (a, b) => Math.floor(DK.rand(a, b + 1));
  DK.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  DK.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  DK.lerp = (a, b, t) => a + (b - a) * t;
  DK.smooth = (t) => t * t * (3 - 2 * t);
  DK.wrap01 = (h) => ((h % 1) + 1) % 1;
  DK.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Farben: h, s, l, a jeweils 0..1
  DK.hsl = (h, s, l, a = 1) =>
    `hsla(${(DK.wrap01(h) * 360).toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

  DK.hsv2rgb = (h, s, v) => {
    h = DK.wrap01(h) * 6;
    const i = Math.floor(h), f = h - i;
    const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    switch (i % 6) {
      case 0: return [v, t, p];
      case 1: return [q, v, p];
      case 2: return [p, v, t];
      case 3: return [p, q, v];
      case 4: return [t, p, v];
      default: return [v, p, q];
    }
  };

  // Weicher, radialer Lichtpunkt als Sprite (gecacht)
  const glowCache = new Map();
  DK.glowSprite = (h, s, l = 0.6, size = 128) => {
    const key = `${Math.round(DK.wrap01(h) * 72)}_${Math.round(s * 10)}_${Math.round(l * 10)}_${size}`;
    let c = glowCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, DK.hsl(h, s * 0.5, Math.min(1, l + 0.35), 1));
    grd.addColorStop(0.18, DK.hsl(h, s, l, 0.55));
    grd.addColorStop(0.5, DK.hsl(h, s, l * 0.8, 0.14));
    grd.addColorStop(1, DK.hsl(h, s, l * 0.5, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    glowCache.set(key, c);
    return c;
  };

  // 3D-Simplex-Noise (nach Stefan Gustavson), Rückgabe ca. -1..1
  DK.makeNoise = function (seed = Math.random()) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = Math.floor(seed * 2147483646) + 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const gr = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1,
      1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
    const F3 = 1 / 3, G3 = 1 / 6;

    return function noise3(x, y, z) {
      const sk = (x + y + z) * F3;
      const i = Math.floor(x + sk), j = Math.floor(y + sk), k = Math.floor(z + sk);
      const t = (i + j + k) * G3;
      const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      let n = 0, tt, g;
      tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (tt > 0) { g = (perm[ii + perm[jj + perm[kk]]] % 12) * 3; tt *= tt; n += tt * tt * (gr[g] * x0 + gr[g + 1] * y0 + gr[g + 2] * z0); }
      tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (tt > 0) { g = (perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12) * 3; tt *= tt; n += tt * tt * (gr[g] * x1 + gr[g + 1] * y1 + gr[g + 2] * z1); }
      tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (tt > 0) { g = (perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12) * 3; tt *= tt; n += tt * tt * (gr[g] * x2 + gr[g + 1] * y2 + gr[g + 2] * z2); }
      tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (tt > 0) { g = (perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12) * 3; tt *= tt; n += tt * tt * (gr[g] * x3 + gr[g + 1] * y3 + gr[g + 2] * z3); }
      return 32 * n;
    };
  };
})();
