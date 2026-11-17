// Deterministic world definition for a garden seen from 3 mm tall. One unit is one millimetre.
// Height field (lawn, rockery, rivulets, ponds, gravel paths, roots of the real trees), sites (ant hills and
// lost objects), bridges (twigs, matches), paper boats, landmarks, vegetation fields and the worker generators.
import { makeNoise, fbm, ridged, hash2, clamp, lerp, smoothstep, mulberry32 } from './noise.js';

// The engine works in local coordinates around a floating origin. The origin only ever moves in
// steps of ORIGIN_STEP, and every grid below divides that step, so cell indices shift by whole numbers.
export const ORIGIN_STEP = 40000;
export const SITE_CELL = 500;
export const MINI_CELL = 320;
export const VOLC_CELL = 20000;
export const BRIDGE_CELL = 400;
export const TORII_CELL = 800;
export const VEG_CELL = 125;
export const GRASS_CELL = 20;
export const MARK_CELL = 800;

// species ids
// grass tuft, clover, dandelion, daisy, mushroom, fallen leaf, pebble, twig
export const SP = { GRAS: 0, KLEE: 1, LOEWE: 2, BLUME: 3, PILZ: 4, BLATT: 5, ROCK: 6, ZWEIG: 7, COUNT: 8 };

export function createWorld(seed) {
  const nW = makeNoise(seed * 13 + 1), nC = makeNoise(seed * 13 + 2), nH = makeNoise(seed * 13 + 3);
  const nM = makeNoise(seed * 13 + 4), nR = makeNoise(seed * 13 + 5), nRiv = makeNoise(seed * 13 + 6);
  const nD = makeNoise(seed * 13 + 7), nF = makeNoise(seed * 13 + 8), nS = makeNoise(seed * 13 + 9);
  const nB = makeNoise(seed * 13 + 10), nP = makeNoise(seed * 13 + 11);
  const H = (i, j, k) => hash2(i + seed * 7919, j - seed * 104729, k);
  const key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  // floating origin: local position + (ox, oz) = absolute position (kept in float64 here)
  let ox = 0, oz = 0;
  function setOrigin(nx, nz) {
    ox = nx; oz = nz;
    volcCache.clear(); siteCache.clear(); miniCache.clear(); bridgeCache.clear(); toriiCache.clear(); markCache.clear();
    vLastI = 1e9; vLastJ = 1e9;
  }

  // ---------------------------------------------------------------- the real trees (each a mountain at this scale)
  const volcCache = new Map();
  function volcanoAt(ci, cj) {
    const k = key(ci, cj);
    let v = volcCache.get(k);
    if (v !== undefined) return v;
    const hi = ci + ox / VOLC_CELL, hj = cj + oz / VOLC_CELL; // absolute cell
    const mk = (x, z) => ({
      x, z, rc: 230 + 220 * H(hi, hj, 6), H: 9000 + 7000 * H(hi, hj, 4), L: 4200 + 2600 * H(hi, hj, 5),
      kind: H(hi, hj, 7) < 0.55 ? 0 : 1, nr: 5 + Math.floor(H(hi, hj, 8) * 4), ph: H(hi, hj, 9) * 6.28, id: key(hi, hj),
    });
    if (hi === 0 && hj === -1) v = mk(1800 - ox, -7400 - oz);
    else if (H(hi, hj, 1) < 0.62 && !(hi === 0 && hj === 0)) v = mk((ci + 0.25 + 0.5 * H(hi, hj, 2)) * VOLC_CELL, (cj + 0.25 + 0.5 * H(hi, hj, 3)) * VOLC_CELL);
    else v = null;
    volcCache.set(k, v);
    return v;
  }
  let vLastI = 1e9, vLastJ = 1e9, vList = [];
  function nearTrees(x, z) {
    const ci = Math.floor(x / VOLC_CELL), cj = Math.floor(z / VOLC_CELL);
    if (ci !== vLastI || cj !== vLastJ) {
      vLastI = ci; vLastJ = cj; vList = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const v = volcanoAt(ci + a, cj + b); if (v) vList.push(v); }
    }
    return vList;
  }
  // root flare: buttress roots run out from the trunk and dive into the lawn
  function volcanoH(x, z) {
    const list = nearTrees(x, z);
    let h = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i], dx = x - v.x, dz = z - v.z, d2 = dx * dx + dz * dz;
      if (d2 > 9e6) continue;
      const d = Math.sqrt(d2), ang = Math.atan2(dz, dx);
      const ridge = Math.pow(Math.max(0, Math.cos(ang * v.nr + v.ph + 0.6 * nP(ang * 2.0, d / 700))), 3);
      const out = Math.max(d - v.rc * 0.85, 0);
      const flare = v.rc * 0.62 * Math.exp(-out / (v.rc * (0.55 + 1.6 * ridge)));
      h += flare * (0.25 + 0.75 * ridge) + 30 * Math.exp(-out / 900);
    }
    return h;
  }
  // how much of the sky above a point is covered by a crown (leaf litter, moss, shade)
  function crownCover(x, z) {
    let c = 0;
    for (const v of nearTrees(x, z)) c = Math.max(c, 1 - smoothstep(v.L * 0.55, v.L * 1.05, Math.hypot(x - v.x, z - v.z)));
    return c;
  }

  // ---------------------------------------------------------------- base terrain
  const T = { h: 0, rr: 0, c: 0, hv: 0, a: 0, path: 0, len: 0 };
  function riverSigned(xl, zl) {
    const x = xl + ox, z = zl + oz;
    const wx = x + 110 * nW(x * 0.0011, z * 0.0011), wz = z + 110 * nW(x * 0.0011 + 53.1, z * 0.0011 - 17.7);
    const rx = wx + 38 * nW(x * 0.0043 + 9.1, z * 0.0043), rz = wz + 38 * nW(x * 0.0043 - 4.4, z * 0.0043 + 7.7);
    return nRiv(rx / 1500, rz / 1500);
  }
  function terrain(xl, zl, o) {
    const x = xl + ox, z = zl + oz; // noise is sampled at absolute coordinates
    const wx = x + 110 * nW(x * 0.0011, z * 0.0011), wz = z + 110 * nW(x * 0.0011 + 53.1, z * 0.0011 - 17.7);
    // garden ponds where the broad field dips, lawn everywhere else
    const c = fbm(nC, wx / 5200, wz / 5200, 3) + 0.32;
    const land = smoothstep(-0.30, -0.10, c);
    const inland = smoothstep(-0.10, 0.45, c);
    const hillN = fbm(nH, wx / 640, wz / 640, 4) * 0.5 + 0.5;
    let h = -26 + land * (28.5 + hillN * hillN * (14 + 60 * inland));
    // rockeries: heaps of real stones, each a cliff
    const mm = smoothstep(0.42, 0.8, c + 0.25 * nM(wx / 2100, wz / 2100));
    if (mm > 0) h += ridged(nR, wx / 900, wz / 900, 4) * 260 * mm * mm;
    const hv = volcanoH(xl, zl);
    h += hv;

    // rivulets: zero-set of a warped noise field
    const rx = wx + 38 * nW(x * 0.0043 + 9.1, z * 0.0043), rz = wz + 38 * nW(x * 0.0043 - 4.4, z * 0.0043 + 7.7);
    const a = Math.abs(nRiv(rx / 1500, rz / 1500));
    const volcFade = smoothstep(40, 220, hv);
    const wv = 0.0125 * (1 + 0.45 * nW(x * 0.0007 + 31, z * 0.0007));
    const v = lerp(smoothstep(0.0, 0.2, a), 1, volcFade);
    const low = Math.min(h, 1.3 + 0.055 * h);
    h = lerp(low, h, v * v);
    const ch = lerp(smoothstep(wv * 0.5, wv * 1.75, a), 1, volcFade);
    const bed = -2.8;
    if (h > bed) h = lerp(bed, h, ch);

    // gravel paths winding through the garden, a little sunk into the lawn
    const pa = Math.abs(nP(wx / 3600 + 4.1, wz / 3600 - 2.7) + 0.06 * nP(x / 410, z / 410));
    const path = (1 - smoothstep(0.05, 0.07, pa)) * land * smoothstep(1.5, 6, h) * (1 - volcFade) * (1 - mm);
    h -= path * 3;

    // detail: crumbs of soil
    const rough = 0.3 + smoothstep(25, 260, h) * 1.1;
    h += (fbm(nD, x / 85, z / 85, 3) * 2.8 * rough + nD(x / 19 + 40, z / 19) * 0.3 + path * nD(x / 9, z / 9) * 0.6) * (0.15 + 0.85 * ch);
    o.h = h; o.rr = a / wv; o.c = c; o.hv = hv; o.a = a; o.path = path;
    // how long the grass grows here: mown stretches, wild meadow, short near paths
    o.len = clamp(0.35 + 0.65 * smoothstep(-0.35, 0.45, nM(x / 1300 + 17, z / 1300 - 9)) + 0.15 * nM(x / 260, z / 260), 0.25, 1) * (1 - 0.6 * smoothstep(0, 0.5, 1 - smoothstep(0.05, 0.12, pa)));
    return h;
  }
  function rawHeight(x, z) { return terrain(x, z, T); }

  // ---------------------------------------------------------------- temple sites
  const siteCache = new Map();
  const To = { h: 0, rr: 0, c: 0, hv: 0, a: 0, path: 0, len: 0 };
  function siteAt(ci, cj) {
    const k = key(ci, cj);
    let s = siteCache.get(k);
    if (s !== undefined) return s;
    s = null;
    const hi = ci + ox / SITE_CELL, hj = cj + oz / SITE_CELL;
    const forced = hi === 0 && hj === -1;
    if (forced || H(hi, hj, 20) < 0.36) {
      for (let at = 0; at < 4 && !s; at++) {
        let x = (ci + 0.16 + 0.68 * H(hi, hj, 21 + at * 3)) * SITE_CELL;
        let z = (cj + 0.16 + 0.68 * H(hi, hj, 22 + at * 3)) * SITE_CELL;
        terrain(x, z, To);
        if (To.h < 3 || To.h > 300 || To.rr < 5 || To.hv > 120 || To.path > 0.2) continue;
        let hmin = To.h, hmax = To.h, sum = To.h, gx = 0, gz = 0;
        const R = 60;
        let ok = true;
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * Math.PI * 2;
          const hh = terrain(x + Math.cos(an) * R, z + Math.sin(an) * R, To);
          if (hh < 1.5) { ok = false; break; }
          hmin = Math.min(hmin, hh); hmax = Math.max(hmax, hh); sum += hh;
          gx += Math.cos(an) * hh; gz += Math.sin(an) * hh;
        }
        if (!ok || hmax - hmin > 18) continue;
        const t = H(hi, hj, 40);
        const type = forced ? 0 : t < 0.3 ? 0 : t < 0.55 ? 1 : 2;
        // approach from the downhill side (local +Z points downhill)
        let rot = Math.atan2(-gx, -gz);
        if (Math.hypot(gx, gz) < 4) rot = H(hi, hj, 41) * Math.PI * 2;
        const r1 = type === 0 ? 90 : type === 1 ? 110 : 34;
        s = { x, z, h: sum / 9 + 0.3, r1, r2: r1 * 1.9 + 30, type, rot, id: key(hi, hj), v: H(hi, hj, 42) };
      }
    }
    siteCache.set(k, s);
    return s;
  }
  // small hilltop torii shrines (type 3) on a finer grid
  const miniCache = new Map();
  function miniAt(ci, cj) {
    const k = key(ci, cj);
    let s = miniCache.get(k);
    if (s !== undefined) return s;
    s = null;
    const hi = ci + ox / MINI_CELL, hj = cj + oz / MINI_CELL;
    if (H(hi, hj, 120) < 0.3) {
      for (let at = 0; at < 3 && !s; at++) {
        let x = (ci + 0.12 + 0.76 * H(hi, hj, 121 + at * 3)) * MINI_CELL, z = (cj + 0.12 + 0.76 * H(hi, hj, 122 + at * 3)) * MINI_CELL;
        let h = terrain(x, z, To);
        for (let it = 0; it < 6; it++) { // climb to the nearest knoll: torii love a view
          let bx = x, bz = z, bh = h;
          for (let a = 0; a < 8; a++) { const nx = x + Math.cos(a * 0.7854) * 13, nz = z + Math.sin(a * 0.7854) * 13, nh = terrain(nx, nz, To); if (nh > bh) { bh = nh; bx = nx; bz = nz; } }
          if (bh <= h + 0.05) break;
          x = bx; z = bz; h = bh;
        }
        terrain(x, z, To);
        if (h < 3 || h > 330 || To.rr < 4 || To.hv > 120 || To.path > 0.3) continue;
        let hmin = h, hmax = h, sum = h, gx = 0, gz = 0, ok = true;
        for (let i = 0; i < 8; i++) {
          const an = i * 0.7854, hh = terrain(x + Math.cos(an) * 10, z + Math.sin(an) * 10, To);
          if (hh < 1.5) { ok = false; break; }
          hmin = Math.min(hmin, hh); hmax = Math.max(hmax, hh); sum += hh; gx += Math.cos(an) * hh; gz += Math.sin(an) * hh;
        }
        if (!ok || hmax - hmin > 4.2) continue;
        const mi = Math.floor(x / SITE_CELL), mj = Math.floor(z / SITE_CELL);
        for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) { const m = siteAt(mi + a, mj + b); if (m && Math.hypot(m.x - x, m.z - z) < m.r2 + 60) { ok = false; break; } }
        if (!ok) continue;
        let rot = Math.atan2(-gx, -gz);
        if (Math.hypot(gx, gz) < 1.5) rot = H(hi, hj, 131) * Math.PI * 2;
        s = { x, z, h: sum / 9 + 0.2, r1: 16, r2: 44, type: 3, rot, id: key(hi, hj) + 8589934592, sc: 0.8 + 0.6 * H(hi, hj, 132), v: H(hi, hj, 134) };
      }
    }
    miniCache.set(k, s);
    return s;
  }
  function sitesNear(minx, minz, maxx, maxz, out = []) {
    {
      const pad = 50;
      const i0 = Math.floor((minx - pad) / MINI_CELL), i1 = Math.floor((maxx + pad) / MINI_CELL);
      const j0 = Math.floor((minz - pad) / MINI_CELL), j1 = Math.floor((maxz + pad) / MINI_CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const s = miniAt(i, j);
        if (s && s.x > minx - s.r2 && s.x < maxx + s.r2 && s.z > minz - s.r2 && s.z < maxz + s.r2) out.push(s);
      }
    }
    const pad = 260;
    const i0 = Math.floor((minx - pad) / SITE_CELL), i1 = Math.floor((maxx + pad) / SITE_CELL);
    const j0 = Math.floor((minz - pad) / SITE_CELL), j1 = Math.floor((maxz + pad) / SITE_CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const s = siteAt(i, j);
      if (s && s.x > minx - s.r2 && s.x < maxx + s.r2 && s.z > minz - s.r2 && s.z < maxz + s.r2) out.push(s);
    }
    return out;
  }
  // height including site flattening, given a pre-fetched site list
  function heightS(x, z, sites, o) {
    let h = terrain(x, z, o || T);
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      const dx = x - s.x, dz = z - s.z, d2 = dx * dx + dz * dz;
      if (d2 < s.r2 * s.r2) {
        const w = 1 - smoothstep(s.r1, s.r2, Math.sqrt(d2));
        h = lerp(h, s.h, w);
      }
    }
    return h;
  }
  const _one = [];
  function height(x, z) {
    _one.length = 0;
    sitesNear(x, z, x, z, _one);
    return heightS(x, z, _one, T);
  }
  function siteWeight(x, z, sites) {
    // returns [gravel weight, ring weight]
    let g = 0, ring = 0, open = 0;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      const d = Math.hypot(x - s.x, z - s.z);
      g = Math.max(g, (1 - smoothstep(s.r1 * 0.75, s.r1 * 0.97, d)) * (s.type === 0 ? 1 : 0.85));
      if (s.type === 0 && d < 280) { // the ant road
        const sn = Math.sin(s.rot), cs = Math.cos(s.rot), dx = x - s.x, dz = z - s.z;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, end = 260;
        if (lz > 0 && lz < end) g = Math.max(g, (1 - smoothstep(4, 9, Math.abs(lx + 6 * Math.sin(lz * 0.03)))) * (1 - smoothstep(end - 30, end, lz)) * 0.8);
      }
      ring = Math.max(ring, smoothstep(s.r1 * 0.9, s.r1 * 1.04, d) * (1 - smoothstep(s.r2 * 0.75, s.r2 * 1.05, d)));
    }
    _sw[0] = g; _sw[1] = ring * (1 - open);
    return _sw;
  }
  const _sw = [0, 0];

  // ---------------------------------------------------------------- bridges
  const bridgeCache = new Map();
  function bridgeAt(ci, cj) {
    const k = key(ci, cj);
    let b = bridgeCache.get(k);
    if (b !== undefined) return b;
    b = null;
    const hi = ci + ox / BRIDGE_CELL, hj = cj + oz / BRIDGE_CELL;
    if (H(hi, hj, 60) < 0.7) {
      let x = (ci + 0.1 + 0.8 * H(hi, hj, 61)) * BRIDGE_CELL, z = (cj + 0.1 + 0.8 * H(hi, hj, 62)) * BRIDGE_CELL;
      let gx = 0, gz = 0, conv = false;
      for (let it = 0; it < 8; it++) {
        const r = riverSigned(x, z);
        gx = (riverSigned(x + 2, z) - riverSigned(x - 2, z)) / 4;
        gz = (riverSigned(x, z + 2) - riverSigned(x, z - 2)) / 4;
        const g2 = gx * gx + gz * gz;
        if (g2 < 1e-10) break;
        if (Math.abs(r) < 0.0015) { conv = true; break; }
        let step = r / g2;
        const sl = Math.abs(step) * Math.sqrt(g2);
        if (sl > 120) step *= 120 / sl;
        x -= gx * step; z -= gz * step;
      }
      if (conv && Math.abs(x - (ci + 0.5) * BRIDGE_CELL) < BRIDGE_CELL * 0.75 && Math.abs(z - (cj + 0.5) * BRIDGE_CELL) < BRIDGE_CELL * 0.75) {
        const gl = Math.hypot(gx, gz); gx /= gl; gz /= gl;
        const hc = height(x, z);
        if (hc < -1.2 && T.hv < 30) {
          let d1 = -1, d2 = -1, h1 = 0, h2 = 0;
          for (let d = 3; d <= 56; d += 1.5) {
            if (d1 < 0) { const hh = height(x + gx * d, z + gz * d); if (hh > 1.0) { d1 = d; h1 = hh; } }
            if (d2 < 0) { const hh = height(x - gx * d, z - gz * d); if (hh > 1.0) { d2 = d; h2 = hh; } }
          }
          if (d1 > 0 && d2 > 0 && d1 + d2 < 120 && Math.max(h1, h2) < 9) {
            const ext = 3.5;
            const ax = x - gx * (d2 + ext), az = z - gz * (d2 + ext), bx = x + gx * (d1 + ext), bz = z + gz * (d1 + ext);
            const ha = height(ax, az), hb = height(bx, bz);
            const len = d1 + d2 + ext * 2;
            b = {
              ax, az, bx, bz, ha, hb, len, x: (ax + bx) / 2, z: (az + bz) / 2,
              dx: gx, dz: gz, rise: 1.0 + len * 0.02, width: len < 46 ? 2.2 : 7 + 3 * H(hi, hj, 64), id: key(hi, hj),
              style: len < 46 ? 0 : 1, seed: H(hi, hj, 65),
            };
          }
        }
      }
    }
    bridgeCache.set(k, b);
    return b;
  }
  // deck height at world pos, or -Infinity
  function bridgeDeck(b, x, z) {
    const px = x - b.ax, pz = z - b.az;
    const t = (px * b.dx + pz * b.dz) / b.len;
    const side = Math.abs(-px * b.dz + pz * b.dx);
    if (t < -0.02 || t > 1.02 || side > b.width * 0.5) return -Infinity;
    const tc = clamp(t, 0, 1);
    return lerp(b.ha, b.hb, tc) + (b.style === 0 ? 2.2 : b.width * 0.9) + b.rise * 4 * tc * (1 - tc);
  }

  // ---------------------------------------------------------------- water torii
  const toriiCache = new Map();
  function waterToriiAt(ci, cj) {
    const k = key(ci, cj);
    let t = toriiCache.get(k);
    if (t !== undefined) return t;
    t = null;
    const hi = ci + ox / TORII_CELL, hj = cj + oz / TORII_CELL;
    for (let at = 0; at < 12 && !t; at++) {
      if (H(hi, hj, 70 + at * 7) > 0.9) continue;
      const x0 = (ci + H(hi, hj, 71 + at * 7)) * TORII_CELL, z0 = (cj + H(hi, hj, 72 + at * 7)) * TORII_CELL;
      const an = H(hi, hj, 73 + at * 7) * Math.PI * 2, dx = Math.cos(an), dz = Math.sin(an);
      let prev = rawHeight(x0, z0);
      for (let d = 8; d < 520; d += 8) {
        const x = x0 + dx * d, z = z0 + dz * d;
        const h = rawHeight(x, z);
        if ((prev > 0.5 && h < -0.4) || (prev < -0.4 && h > 0.5)) {
          const sgn = h < prev ? 1 : -1;
          let px = x, pz = z, found = false;
          for (let s2 = 0; s2 < 40; s2++) {
            const hh = rawHeight(px, pz);
            if (hh < -1.1 && hh > -2.6) { found = true; break; }
            if (hh < -2.6) break;
            px += dx * sgn * 2.5; pz += dz * sgn * 2.5;
          }
          if (found) { // open water only (sea / lake), not rivers
            let n1 = 0, n2 = 0;
            for (let a = 0; a < 8; a++) {
              const ca = Math.cos(a * 0.7854), sa = Math.sin(a * 0.7854);
              if (rawHeight(px + ca * 32, pz + sa * 32) < -0.3) n1++;
              if (rawHeight(px + ca * 70, pz + sa * 70) < -0.3) n2++;
            }
            if (n1 < 4 || n2 < 2) found = false;
          }
          if (found) {
            const hh = rawHeight(px, pz);
            t = { x: px, z: pz, h: hh, rot: Math.atan2(dx * sgn, dz * sgn), id: key(hi, hj) };
          }
          break;
        }
        prev = h;
      }
    }
    toriiCache.set(k, t);
    return t;
  }

  // ---------------------------------------------------------------- landmarks: stone arches (type 0), crystal spires (type 1)
  const markCache = new Map();
  function markAt(ci, cj) {
    const k = key(ci, cj);
    let m = markCache.get(k);
    if (m !== undefined) return m;
    m = null;
    const hi = ci + ox / MARK_CELL, hj = cj + oz / MARK_CELL;
    const r = H(hi, hj, 240);
    if (r < 0.22) {
      const x = (ci + 0.15 + 0.7 * H(hi, hj, 241)) * MARK_CELL, z = (cj + 0.15 + 0.7 * H(hi, hj, 242)) * MARK_CELL;
      const h = terrain(x, z, To);
      if (h > 2 && h < 300 && To.hv < 60 && sitesNear(x - 200, z - 200, x + 200, z + 200).length === 0) {
        if (r < 0.05) m = { type: 0, id: key(hi, hj), x, z, h, heading: H(hi, hj, 243) * 6.2832, len: 2500 + 3500 * H(hi, hj, 244), seed: H(hi, hj, 245) };
        else if (To.path < 0.1 && To.rr > 4) m = { type: 1, id: key(hi, hj), x, z, h, n: 1 + Math.floor(H(hi, hj, 246) * 3), size: 1500 + 900 * H(hi, hj, 247), seed: H(hi, hj, 248) };
      }
    }
    markCache.set(k, m);
    return m;
  }

  // ---------------------------------------------------------------- vegetation fields
  // lawn: grass tufts; clover: clover patches; flower: daisies and dandelions; moss: damp shade; leaf: leaf litter
  const V = { lawn: 0, clover: 0, flower: 0, moss: 0, leaf: 0, len: 1, path: 0 };
  function veg(xl, zl, h, ny, rr, sw, path = 0, len = 1) {
    const x = xl + ox, z = zl + oz;
    const slopeOK = smoothstep(0.62, 0.82, ny);
    const shoreOK = smoothstep(0.5, 1.8, h);
    const crown = crownCover(xl, zl);
    const f = fbm(nF, x / 380, z / 380, 3) * 0.5 + 0.5;
    const bank = smoothstep(1.4, 2.2, rr) * (1 - smoothstep(4, 8, rr)) * (1 - smoothstep(6, 16, h));
    let moss = clamp(Math.max(bank * 0.9, crown * 0.75 * smoothstep(0.35, 0.65, f), smoothstep(0.62, 0.8, f) * 0.6), 0, 1);
    let clover = smoothstep(0.1, 0.42, nS(x / 520, z / 520) + 0.12 * nS(x / 90 + 3, z / 90)) * (1 - moss * 0.7);
    let lawn = (1 - smoothstep(0.55, 0.95, moss)) * (1 - clover * 0.55);
    lawn *= 1 - smoothstep(0.7, 0.92, crown * f * 1.2); // bare, mossy ground deep in the shade
    const open = (1 - Math.min(1, sw[0] * 1.6)) * (1 - path) * slopeOK * shoreOK * (1 - smoothstep(180, 300, h));
    lawn *= open; clover *= open; moss *= (1 - Math.min(1, sw[0] * 1.6)) * (1 - path) * shoreOK;
    const flower = Math.max(smoothstep(0.15, 0.5, nB(x / 300, z / 300) + 0.2 * nB(x / 60 + 5, z / 60)) * 0.8, sw[1] * 0.9) * open;
    V.lawn = Math.max(0, lawn); V.clover = Math.max(0, clover); V.flower = flower; V.moss = moss;
    V.leaf = clamp(crown * 0.9 + 0.08, 0, 1) * (1 - path * 0.5); V.len = len; V.path = path;
    return V;
  }

  // ---------------------------------------------------------------- generators (worker side)
  function genChunk(x0, z0, size, S) {
    const d = size / S, G = S + 3;
    const sites = sitesNear(x0 - d, z0 - d, x0 + size + d, z0 + size + d);
    const hs = new Float32Array(G * G), rrs = new Float32Array(G * G), pas = new Float32Array(G * G), lns = new Float32Array(G * G);
    const o = { h: 0, rr: 0, c: 0, hv: 0, a: 0, path: 0, len: 1 };
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      hs[j * G + i] = heightS(x0 + (i - 1) * d, z0 + (j - 1) * d, sites, o);
      rrs[j * G + i] = o.rr; pas[j * G + i] = o.path; lns[j * G + i] = o.len;
    }
    const N = S + 1, nv = N * N + 4 * N;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), aux = new Float32Array(nv * 4);
    let hmin = 1e9, hmax = -1e9, anyWater = false;
    const depth = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const gi = (j + 1) * G + (i + 1), vi = j * N + i;
      const h = hs[gi], x = x0 + i * d, z = z0 + j * d;
      pos[vi * 3] = x; pos[vi * 3 + 1] = h; pos[vi * 3 + 2] = z;
      let nx = hs[gi - 1] - hs[gi + 1], nz = hs[gi - G] - hs[gi + G], ny = 2 * d;
      const l = 1 / Math.hypot(nx, ny, nz); nx *= l; ny *= l; nz *= l;
      nor[vi * 3] = nx; nor[vi * 3 + 1] = ny; nor[vi * 3 + 2] = nz;
      if (h < hmin) hmin = h; if (h > hmax) hmax = h;
      depth[vi] = -h;
      if (h < 0.15) anyWater = true;
      const sw = siteWeight(x, z, sites);
      const g = sw[0];
      const v = veg(x, z, h, ny, rrs[gi], sw, pas[gi], lns[gi]);
      // aux: lawn (x grass length), clover (negative: leaf litter), trampled clearing (negative: gravel path), moss
      aux[vi * 4] = v.lawn * (0.4 + 0.6 * v.len); aux[vi * 4 + 1] = v.clover > 0.05 ? v.clover : -v.leaf; aux[vi * 4 + 2] = pas[gi] > 0.02 ? -pas[gi] : g; aux[vi * 4 + 3] = v.moss;
    }
    // skirts
    const sk = 3 + size * 0.04;
    let w = N * N;
    const addSkirt = (vi) => {
      pos[w * 3] = pos[vi * 3]; pos[w * 3 + 1] = pos[vi * 3 + 1] - sk; pos[w * 3 + 2] = pos[vi * 3 + 2];
      nor[w * 3] = nor[vi * 3]; nor[w * 3 + 1] = nor[vi * 3 + 1]; nor[w * 3 + 2] = nor[vi * 3 + 2];
      aux[w * 4] = aux[vi * 4]; aux[w * 4 + 1] = aux[vi * 4 + 1]; aux[w * 4 + 2] = aux[vi * 4 + 2]; aux[w * 4 + 3] = aux[vi * 4 + 3];
      w++;
    };
    for (let i = 0; i < N; i++) addSkirt(i);                 // top    (j=0)
    for (let i = 0; i < N; i++) addSkirt((N - 1) * N + i);   // bottom (j=S)
    for (let j = 0; j < N; j++) addSkirt(j * N);             // left   (i=0)
    for (let j = 0; j < N; j++) addSkirt(j * N + N - 1);     // right  (i=S)
    return { pos, nor, aux, depth: anyWater ? depth : null, hmin, hmax };
  }

  function genVeg(ci, cj) {
    const x0 = ci * VEG_CELL, z0 = cj * VEG_CELL;
    const sites = sitesNear(x0, z0, x0 + VEG_CELL, z0 + VEG_CELL);
    const o = { h: 0, rr: 0, c: 0, hv: 0, a: 0, path: 0, len: 1 };
    const lists = []; for (let i = 0; i < SP.COUNT; i++) lists.push([]);
    const push = (sp, x, y, z, sc, rot, tint) => { lists[sp].push(x, y, z, sc, rot, tint); };
    const slopeAt = (x, z, h) => {
      const hx = heightS(x + 2, z, sites) - h, hz = heightS(x, z + 2, sites) - h;
      return 2 / Math.hypot(hx, 2, hz);
    };
    // plants, pebbles, leaves, twigs
    const n = 20, g = VEG_CELL / n, aci = ci + ox / VEG_CELL, acj = cj + oz / VEG_CELL;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gi = aci * n + i, gj = acj * n + j;
      const x = x0 + (i + 0.1 + 0.8 * H(gi, gj, 100)) * g, z = z0 + (j + 0.1 + 0.8 * H(gi, gj, 101)) * g;
      const h = heightS(x, z, sites, o);
      if (h < 0.3) continue;
      const ny = slopeAt(x, z, h);
      const sw = siteWeight(x, z, sites);
      const v = veg(x, z, h, ny, o.rr, sw, o.path, o.len);
      const r = H(gi, gj, 102), r2 = H(gi, gj, 103), r3 = H(gi, gj, 104), r4 = H(gi, gj, 105), t = H(gi, gj, 106);
      if (v.path > 0.3) { // gravel: a field of boulders
        if (r < 0.85 * v.path) push(SP.ROCK, x, h - 0.6, z, 1.2 + 7 * r3 * r3 + 3 * r3, r4 * 6.2832, t);
        continue;
      }
      if (sw[0] > 0.5) { if (r < 0.03) push(SP.ROCK, x, h - 0.3, z, 0.8 + 3 * r3, r4 * 6.2832, t); continue; }
      if (r < v.clover * 0.42) push(SP.KLEE, x, h - 0.2, z, 0.65 + 0.6 * r3 * (0.5 + 0.5 * v.len), r4 * 6.2832, t);
      else if (r < v.clover * 0.42 + v.flower * 0.07) push(r2 < 0.55 ? SP.BLUME : SP.LOEWE, x, h - 0.2, z, 0.8 + 0.45 * r3, r4 * 6.2832, t);
      else if (r < v.clover * 0.42 + v.flower * 0.07 + v.moss * 0.03 + 0.003) push(SP.PILZ, x, h - 0.3, z, 4 + 7 * r3 * r3, r4 * 6.2832, t);
      else if (r2 < v.leaf * 0.11) push(SP.BLATT, x, h + 0.2, z, 0.7 + 0.6 * r3, r4 * 6.2832, t);
      else if (r2 > 0.997 - v.leaf * 0.006) push(SP.ZWEIG, x, h + 1, z, 0.6 + 0.8 * r3, r4 * 6.2832, t);
      else if (r3 < 0.01 + 0.25 * (1 - smoothstep(0.55, 0.8, ny)) + 0.05 * (1 - smoothstep(0.3, 1.4, h))) push(SP.ROCK, x, h - 0.4, z, 1 + 6 * r4 * r4 + 18 * (1 - smoothstep(0.5, 0.75, ny)) * r4, r2 * 6.2832, t);
    }
    // the lawn itself: a dense pass of grass tufts
    const gb = 5, nb = Math.round(VEG_CELL / gb);
    for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) {
      const gi = aci * nb + i, gj = acj * nb + j;
      const px = x0 + (i + 0.5 + (H(gi, gj, 110) - 0.5) * 0.95) * gb, pz = z0 + (j + 0.5 + (H(gi, gj, 111) - 0.5) * 0.95) * gb;
      const h = heightS(px, pz, sites, o);
      if (h < 0.6) continue;
      const v = veg(px, pz, h, 1, o.rr, siteWeight(px, pz, sites), o.path, o.len);
      if (H(gi, gj, 112) > v.lawn * 0.92) continue;
      push(SP.GRAS, px, h - 0.4, pz, (0.45 + 0.55 * v.len) * (0.75 + 0.5 * H(gi, gj, 113)), H(gi, gj, 114) * 6.2832, H(gi, gj, 115));
    }
    return lists.map((l) => new Float32Array(l));
  }

  function genGrass(ci, cj, count) {
    const x0 = ci * GRASS_CELL, z0 = cj * GRASS_CELL;
    const sites = sitesNear(x0, z0, x0 + GRASS_CELL, z0 + GRASS_CELL);
    const o = { h: 0, rr: 0, c: 0, hv: 0, a: 0, path: 0, len: 1 };
    // coarse grid of slope + fields
    const M = 5, st = GRASS_CELL / (M - 1);
    const cny = new Float32Array(M * M), cfo = new Float32Array(M * M), cba = new Float32Array(M * M), cgr = new Float32Array(M * M), csa = new Float32Array(M * M);
    let any = false;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = x0 + i * st, z = z0 + j * st;
      const h = heightS(x, z, sites, o);
      const rr = o.rr;
      const hx = heightS(x + 2, z, sites) - h, hz = heightS(x, z + 2, sites) - h;
      const ny = 2 / Math.hypot(hx, 2, hz);
      const sw = siteWeight(x, z, sites); const g0 = sw[0];
      const v = veg(x, z, h, ny, rr, sw, o.path, o.len);
      const k = j * M + i;
      cny[k] = ny; cfo[k] = 1 - v.moss; cba[k] = v.path; cgr[k] = g0; csa[k] = v.moss;
      if (h > 0.2) any = true;
    }
    if (!any) return { data: new Float32Array(0), n: 0 };
    const rnd = mulberry32(((ci + ox / GRASS_CELL) * 73856093) ^ ((cj + oz / GRASS_CELL) * 19349663) ^ (seed * 83492791));
    const data = new Float32Array(count * 8);
    let n = 0;
    for (let q = 0; q < count; q++) {
      const u = rnd(), w = rnd(), r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      const fx = u * (M - 1), fz = w * (M - 1);
      const ix = Math.min(M - 2, fx | 0), iz = Math.min(M - 2, fz | 0), tx = fx - ix, tz = fz - iz;
      const k = iz * M + ix;
      const bil = (a) => lerp(lerp(a[k], a[k + 1], tx), lerp(a[k + M], a[k + M + 1], tx), tz);
      const ny = bil(cny), gr = bil(cgr), ba = bil(cba), fo = bil(cfo);
      if (gr > 0.35 || ny < 0.74 + r1 * 0.1) continue;
      if (ba > 0.3) continue;
      if (fo > 0.6 && r2 < 0.7) continue; // outside moss only scattered seedlings
      const x = x0 + u * GRASS_CELL, z = z0 + w * GRASS_CELL;
      if (sites.length && siteWeight(x, z, sites)[0] > 0.3) continue; // keep paths and courtyards clear
      const h = heightS(x, z, sites, o);
      if (h < 0.5 + r2 * 0.5 || h > 640) continue;
      let sc = 0.55 + 0.75 * r3 * r3 + 0.25 * (nF((x + ox) / 14, (z + oz) / 14) * 0.5 + 0.5);
      // flowers: rare, clustered
      const fl = (r4 < 0.05 && nF((x + ox) / 9 + 50, (z + oz) / 9) > 0.1) ? 1 + Math.floor(rnd() * 3) : 0;
      data[n * 8] = x; data[n * 8 + 1] = h - 0.03; data[n * 8 + 2] = z; data[n * 8 + 3] = r1 * 6.2832;
      data[n * 8 + 4] = sc; data[n * 8 + 5] = r2; data[n * 8 + 6] = fl; data[n * 8 + 7] = bil(csa);
      n++;
    }
    return { data: data.subarray(0, n * 8).slice(), n };
  }

  return {
    seed, rawHeight, height, heightS, terrain, sitesNear, siteAt, siteWeight, bridgeAt, bridgeDeck, waterToriiAt,
    crownCover, nearTrees,
    volcanoAt, veg, genChunk, genVeg, genGrass, riverSigned, miniAt, markAt, setOrigin, origin: () => [ox, oz],
    info(x, z) { // debug/placement helper
      const h = height(x, z);
      return { h, rr: T.rr, c: T.c, hv: T.hv };
    },
  };
}
