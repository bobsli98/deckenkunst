// Procedural tileable noise textures (no external assets).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function periodicPerlin(seed) {
  const rnd = mulberry32(seed);
  const P = 256;
  const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, period) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const xa = ((x0 % period) + period) % period, xb = (xa + 1) % period;
    const ya = ((y0 % period) + period) % period, yb = (ya + 1) % period;
    const d = (ix, iy, dx, dy) => { const k = (iy * 37 + ix * 101 + period * 7) % (P * P); return gx[k] * dx + gy[k] * dy; };
    const u = fade(fx), v = fade(fy);
    const a = d(xa, ya, fx, fy), b = d(xb, ya, fx - 1, fy), c = d(xa, yb, fx, fy - 1), e = d(xb, yb, fx - 1, fy - 1);
    return (a + (b - a) * u) + ((c + (e - c) * u) - (a + (b - a) * u)) * v;
  };
}

function fbmField(N, basePeriod, oct, seed, gain = 0.5) {
  const pn = periodicPerlin(seed);
  const out = new Float32Array(N * N);
  let mn = 1e9, mx = -1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0, a = 1, per = basePeriod;
    for (let o = 0; o < oct; o++) { s += a * pn(i / N * per + o * 0.37, j / N * per + o * 0.71, per); a *= gain; per *= 2; }
    out[j * N + i] = s; if (s < mn) mn = s; if (s > mx) mx = s;
  }
  for (let i = 0; i < N * N; i++) out[i] = (out[i] - mn) / (mx - mn);
  return out;
}
// remap so the histogram is roughly uniform (keeps thresholds predictable)
function equalize(f) {
  const idx = Array.from(f.keys()).sort((a, b) => f[a] - f[b]);
  const o = new Float32Array(f.length);
  for (let r = 0; r < idx.length; r++) o[idx[r]] = r / (idx.length - 1);
  for (let i = 0; i < f.length; i++) f[i] = f[i] * 0.35 + o[i] * 0.65;
  return f;
}

export function makeNoiseTextures() {
  const N = 256;
  const r = equalize(fbmField(N, 4, 6, 11)), g = equalize(fbmField(N, 6, 5, 23)), b = equalize(fbmField(N, 10, 4, 37)), a = equalize(fbmField(N, 3, 7, 51, 0.6));
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { d[i * 4] = r[i] * 255; d[i * 4 + 1] = g[i] * 255; d[i * 4 + 2] = b[i] * 255; d[i * 4 + 3] = a[i] * 255; }
  const noise = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.minFilter = THREE.LinearMipmapLinearFilter; noise.magFilter = THREE.LinearFilter;
  noise.generateMipmaps = true; noise.anisotropy = 4; noise.needsUpdate = true;

  // detail normal: RG = slope, B = height, A = second height
  const h1 = fbmField(N, 5, 6, 71, 0.55), h2 = fbmField(N, 9, 5, 83, 0.6);
  const dn = new Uint8Array(N * N * 4);
  const at = (f, i, j) => f[((j + N) % N) * N + ((i + N) % N)];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const sx = (at(h1, i + 1, j) - at(h1, i - 1, j)) * 6 + (at(h2, i + 1, j) - at(h2, i - 1, j)) * 5;
    const sy = (at(h1, i, j + 1) - at(h1, i, j - 1)) * 6 + (at(h2, i, j + 1) - at(h2, i, j - 1)) * 5;
    const k = (j * N + i) * 4;
    dn[k] = Math.max(0, Math.min(255, 127.5 + sx * 127.5)); dn[k + 1] = Math.max(0, Math.min(255, 127.5 + sy * 127.5));
    dn[k + 2] = h1[j * N + i] * 255; dn[k + 3] = h2[j * N + i] * 255;
  }
  const detail = new THREE.DataTexture(dn, N, N, THREE.RGBAFormat);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.minFilter = THREE.LinearMipmapLinearFilter; detail.magFilter = THREE.LinearFilter;
  detail.generateMipmaps = true; detail.anisotropy = 8; detail.needsUpdate = true;
  return { noise, detail };
}
