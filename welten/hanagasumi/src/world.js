// Deterministic world definition: height field, rivers, volcanoes, temple sites, bridges,
// vegetation fields, and the bulk generators used by the workers.
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

// species ids
export const SP = { SAKURA: 0, SUGI: 1, MATSU: 2, MOMIJI: 3, BAMBOO: 4, AZALEA: 5, ROCK: 6, COUNT: 7 };

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
    volcCache.clear(); siteCache.clear(); miniCache.clear(); bridgeCache.clear(); toriiCache.clear();
    vLastI = 1e9; vLastJ = 1e9;
  }

  // ---------------------------------------------------------------- volcanoes
  const volcCache = new Map();
  function volcanoAt(ci, cj) {
    const k = key(ci, cj);
    let v = volcCache.get(k);
    if (v !== undefined) return v;
    const hi = ci + ox / VOLC_CELL, hj = cj + oz / VOLC_CELL; // absolute cell
    if (hi === 0 && hj === -1) {
      v = { x: 1800 - ox, z: -7400 - oz, H: 1950, L: 1500, rc: 190 };
    } else if (H(hi, hj, 1) < 0.7 && !(hi === 0 && hj === 0)) {
      v = {
        x: (ci + 0.25 + 0.5 * H(hi, hj, 2)) * VOLC_CELL,
        z: (cj + 0.25 + 0.5 * H(hi, hj, 3)) * VOLC_CELL,
        H: 1300 + 900 * H(hi, hj, 4), L: 1200 + 500 * H(hi, hj, 5), rc: 140 + 90 * H(hi, hj, 6),
      };
    } else v = null;
    volcCache.set(k, v);
    return v;
  }
  let vLastI = 1e9, vLastJ = 1e9, vList = [];
  function volcanoH(x, z) {
    const ci = Math.floor(x / VOLC_CELL), cj = Math.floor(z / VOLC_CELL);
    if (ci !== vLastI || cj !== vLastJ) {
      vLastI = ci; vLastJ = cj; vList = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const v = volcanoAt(ci + a, cj + b); if (v) vList.push(v); }
    }
    let h = 0;
    for (let i = 0; i < vList.length; i++) {
      const v = vList[i];
      const dx = x - v.x, dz = z - v.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1.0e8) continue;
      const d = Math.sqrt(d2);
      // gullies radiating from the summit
      const ang = Math.atan2(dz, dx);
      const gul = 1 + 0.045 * nP(ang * 5.0, d / 900) * smoothstep(100, 900, d);
      let hv = v.H * Math.exp(-Math.max(d, v.rc) * gul / v.L);
      hv -= 110 * (1 - smoothstep(0, v.rc, d));
      hv *= 1 - smoothstep(6500, 10000, d);
      h += hv;
    }
    return h;
  }

  // ---------------------------------------------------------------- base terrain
  const T = { h: 0, rr: 0, c: 0, hv: 0, a: 0 };
  function riverSigned(xl, zl) {
    const x = xl + ox, z = zl + oz;
    const wx = x + 110 * nW(x * 0.0011, z * 0.0011), wz = z + 110 * nW(x * 0.0011 + 53.1, z * 0.0011 - 17.7);
    const rx = wx + 38 * nW(x * 0.0043 + 9.1, z * 0.0043), rz = wz + 38 * nW(x * 0.0043 - 4.4, z * 0.0043 + 7.7);
    return nRiv(rx / 1500, rz / 1500);
  }
  function terrain(xl, zl, o) {
    const x = xl + ox, z = zl + oz; // noise is sampled at absolute coordinates
    const wx = x + 110 * nW(x * 0.0011, z * 0.0011), wz = z + 110 * nW(x * 0.0011 + 53.1, z * 0.0011 - 17.7);
    const c = fbm(nC, wx / 5200, wz / 5200, 3) + 0.14;
    const land = smoothstep(-0.30, -0.10, c);
    const inland = smoothstep(-0.10, 0.45, c);
    const hillN = fbm(nH, wx / 640, wz / 640, 4) * 0.5 + 0.5;
    let h = -26 + land * (28.5 + hillN * hillN * (16 + 90 * inland));
    const mm = smoothstep(0.12, 0.62, c + 0.22 * nM(wx / 2100, wz / 2100));
    if (mm > 0) h += ridged(nR, wx / 1700, wz / 1700, 5) * 600 * mm * mm;
    const hv = volcanoH(xl, zl);
    h += hv;

    // rivers: zero-set of a warped noise field
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

    // detail
    const rough = 0.3 + smoothstep(25, 260, h) * 1.1;
    h += (fbm(nD, x / 85, z / 85, 3) * 2.8 * rough + nD(x / 19 + 40, z / 19) * 0.3) * (0.15 + 0.85 * ch);
    o.h = h; o.rr = a / wv; o.c = c; o.hv = hv; o.a = a;
    return h;
  }
  function rawHeight(x, z) { return terrain(x, z, T); }

  // ---------------------------------------------------------------- temple sites
  const siteCache = new Map();
  const To = { h: 0, rr: 0, c: 0, hv: 0, a: 0 };
  function siteAt(ci, cj) {
    const k = key(ci, cj);
    let s = siteCache.get(k);
    if (s !== undefined) return s;
    s = null;
    const hi = ci + ox / SITE_CELL, hj = cj + oz / SITE_CELL;
    const forced = hi === 0 && hj === -1;
    if (forced || H(hi, hj, 20) < 0.8) {
      for (let at = 0; at < 4 && !s; at++) {
        let x = (ci + 0.16 + 0.68 * H(hi, hj, 21 + at * 3)) * SITE_CELL;
        let z = (cj + 0.16 + 0.68 * H(hi, hj, 22 + at * 3)) * SITE_CELL;
        terrain(x, z, To);
        if (To.h < 3 || To.h > 300 || To.rr < 5 || To.hv > 250) continue;
        let hmin = To.h, hmax = To.h, sum = To.h, gx = 0, gz = 0;
        const R = 30;
        let ok = true;
        for (let i = 0; i < 8; i++) {
          const an = i / 8 * Math.PI * 2;
          const hh = terrain(x + Math.cos(an) * R, z + Math.sin(an) * R, To);
          if (hh < 1.5) { ok = false; break; }
          hmin = Math.min(hmin, hh); hmax = Math.max(hmax, hh); sum += hh;
          gx += Math.cos(an) * hh; gz += Math.sin(an) * hh;
        }
        if (!ok || hmax - hmin > 13) continue;
        const t = H(hi, hj, 40);
        const type = forced ? 0 : t < 0.36 ? 0 : t < 0.8 ? 1 : 2;
        // approach from the downhill side (local +Z points downhill)
        let rot = Math.atan2(-gx, -gz);
        if (Math.hypot(gx, gz) < 4) rot = H(hi, hj, 41) * Math.PI * 2;
        const r1 = type === 0 ? 41 : type === 1 ? 27 : 17;
        s = { x, z, h: sum / 9 + 0.3, r1, r2: r1 * 2.1 + 14, type, rot, id: key(hi, hj) };
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
    if (H(hi, hj, 120) < 0.55) {
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
        if (h < 3 || h > 330 || To.rr < 4 || To.hv > 200) continue;
        let hmin = h, hmax = h, sum = h, gx = 0, gz = 0, ok = true;
        for (let i = 0; i < 8; i++) {
          const an = i * 0.7854, hh = terrain(x + Math.cos(an) * 10, z + Math.sin(an) * 10, To);
          if (hh < 1.5) { ok = false; break; }
          hmin = Math.min(hmin, hh); hmax = Math.max(hmax, hh); sum += hh; gx += Math.cos(an) * hh; gz += Math.sin(an) * hh;
        }
        if (!ok || hmax - hmin > 4.2) continue;
        const mi = Math.floor(x / SITE_CELL), mj = Math.floor(z / SITE_CELL);
        for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) { const m = siteAt(mi + a, mj + b); if (m && Math.hypot(m.x - x, m.z - z) < m.r2 + 45) { ok = false; break; } }
        if (!ok) continue;
        let rot = Math.atan2(-gx, -gz);
        if (Math.hypot(gx, gz) < 1.5) rot = H(hi, hj, 131) * Math.PI * 2;
        s = { x, z, h: sum / 9 + 0.2, r1: 7.5, r2: 30, type: 3, rot, id: key(hi, hj) + 8589934592, sc: 1.15 + 0.75 * H(hi, hj, 132) * H(hi, hj, 133) };
      }
    }
    miniCache.set(k, s);
    return s;
  }
  function sitesNear(minx, minz, maxx, maxz, out = []) {
    {
      const pad = 34;
      const i0 = Math.floor((minx - pad) / MINI_CELL), i1 = Math.floor((maxx + pad) / MINI_CELL);
      const j0 = Math.floor((minz - pad) / MINI_CELL), j1 = Math.floor((maxz + pad) / MINI_CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const s = miniAt(i, j);
        if (s && s.x > minx - s.r2 && s.x < maxx + s.r2 && s.z > minz - s.r2 && s.z < maxz + s.r2) out.push(s);
      }
    }
    const pad = 115;
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
      g = Math.max(g, 1 - smoothstep(s.r1 * 0.84, s.r1 * 0.97, d));
      if (s.type !== 2 && d < 110) { // approach path (torii tunnel / temple avenue / glade path)
        const sn = Math.sin(s.rot), cs = Math.cos(s.rot), dx = x - s.x, dz = z - s.z;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, end = s.type === 1 ? 96 : s.type === 0 ? 84 : 34;
        const wd = s.type === 3 ? 0.75 : s.type === 0 ? 1.7 : 1;
        if (lz > 0 && lz < end) g = Math.max(g, (1 - smoothstep(1.0 * wd, 3.0 * wd, Math.abs(lx))) * (1 - smoothstep(end - 8, end, lz)));
        // keep the view onto the torii open: thin the blossom ring in front of it
        const ow = s.type === 3 ? 7 : s.type === 0 ? 10 : 0;
        if (ow > 0 && lz > 0 && lz < end && Math.abs(lx) < ow) open = Math.max(open, 1 - smoothstep(ow * 0.55, ow, Math.abs(lx)));
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
          if (d1 > 0 && d2 > 0 && d1 + d2 < 84 && Math.max(h1, h2) < 7) {
            const ext = 3.5;
            const ax = x - gx * (d2 + ext), az = z - gz * (d2 + ext), bx = x + gx * (d1 + ext), bz = z + gz * (d1 + ext);
            const ha = height(ax, az), hb = height(bx, bz);
            const len = d1 + d2 + ext * 2;
            b = {
              ax, az, bx, bz, ha, hb, len, x: (ax + bx) / 2, z: (az + bz) / 2,
              dx: gx, dz: gz, rise: 1.6 + len * 0.075, width: 3.6, id: key(hi, hj),
              style: H(hi, hj, 63) < 0.7 ? 0 : 1,
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
    return lerp(b.ha, b.hb, tc) + 0.25 + b.rise * 4 * tc * (1 - tc);
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

  // ---------------------------------------------------------------- vegetation fields
  const V = { forest: 0, sakura: 0, bamboo: 0, maple: 0, pine: 0 };
  function veg(xl, zl, h, ny, rr, sw) {
    const x = xl + ox, z = zl + oz;
    const f = fbm(nF, x / 380, z / 380, 3) * 0.5 + 0.5;
    const slopeOK = smoothstep(0.66, 0.84, ny);
    const shoreOK = smoothstep(0.7, 2.2, h);
    const altOK = 1 - smoothstep(600, 830, h + 60 * nF(x / 200 + 7, z / 200));
    let forest = smoothstep(0.37, 0.58, f + 0.12 * smoothstep(40, 200, h));
    const s = nS(x / 620, z / 620);
    let sak = smoothstep(0.12, 0.4, s) * (1 - smoothstep(130, 240, h));
    const bank = smoothstep(1.7, 2.4, rr) * (1 - smoothstep(4.5, 7.5, rr)) * (1 - smoothstep(8, 18, h));
    sak = Math.max(sak, bank);
    forest = Math.max(forest, bank * 0.7);
    // site: clear the plaza, ring it with blossoms
    forest = Math.max(forest * (1 - sw[0] * 1.2), sw[1] * 0.85 * (1 - Math.min(1, sw[0] * 1.5)));
    sak = Math.max(sak, sw[1]);
    if (forest < 0) forest = 0;
    forest *= slopeOK * shoreOK * altOK;
    const b = nB(x / 330, z / 330) + 0.15 * nB(x / 70 + 5, z / 70);
    const bam = smoothstep(0.4, 0.52, b) * (1 - smoothstep(50, 95, h)) * smoothstep(1.2, 3, h) * smoothstep(0.8, 0.9, ny) * (1 - sw[0] * 2) * (1 - sw[1]);
    V.forest = forest; V.sakura = sak; V.bamboo = Math.max(0, bam);
    V.maple = smoothstep(0.25, 0.6, nS(x / 430 + 91, z / 430 - 37));
    V.pine = clamp((1 - smoothstep(6, 16, h)) * 0.8 + (1 - smoothstep(0.8, 0.92, ny)) * 0.6 + smoothstep(330, 520, h) * 0.5, 0, 1);
    return V;
  }

  // ---------------------------------------------------------------- generators (worker side)
  function genChunk(x0, z0, size, S) {
    const d = size / S, G = S + 3;
    const sites = sitesNear(x0 - d, z0 - d, x0 + size + d, z0 + size + d);
    const hs = new Float32Array(G * G), rrs = new Float32Array(G * G);
    const o = { h: 0, rr: 0, c: 0, hv: 0, a: 0 };
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      hs[j * G + i] = heightS(x0 + (i - 1) * d, z0 + (j - 1) * d, sites, o);
      rrs[j * G + i] = o.rr;
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
      const v = veg(x, z, h, ny, rrs[gi], sw);
      aux[vi * 4] = v.forest; aux[vi * 4 + 1] = v.sakura * Math.max(v.forest, 0.25); aux[vi * 4 + 2] = g; aux[vi * 4 + 3] = v.bamboo;
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
    const o = { h: 0, rr: 0, c: 0, hv: 0, a: 0 };
    const lists = []; for (let i = 0; i < SP.COUNT; i++) lists.push([]);
    const push = (sp, x, y, z, sc, rot, tint) => { lists[sp].push(x, y, z, sc, rot, tint); };
    const slopeAt = (x, z, h) => {
      const hx = heightS(x + 2, z, sites) - h, hz = heightS(x, z + 2, sites) - h;
      return 2 / Math.hypot(hx, 2, hz);
    };
    // trees
    const n = 20, g = VEG_CELL / n, aci = ci + ox / VEG_CELL, acj = cj + oz / VEG_CELL;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gi = aci * n + i, gj = acj * n + j;
      const x = x0 + (i + 0.1 + 0.8 * H(gi, gj, 100)) * g, z = z0 + (j + 0.1 + 0.8 * H(gi, gj, 101)) * g;
      const h = heightS(x, z, sites, o);
      if (h < 0.45) continue;
      const rr = o.rr;
      const ny = slopeAt(x, z, h);
      const sw = siteWeight(x, z, sites);
      const sw0 = sw[0];
      const v = veg(x, z, h, ny, rr, sw);
      const r = H(gi, gj, 102), r2 = H(gi, gj, 103), r3 = H(gi, gj, 104), r4 = H(gi, gj, 105);
      if (v.bamboo > 0.5) { if (r > 0.04) continue; }
      if (r < v.forest * 0.78) {
        if (h < 0.9) continue;
        let wS = v.sakura * 1.25, wM = v.maple * 0.3 * (1 - v.sakura * 0.6), wP = v.pine * 0.75, wC = (1 - v.sakura) * (0.35 + 0.65 * smoothstep(20, 120, h)) * (1 - v.pine * 0.5);
        const tot = wS + wM + wP + wC;
        let t = r2 * tot, sp;
        if ((t -= wS) < 0) sp = SP.SAKURA; else if ((t -= wM) < 0) sp = SP.MOMIJI; else if ((t -= wP) < 0) sp = SP.MATSU; else sp = SP.SUGI;
        push(sp, x, h - 0.25, z, 0.72 + 0.6 * r3 * r3 + 0.15 * r3, r4 * 6.2832, H(gi, gj, 106));
      } else if (sw0 < 0.02) {
        if (h > 0.9 && r > 0.985 && ny > 0.85 && h < 500) {
          push(r2 < 0.45 ? SP.SAKURA : r2 < 0.7 ? SP.MATSU : SP.MOMIJI, x, h - 0.25, z, 0.85 + 0.5 * r3, r4 * 6.2832, H(gi, gj, 106));
        } else if (r2 < 0.035 + 0.25 * sw[1] && ny > 0.8 && h > 0.8 && h < 400 && v.forest < 0.5) {
          push(SP.AZALEA, x, h - 0.08, z, 0.6 + 0.9 * r3, r4 * 6.2832, H(gi, gj, 106));
        } else if (r3 < 0.02 + 0.2 * (1 - smoothstep(0.6, 0.86, ny)) + 0.1 * (1 - smoothstep(0.3, 1.6, h))) {
          push(SP.ROCK, x, h - 0.15, z, 0.4 + 1.9 * r4 * r4, r2 * 6.2832, H(gi, gj, 106));
        }
      }
    }
    // bamboo: dense pass
    const gb = 2.5, nb = Math.round(VEG_CELL / gb);
    for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) {
      const x = x0 + (i + 0.5) * gb, z = z0 + (j + 0.5) * gb;
      const b = nB((x + ox) / 330, (z + oz) / 330) + 0.15 * nB((x + ox) / 70 + 5, (z + oz) / 70);
      if (b < 0.41) continue;
      const gi = aci * nb + i, gj = acj * nb + j;
      const px = x + (H(gi, gj, 110) - 0.5) * gb * 0.95, pz = z + (H(gi, gj, 111) - 0.5) * gb * 0.95;
      const h = heightS(px, pz, sites, o);
      if (h < 1.2 || h > 95) continue;
      const ny = slopeAt(px, pz, h);
      const v = veg(px, pz, h, ny, o.rr, siteWeight(px, pz, sites));
      if (H(gi, gj, 112) > v.bamboo * 0.9) continue;
      push(SP.BAMBOO, px, h - 0.1, pz, 0.75 + 0.5 * H(gi, gj, 113), H(gi, gj, 114) * 6.2832, H(gi, gj, 115));
    }
    return lists.map((l) => new Float32Array(l));
  }

  function genGrass(ci, cj, count) {
    const x0 = ci * GRASS_CELL, z0 = cj * GRASS_CELL;
    const sites = sitesNear(x0, z0, x0 + GRASS_CELL, z0 + GRASS_CELL);
    const o = { h: 0, rr: 0, c: 0, hv: 0, a: 0 };
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
      const v = veg(x, z, h, ny, rr, sw);
      const k = j * M + i;
      cny[k] = ny; cfo[k] = v.forest; cba[k] = v.bamboo; cgr[k] = g0; csa[k] = v.sakura;
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
      if (ba > 0.5 && r2 < 0.75) continue;
      const x = x0 + u * GRASS_CELL, z = z0 + w * GRASS_CELL;
      if (sites.length && siteWeight(x, z, sites)[0] > 0.3) continue; // keep paths and courtyards clear
      const h = heightS(x, z, sites, o);
      if (h < 0.5 + r2 * 0.5 || h > 640) continue;
      let sc = 0.55 + 0.75 * r3 * r3 + 0.25 * (nF((x + ox) / 14, (z + oz) / 14) * 0.5 + 0.5);
      sc *= 1 - 0.45 * fo;
      sc *= 1 - 0.5 * smoothstep(300, 600, h);
      // flowers: rare, clustered
      const fl = (r4 < 0.035 && nF((x + ox) / 9 + 50, (z + oz) / 9) > 0.1 && fo < 0.6) ? 1 + Math.floor(rnd() * 3) : 0;
      data[n * 8] = x; data[n * 8 + 1] = h - 0.03; data[n * 8 + 2] = z; data[n * 8 + 3] = r1 * 6.2832;
      data[n * 8 + 4] = sc; data[n * 8 + 5] = r2; data[n * 8 + 6] = fl; data[n * 8 + 7] = bil(csa);
      n++;
    }
    return { data: data.subarray(0, n * 8).slice(), n };
  }

  return {
    seed, rawHeight, height, heightS, terrain, sitesNear, siteAt, siteWeight, bridgeAt, bridgeDeck, waterToriiAt,
    volcanoAt, veg, genChunk, genVeg, genGrass, riverSigned, miniAt, setOrigin, origin: () => [ox, oz],
    info(x, z) { // debug/placement helper
      const h = height(x, z);
      return { h, rr: T.rr, c: T.c, hv: T.hv };
    },
  };
}
