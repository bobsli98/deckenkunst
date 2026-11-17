// Things that were lost in the grass, and the places of the small folk: ant hills, a garden gnome, a teacup,
// a flower pot, a watering can, marbles, coins, buttons, dice, thimbles, bottle caps, pencils, acorns, snail
// shells, feathers, paper boats, match and twig bridges. All procedural geometry, sized in millimetres.
import * as THREE from 'three';
import { U, patch, GLSL_COMMON } from './shaders.js';
import { SITE_CELL, MINI_CELL, BRIDGE_CELL, TORII_CELL } from './world.js';
import { mulberry32, lerp, clamp, smoothstep } from './noise.js';

const V3 = THREE.Vector3;
const C = {
  porcelain: [0.92, 0.91, 0.88], blue: [0.16, 0.30, 0.62], red: [0.72, 0.08, 0.06], white: [0.94, 0.94, 0.92], skin: [0.95, 0.70, 0.58],
  coat: [0.18, 0.36, 0.62], green: [0.20, 0.46, 0.20], boot: [0.28, 0.17, 0.10], terracotta: [0.70, 0.36, 0.20], soil: [0.16, 0.11, 0.07],
  zinc: [0.66, 0.70, 0.70], gold: [0.95, 0.74, 0.30], silver: [0.82, 0.83, 0.84], copper: [0.80, 0.48, 0.30], wood: [0.78, 0.60, 0.38],
  pencil: [0.96, 0.78, 0.10], graphite: [0.12, 0.12, 0.13], black: [0.03, 0.03, 0.035], acorn: [0.52, 0.34, 0.14], cap: [0.42, 0.32, 0.18],
  shell: [0.80, 0.68, 0.48], shellDark: [0.42, 0.28, 0.16], paper: [0.94, 0.93, 0.89], ant: [0.30, 0.16, 0.08], match: [0.86, 0.72, 0.50], matchHead: [0.62, 0.08, 0.05],
  bark: [0.36, 0.27, 0.18], needle: [0.42, 0.28, 0.14],
};

class Buf {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; }
  v(p, n, col, u = 0, v = 0) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(col[0], col[1], col[2]); this.uv.push(u, v); return this.p.length / 3 - 1; }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

class Arch {
  constructor() { this.k = { paint: new Buf(), roof: new Buf(), glow: new Buf(), gloss: new Buf(), glass: new Buf() }; this.m = new THREE.Matrix4(); this.st = []; }
  push(m) { this.st.push(this.m.clone()); this.m.multiply(m); return this; }
  pop() { this.m = this.st.pop(); return this; }
  at(x, y, z, ry = 0, s = 1) { return this.push(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), ry), new V3(s, s, s))); }
  quad(kind, a, b, c, d, col, shade = 1) {
    const B = this.k[kind];
    const pa = a.clone().applyMatrix4(this.m), pb = b.clone().applyMatrix4(this.m), pc = c.clone().applyMatrix4(this.m), pd = d.clone().applyMatrix4(this.m);
    const n = new V3().subVectors(pb, pa).cross(new V3().subVectors(pd, pa)).normalize();
    const cc = [col[0] * shade, col[1] * shade, col[2] * shade];
    const i0 = B.v(pa, n, cc, 0, 0), i1 = B.v(pb, n, cc, 1, 0), i2 = B.v(pc, n, cc, 1, 1), i3 = B.v(pd, n, cc, 0, 1);
    B.i.push(i0, i1, i2, i0, i2, i3);
  }
  // box with bottom centre at (x, y, z); optional local rotation
  box(kind, x, y, z, w, h, d, col, o = {}) {
    const loc = new THREE.Matrix4();
    if (o.rz || o.ry || o.rx) loc.makeRotationFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    loc.setPosition(x, y, z);
    this.push(loc);
    const hw = w / 2, hd = d / 2, y0 = o.centered ? -h / 2 : 0, y1 = y0 + h;
    const P = (sx, yy, sz) => new V3(sx * hw, yy, sz * hd);
    this.quad(kind, P(-1, y1, 1), P(1, y1, 1), P(1, y1, -1), P(-1, y1, -1), col, 1.0);
    if (!o.noBottom) this.quad(kind, P(-1, y0, -1), P(1, y0, -1), P(1, y0, 1), P(-1, y0, 1), col, 0.55);
    this.quad(kind, P(-1, y0, 1), P(1, y0, 1), P(1, y1, 1), P(-1, y1, 1), col, 0.9);
    this.quad(kind, P(1, y0, -1), P(-1, y0, -1), P(-1, y1, -1), P(1, y1, -1), col, 0.9);
    this.quad(kind, P(1, y0, 1), P(1, y0, -1), P(1, y1, -1), P(1, y1, 1), col, 0.84);
    this.quad(kind, P(-1, y0, -1), P(-1, y0, 1), P(-1, y1, 1), P(-1, y1, -1), col, 0.84);
    this.pop();
  }
  cyl(kind, x, y, z, rb, rt, h, col, seg = 10, o = {}) {
    const loc = new THREE.Matrix4();
    if (o.rz || o.rx) loc.makeRotationFromEuler(new THREE.Euler(o.rx || 0, 0, o.rz || 0));
    loc.setPosition(x, y, z);
    this.push(loc);
    const B = this.k[kind], nm = new THREE.Matrix3().getNormalMatrix(this.m);
    const base = B.p.length / 3, sl = (rb - rt) / h;
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const n = new V3(cs, sl, sn).applyMatrix3(nm).normalize();
      B.v(new V3(cs * rb, 0, sn * rb).applyMatrix4(this.m), n, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85], i / seg, 0);
      B.v(new V3(cs * rt, h, sn * rt).applyMatrix4(this.m), n, col, i / seg, 1);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; B.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    if (!o.noCap && rt > 0.001) {
      const n = new V3(0, 1, 0).applyMatrix3(nm).normalize();
      const c0 = B.v(new V3(0, h, 0).applyMatrix4(this.m), n, col);
      const ring = [];
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; ring.push(B.v(new V3(Math.cos(a) * rt, h, Math.sin(a) * rt).applyMatrix4(this.m), n, col)); }
      for (let i = 0; i < seg; i++) B.i.push(c0, ring[i + 1], ring[i]);
    }
    this.pop();
  }
  // ring (or arc) with a rectangular cross-section, standing in the local XY plane
  ring(kind, x, y, z, R, w, d, col, o = {}) {
    const loc = new THREE.Matrix4();
    if (o.rx || o.ry || o.rz) loc.makeRotationFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'));
    loc.setPosition(x, y, z);
    this.push(loc);
    const seg = o.seg || 24, a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2, Ro = R + w / 2, Ri = R - w / 2, hd = d / 2;
    const P = (r, a, zz) => new V3(Math.cos(a) * r, Math.sin(a) * r, zz);
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + (a1 - a0) * i / seg, t1 = a0 + (a1 - a0) * (i + 1) / seg;
      const sh = 0.9 + 0.1 * Math.sin(i * 2.3);
      this.quad(kind, P(Ro, t0, hd), P(Ro, t0, -hd), P(Ro, t1, -hd), P(Ro, t1, hd), col, sh);
      this.quad(kind, P(Ri, t0, -hd), P(Ri, t0, hd), P(Ri, t1, hd), P(Ri, t1, -hd), col, 0.72 * sh);
      this.quad(kind, P(Ri, t0, hd), P(Ro, t0, hd), P(Ro, t1, hd), P(Ri, t1, hd), col, 0.95 * sh);
      this.quad(kind, P(Ro, t0, -hd), P(Ri, t0, -hd), P(Ri, t1, -hd), P(Ro, t1, -hd), col, 0.95 * sh);
    }
    if (a1 - a0 < 6.2) for (const [t, s] of [[a0, 1], [a1, -1]]) {
      const q = [P(Ri, t, -hd), P(Ro, t, -hd), P(Ro, t, hd), P(Ri, t, hd)];
      if (s > 0) this.quad(kind, q[0], q[1], q[2], q[3], col, 0.8); else this.quad(kind, q[3], q[2], q[1], q[0], col, 0.8);
    }
    this.pop();
  }
  // dome (or full sphere) with smooth normals; sy squashes it vertically
  dome(kind, x, y, z, R, col, o = {}) {
    this.push(new THREE.Matrix4().makeTranslation(x, y, z));
    const B = this.k[kind], nm = new THREE.Matrix3().getNormalMatrix(this.m);
    const seg = o.seg || 16, rings = o.rings || 6, sy = o.sy || 1, lat0 = o.full ? -Math.PI / 2 : 0;
    const base = B.p.length / 3;
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
      const la = lat0 + (Math.PI / 2 - lat0) * j / rings, lo = i / seg * Math.PI * 2;
      const n = new V3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
      const sh = o.full ? 1 : 0.8 + 0.2 * j / rings;
      B.v(new V3(n.x * R, n.y * R * sy, n.z * R).applyMatrix4(this.m), new V3(n.x, n.y / sy, n.z).applyMatrix3(nm).normalize(), [col[0] * sh, col[1] * sh, col[2] * sh], i / seg * 3, j / rings);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d2 = c + 1;
      B.i.push(a, c, b, b, c, d2);
    }
    this.pop();
  }
  // two cones tip to tip: crystals, hovering shards
  gem(kind, x, y, z, R, hLow, hUp, col, seg = 6) {
    this.cyl(kind, x, y, z, 0.001, R, hLow, col, seg, { noCap: true });
    this.cyl(kind, x, y + hLow, z, R, 0.0, hUp, col, seg);
  }
  // surface of revolution around the local y axis: profile [[radius, y], ...] from bottom to top
  lathe(kind, x, y, z, prof, seg, col, o = {}) {
    this.push(new THREE.Matrix4().makeTranslation(x, y, z));
    const B = this.k[kind], nm = new THREE.Matrix3().getNormalMatrix(this.m), base = B.p.length / 3, n = prof.length;
    for (let i = 0; i < n; i++) {
      const a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)];
      let dr = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l;
      for (let k = 0; k <= seg; k++) {
        const an = k / seg * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an);
        const rr = prof[i][0] * (o.disp ? o.disp(i / (n - 1), an) : 1);
        const nrm = new V3(cs * dy, -dr, sn * dy).applyMatrix3(nm).normalize();
        if (o.flip) nrm.negate();
        const cc = typeof col === 'function' ? col(i / (n - 1), an, prof[i][1]) : col;
        B.v(new V3(cs * rr, prof[i][1], sn * rr).applyMatrix4(this.m), nrm, cc, k / seg * (o.uRep || 1), prof[i][1] * (o.vScale || 0.05));
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
      const p = base + i * (seg + 1) + k, q = p + seg + 1;
      if (o.flip) B.i.push(p, p + 1, q, p + 1, q + 1, q); else B.i.push(p, q, p + 1, p + 1, q, q + 1);
    }
    this.pop();
  }
  // tube along points [[x, y, z, r], ...]
  pipe(kind, pts, seg, col, close = true) {
    const B = this.k[kind], nm = new THREE.Matrix3().getNormalMatrix(this.m), base = B.p.length / 3;
    const t = new V3(), nrm = new V3(), bin = new V3(), tmp = new V3(), P = pts.map((q) => new V3(q[0], q[1], q[2]));
    for (let i = 0; i < P.length; i++) {
      t.subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
      if (i === 0) { tmp.set(Math.abs(t.y) > 0.9 ? 1 : 0, Math.abs(t.y) > 0.9 ? 0 : 1, 0); nrm.crossVectors(t, tmp).normalize(); } else nrm.addScaledVector(t, -nrm.dot(t)).normalize();
      bin.crossVectors(t, nrm);
      for (let k = 0; k <= seg; k++) {
        const an = k / seg * Math.PI * 2, d = new V3().addScaledVector(nrm, Math.cos(an)).addScaledVector(bin, Math.sin(an));
        const cc = typeof col === 'function' ? col(i / (P.length - 1), an) : col;
        B.v(P[i].clone().addScaledVector(d, pts[i][3]).applyMatrix4(this.m), d.clone().applyMatrix3(nm).normalize(), cc, k / seg, i * 0.1);
      }
    }
    for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < seg; k++) { const p = base + i * (seg + 1) + k, q = p + seg + 1; B.i.push(p, q, p + 1, p + 1, q, q + 1); }
    if (close) for (const [i, s] of [[0, -1], [P.length - 1, 1]]) {
      const c = B.v(P[i].clone().applyMatrix4(this.m), new V3().subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize().multiplyScalar(s).applyMatrix3(nm).normalize(), typeof col === 'function' ? col(i / (P.length - 1), 0) : col);
      const r0 = base + i * (seg + 1);
      for (let k = 0; k < seg; k++) if (s > 0) B.i.push(c, r0 + k, r0 + k + 1); else B.i.push(c, r0 + k + 1, r0 + k);
    }
  }
  sphere(kind, x, y, z, rx, ry, rz, col, seg = 16, rings = 10) {
    const prof = [];
    for (let i = 0; i <= rings; i++) { const a = -Math.PI / 2 + Math.PI * i / rings; prof.push([Math.max(Math.cos(a), 0.0001) * rx, Math.sin(a) * ry]); }
    this.push(new THREE.Matrix4().makeScale(1, 1, rz / rx));
    this.lathe(kind, x, y, z * rx / rz, prof, seg, col);
    this.pop();
  }
  // flat polygon (both faces) in the local XZ plane at height y
  disc(kind, x, y, z, r, col, seg = 20, up = true) {
    const B = this.k[kind], nm = new THREE.Matrix3().getNormalMatrix(this.m), n = new V3(0, up ? 1 : -1, 0).applyMatrix3(nm).normalize();
    const c = B.v(new V3(x, y, z).applyMatrix4(this.m), n, col), base = B.p.length / 3;
    for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; B.v(new V3(x + Math.cos(a) * r, y, z + Math.sin(a) * r).applyMatrix4(this.m), n, col); }
    for (let k = 0; k < seg; k++) if (up) B.i.push(c, base + k + 1, base + k); else B.i.push(c, base + k, base + k + 1);
  }
  rot(rx, ry, rz, x = 0, y = 0, z = 0) { return this.push(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new V3(1, 1, 1))); }
  build() { const o = {}; for (const k in this.k) o[k] = this.k[k].geometry(); return o; }
}

// ------------------------------------------------------------------ blueprints (one unit = one millimetre)
function antHill(A, r) {
  // a heap of pine needles, twigs and grains
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push([Math.max(0.01, 170 * Math.pow(1 - t, 0.75) * (1 + 0.06 * Math.sin(t * 9))), 120 * Math.sin(t * Math.PI / 2) - 4]); }
  A.lathe('paint', 0, 0, 0, prof, 40, (t, an) => { const k = 0.75 + 0.3 * Math.sin(an * 37 + t * 51) * Math.sin(an * 23 - t * 29); return [C.needle[0] * k, C.needle[1] * k, C.needle[2] * k]; },
    { disp: (t, an) => 1 + 0.07 * Math.sin(an * 5 + t * 7) + 0.04 * Math.sin(an * 13 - t * 11) });
  for (let k = 0; k < 7; k++) { // dark gates
    const a = k * 0.9 + r() * 0.5, t = 0.25 + 0.5 * r(), rr = 170 * Math.pow(1 - t, 0.75) * 0.99, y = 120 * Math.sin(t * Math.PI / 2) - 4;
    A.rot(0, -a, -Math.PI / 2 + t * 1.4, Math.cos(a) * rr, y, Math.sin(a) * rr); A.disc('paint', 0, 0.6, 0, 6 + 4 * r(), C.black, 10); A.pop();
  }
  for (let k = 0; k < 45; k++) { // needles and twigs sticking out
    const a = r() * 6.28, t = r() * 0.85, rr = 170 * Math.pow(1 - t, 0.75), y = 120 * Math.sin(t * Math.PI / 2) - 6, L = 25 + 50 * r();
    const d = new V3(Math.cos(a) * 0.8, 0.4 + r() * 0.6, Math.sin(a) * 0.8).normalize();
    const p0 = [Math.cos(a) * rr * 0.92, y, Math.sin(a) * rr * 0.92];
    A.pipe('paint', [[p0[0], p0[1], p0[2], 1.1], [p0[0] + d.x * L, p0[1] + d.y * L * 0.4, p0[2] + d.z * L, 0.7]], 4, k % 4 ? C.needle : C.bark);
  }
  return { dome: { R: 165, H: 116 } };
}
function gnome(A, r) {
  A.lathe('gloss', 0, 0, 0, [[62, -6], [64, 8], [60, 12], [0.1, 12]], 28, [0.42, 0.42, 0.40]); // base
  for (const s of [-1, 1]) A.sphere('gloss', s * 20, 18, 12, 18, 10, 26, C.boot, 14, 8);
  A.lathe('gloss', 0, 12, 0, [[34, 0], [44, 20], [50, 60], [48, 100], [40, 130], [26, 150], [0.1, 152]], 28, (t) => (t > 0.35 && t < 0.42 ? [0.20, 0.13, 0.07] : C.coat)); // body with a belt
  A.sphere('gloss', 0, 72, 46, 7, 7, 3, C.gold, 10, 6); // buckle
  for (const s of [-1, 1]) { A.pipe('gloss', [[s * 46, 140, 0, 11], [s * 56, 110, 14, 10], [s * 44, 92, 30, 9]], 10, C.coat); A.sphere('gloss', s * 40, 88, 34, 10, 10, 10, C.skin, 10, 6); }
  A.sphere('gloss', 0, 182, 6, 32, 30, 30, C.skin, 22, 14); // head
  A.sphere('gloss', 0, 178, 34, 9, 8, 9, [0.98, 0.58, 0.50], 12, 8); // nose
  for (const s of [-1, 1]) { A.sphere('gloss', s * 12, 190, 28, 3.2, 3.6, 2, C.black, 8, 5); A.sphere('gloss', s * 21, 176, 26, 7, 5, 3, [0.98, 0.55, 0.50], 8, 5); }
  // beard
  A.rot(0.35, 0, 0, 0, 170, 18); A.lathe('gloss', 0, -70, 0, [[2, 0], [22, 30], [34, 62], [36, 74], [0.1, 76]], 22, C.white, { disp: (t, an) => 1 + 0.08 * Math.sin(an * 9 + t * 4) }); A.pop();
  // the red hat, bending forward at the tip
  const hp = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; hp.push([Math.sin(t * 1.2) * 70 * t, 196 + t * 150 - t * t * 20, t * t * 40, Math.max(1, 38 * (1 - t))]); }
  A.pipe('gloss', hp, 22, C.red);
  A.lathe('gloss', 0, 194, 0, [[38, 0], [36, 8], [0.1, 9]], 22, [0.6, 0.06, 0.05]);
  return { walk: [{ lx: 0, lz: 0, hw: 58, hd: 58, top: 12 }] };
}
function teacup(A, r) {
  // the saucer, then the cup lying on its side, rolled over in the grass
  A.lathe('gloss', 30, 0, 90, [[0.1, 0], [40, 0], [70, 6], [78, 11], [76, 13], [66, 9], [36, 4], [0.1, 4]], 40, (t) => (t > 0.55 && t < 0.7 ? C.blue : C.porcelain));
  A.rot(0, 0.6, Math.PI / 2 - 0.08, -10, 44, -30);
  const prof = [[0.1, -44], [28, -44], [30, -41], [42, -20], [46, 10], [48, 38], [47, 40], [44, 40], [42, 14], [38, -14], [26, -38], [0.1, -38]];
  A.lathe('gloss', 0, 0, 0, prof, 44, (t) => (t > 0.38 && t < 0.48 ? C.blue : t > 0.5 && t < 0.58 ? [0.85, 0.66, 0.30] : C.porcelain));
  const hp = []; for (let i = 0; i <= 12; i++) { const a = -1.2 + 2.4 * i / 12; hp.push([46 + 18 * Math.cos(a), 10 + 22 * Math.sin(a), 0, 4.5]); }
  A.pipe('gloss', hp, 10, C.porcelain);
  A.pop();
  return {};
}
function flowerPot(A, r) {
  A.lathe('paint', 0, 0, 0, [[0.1, -4], [62, -4], [64, 0], [88, 150], [96, 152], [98, 172], [86, 174], [84, 160], [0.1, 160]], 40, (t) => (t > 0.5 ? [0.74, 0.40, 0.24] : C.terracotta));
  A.disc('paint', 0, 162, 0, 84, C.soil, 30);
  // a seedling with two leaves
  A.pipe('paint', [[0, 160, 0, 3], [4, 200, 2, 2.6], [2, 240, -2, 2.2]], 8, [0.55, 0.72, 0.30]);
  for (const s of [-1, 1]) { A.rot(0, 0, s * 0.35, 2, 240, -2); A.sphere('paint', s * 30, 6, 0, 30, 3, 16, C.green, 14, 6); A.pop(); }
  return { walk: [{ lx: 0, lz: 0, hw: 70, hd: 70, top: 0 }] };
}
function wateringCan(A, r) {
  A.lathe('roof', 0, 0, 0, [[0.1, 0], [100, 0], [104, 6], [100, 200], [96, 214], [70, 236], [0.1, 238]], 40, C.zinc);
  A.lathe('roof', 0, 236, 0, [[30, 0], [32, 22], [0.1, 22]], 20, C.zinc);
  A.pipe('roof', [[80, 40, 0, 14], [180, 160, 0, 9], [250, 270, 0, 7]], 14, C.zinc); // spout
  A.rot(0, 0, -0.55, 262, 288, 0); A.lathe('roof', 0, -10, 0, [[8, 0], [30, 14], [32, 18], [0.1, 19]], 22, [0.72, 0.62, 0.38]); A.pop(); // the rose
  const hp = []; for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; hp.push([-104 - 70 * Math.sin(a) + 40, 120 + 140 * Math.cos(a) * 0.9 + 40, 0, 8]); }
  A.pipe('roof', hp, 10, C.zinc);
  A.pipe('roof', [[-60, 236, 0, 8], [40, 250, 0, 8]], 10, C.zinc);
  for (let k = 0; k < 4; k++) A.lathe('roof', 0, 30 + k * 50, 0, [[101.5 + k * 0.2, 0], [102.5, 3], [101.5, 6]], 40, [0.58, 0.62, 0.62]);
  return { walk: [{ lx: 0, lz: 0, hw: 70, hd: 70, top: 6 }] };
}
function marble(A, r, x = 0, z = 0) {
  // a ribbon of colour twisted inside clear glass
  const hue = [[0.10, 0.45, 0.95], [0.95, 0.35, 0.10], [0.15, 0.75, 0.35], [0.95, 0.80, 0.15]][(r() * 4) | 0];
  const R = 8 + r() * 2;
  for (let k = 0; k < 3; k++) {
    const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * 5 + k * 2.09; pts.push([x + Math.cos(a) * R * 0.45 * Math.sin(t * Math.PI), R + (t - 0.5) * R * 1.6, z + Math.sin(a) * R * 0.45 * Math.sin(t * Math.PI), R * 0.12 * Math.sin(t * Math.PI) + 0.2]); }
    A.pipe('gloss', pts, 6, hue);
  }
  A.sphere('glass', x, R, z, R, R, R, [0.80, 0.95, 0.92], 28, 18);
  return R;
}
function coin(A, r) {
  const gold = r() < 0.5, col = gold ? C.gold : C.silver, R = 11.5, H = 1.8;
  A.rot((r() - 0.5) * 0.1, 0, (r() - 0.5) * 0.12, 0, 0.6, 0);
  A.lathe('roof', 0, 0, 0, [[0.1, 0], [R, 0], [R, H], [R - 1, H + 0.3], [R - 1.4, H], [0.1, H]], 48, col);
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.2832; A.box('roof', Math.cos(a) * 7.5, H, Math.sin(a) * 7.5, 1.2, 0.35, 1.2, col); } // a ring of stars
  A.box('roof', 0, H, 0, 6, 0.4, 1.2, col); A.box('roof', 0, H, 0, 1.2, 0.4, 6, col);
  A.pop();
  return { walk: [{ lx: 0, lz: 0, hw: 10, hd: 10, top: H + 0.6 }] };
}
function button(A, r) {
  const col = [[0.75, 0.12, 0.10], [0.15, 0.35, 0.75], [0.95, 0.75, 0.15], [0.20, 0.55, 0.30]][(r() * 4) | 0];
  A.lathe('gloss', 0, 0.3, 0, [[0.1, 0], [10.5, 0], [11, 1.6], [10, 3], [8, 2.2], [0.1, 2.2]], 40, col);
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) A.disc('gloss', x, 2.55, z, 1.2, C.black, 10);
  return { walk: [{ lx: 0, lz: 0, hw: 9, hd: 9, top: 3 }] };
}
function dice(A, r) {
  const S = 16;
  A.rot(0, r() * 6.28, 0, 0, 0, 0);
  A.box('gloss', 0, 0, 0, S, S, S, C.white);
  const pip = (x, y, z, nx, ny, nz) => { A.rot(Math.atan2(Math.hypot(nx, nz), ny) * (nz < 0 ? -1 : 1) * (nx ? 0 : 1), 0, nx ? -Math.sign(nx) * Math.PI / 2 : 0, x, y, z); A.disc('gloss', 0, 0.08, 0, 1.6, C.black, 10); A.pop(); };
  const f = (n, put) => { const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n]; for (const [a, b] of P) put(a * 4, b * 4); };
  f(5, (a, b) => pip(a, S, b, 0, 1, 0));
  f(3, (a, b) => pip(a, S / 2 + b, S / 2, 0, 0, 1));
  f(4, (a, b) => pip(S / 2, S / 2 + b, a, 1, 0, 0));
  f(2, (a, b) => pip(-S / 2, S / 2 + b, a, -1, 0, 0));
  A.pop();
  return { walk: [{ lx: 0, lz: 0, hw: 7.5, hd: 7.5, top: S }] };
}
function thimble(A, r) {
  const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([t < 0.85 ? lerp(8.5, 7.5, t / 0.85) : 7.5 * Math.cos((t - 0.85) / 0.15 * Math.PI / 2), t < 0.85 ? t / 0.85 * 16 : 16 + 3 * Math.sin((t - 0.85) / 0.15 * Math.PI / 2)]); }
  A.rot(0, 0, Math.PI / 2 - 0.05, 0, 8.5, 0);
  A.lathe('roof', 0, -9, 0, prof, 36, (t, an) => { const k = 0.85 + 0.15 * Math.sign(Math.sin(an * 18) * Math.sin(t * 40)); return [C.silver[0] * k, C.silver[1] * k, C.silver[2] * k]; });
  A.pop();
  return {};
}
function bottleCap(A, r) {
  const col = [[0.75, 0.10, 0.08], [0.15, 0.45, 0.25], [0.85, 0.70, 0.20]][(r() * 3) | 0];
  // upside down: the crimped skirt points up, a cork disc inside
  A.lathe('roof', 0, 0, 0, [[0.1, 0], [13, 0], [14, 1.5], [15.5, 6]], 42, col, { disp: (t, an) => 1 + 0.05 * t * Math.sign(Math.sin(an * 21)) });
  A.lathe('roof', 0, 0, 0, [[15.3, 6], [13.6, 1.6], [12.6, 0.5], [0.1, 0.5]], 42, [0.78, 0.76, 0.72], { flip: false, disp: (t, an) => 1 + 0.05 * (1 - t) * Math.sign(Math.sin(an * 21)) });
  A.disc('paint', 0, 0.9, 0, 12, [0.72, 0.58, 0.40], 26);
  return {};
}
function pencil(A, r) {
  A.rot(0, 0, Math.PI / 2, 0, 3.6, 0);
  A.cyl('paint', 0, -40, 0, 3.6, 3.6, 60, C.pencil, 6);
  A.cyl('paint', 0, 20, 0, 3.55, 1.2, 12, C.wood, 6, { noCap: true });
  A.cyl('paint', 0, 31.5, 0, 1.2, 0.0, 3.5, C.graphite, 6);
  A.cyl('roof', 0, -48, 0, 3.8, 3.8, 9, C.zinc, 12);
  A.cyl('paint', 0, -55, 0, 3.4, 3.4, 7, [0.92, 0.55, 0.62], 12);
  A.pop();
  return {};
}
function acorn(A, r) {
  A.rot(0.2, r() * 6, Math.PI / 2 - 0.15, 0, 7, 0);
  A.lathe('gloss', 0, 0, 0, [[0.1, -2], [6, 0], [8.5, 8], [7.5, 18], [3, 25], [0.1, 26]], 22, (t) => [C.acorn[0] * (0.8 + 0.3 * t), C.acorn[1] * (0.8 + 0.3 * t), C.acorn[2]]);
  A.lathe('paint', 0, 0, 0, [[0.1, -5], [6, -5], [9.5, -1], [9.6, 2], [8, 4]], 22, (t, an) => { const k = 0.8 + 0.25 * Math.sign(Math.sin(an * 14 + t * 12)); return [C.cap[0] * k, C.cap[1] * k, C.cap[2] * k]; }, { disp: (t, an) => 1 + 0.05 * Math.sin(an * 14 + t * 12) });
  A.pipe('paint', [[0, -5, 0, 1.2], [1, -10, 0, 1]], 6, C.cap);
  A.pop();
  return {};
}
function snailShell(A, r) {
  // a logarithmic spiral tube, wound around a slanted axis
  const pts = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * 3.3 * Math.PI * 2, rr = 0.9 * Math.exp(t * 2.6), y = rr * 0.6 + (1 - t) * 3; pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr, rr * 0.62 + 0.2]); }
  A.rot(-0.15, 0, 1.25, 0, 10, 0);
  A.pipe('gloss', pts, 14, (t, an) => { const b = Math.sin(t * 60 + an * 0.5); return b > 0.6 ? C.shellDark : [C.shell[0] * (0.8 + 0.2 * t), C.shell[1] * (0.8 + 0.2 * t), C.shell[2] * (0.8 + 0.2 * t)]; });
  A.pop();
  return {};
}
function feather(A, r) {
  const L = 120, pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([(t - 0.4) * L, 1 + 6 * t * t, 3 * Math.sin(t * 3), 1.2 * (1 - t * 0.8)]); }
  A.rot(0, r() * 6.28, 0, 0, 0, 0);
  A.pipe('paint', pts, 6, [0.92, 0.90, 0.84]);
  const B = A.k.paint, nm = new THREE.Matrix3().getNormalMatrix(A.m);
  for (const s of [-1, 1]) for (let i = 1; i < 10; i++) { // the vane, barb by barb, curling slightly
    const t = i / 10, a = pts[i], w = (s > 0 ? 16 : 11) * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 2;
    const b = pts[i + 1];
    const quad = [new V3(a[0], a[1], a[2]), new V3(b[0], b[1], b[2]), new V3(b[0] + 10 * s * 0, b[1] + 1.5, b[2] + s * (w - 1)), new V3(a[0] - 6, a[1] + 1.5, a[2] + s * w)];
    const col = [0.62 + 0.25 * t, 0.58 + 0.24 * t, 0.52 + 0.24 * t];
    const ids = quad.map((p) => B.v(p.clone().applyMatrix4(A.m), new V3(0, 1, 0).applyMatrix3(nm).normalize(), col));
    B.i.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2], ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  A.pop();
  return {};
}
function paperBoat(A) {
  const P = (x, y, z) => new V3(x, y, z), paper = (k) => [C.paper[0] * k, C.paper[1] * k, C.paper[2] * k];
  const L = 48, W = 16, H = 14;
  // the folded hull and the triangular sail of a newspaper boat
  A.quad('paint', P(-L, H, 0), P(L, H, 0), P(30, -2, W), P(-30, -2, W), paper(0.95));
  A.quad('paint', P(L, H, 0), P(-L, H, 0), P(-30, -2, -W), P(30, -2, -W), paper(0.85));
  A.quad('paint', P(-30, -2, W), P(30, -2, W), P(30, -2, -W), P(-30, -2, -W), paper(0.6));
  A.quad('paint', P(-26, H * 0.6, 0.2), P(26, H * 0.6, 0.2), P(0, H + 34, 0.2), P(0, H + 34, 0.2), paper(1.0));
  A.quad('paint', P(26, H * 0.6, -0.2), P(-26, H * 0.6, -0.2), P(0, H + 34, -0.2), P(0, H + 34, -0.2), paper(0.92));
  for (let k = 0; k < 6; k++) A.box('paint', 0, -1.9 + k * 4.3, W * (1 - (k * 4.3 + 2) / (H + 2)) + 0.25, 50 - k * 4, 0.25, 0.2, [0.55, 0.55, 0.58], { rx: -0.85 }); // a few printed lines
}

function bridge(A, b) {
  const L = b.len;
  const yAt = (t) => lerp(b.ha, b.hb, t) - b.ha + b.rise * 4 * t * (1 - t);
  if (b.style === 0) { // a burnt-out match laid across, or a fresh one
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([t * L, yAt(t) + 1.1, 0, 1.1]); }
    A.pipe('paint', pts.map((p) => [p[0], p[1], p[2], 1.2]), 4, C.match);
    A.sphere('paint', L + 1.5, yAt(1) + 1.2, 0, 3.2, 2.0, 2.0, C.matchHead, 10, 6);
  } else { // a twig fallen across the rivulet
    const R = b.width / 2, r = mulberry32(Math.floor(b.seed * 1e6));
    const pts = []; for (let i = 0; i <= 10; i++) { const t = -0.08 + 1.16 * i / 10; pts.push([t * L, yAt(clamp(t, 0, 1)) + R * 0.8 + (r() - 0.5) * 0.5, (r() - 0.5) * 0.6, R * (1 - 0.2 * t)]); }
    A.pipe('paint', pts, 10, (t, an) => { const k = 0.75 + 0.3 * Math.sin(an * 11 + t * 40) * Math.sin(t * 90); return [C.bark[0] * k, C.bark[1] * k, C.bark[2] * k]; });
    for (let k = 0; k < 3; k++) { const t = 0.2 + 0.6 * r(), p = pts[Math.round(t * 10)], s = r() < 0.5 ? 1 : -1; A.pipe('paint', [[p[0], p[1], p[2], R * 0.4], [p[0] + 10 + 15 * r(), p[1] + 4 + 8 * r(), p[2] + s * (14 + 20 * r()), R * 0.22]], 6, C.bark); }
  }
}

// ------------------------------------------------------------------ materials
function metalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = mulberry32(9);
  g.fillStyle = '#c8cccc'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,64,64' : '250,252,250'},${0.03 + r() * 0.07})`; g.fillRect(r() * 256, r() * 256, 3 + r() * 40, 1 + r() * 3); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,90,60,${0.05 + r() * 0.08})`; g.beginPath(); g.arc(r() * 256, r() * 256, 4 + r() * 20, 0, 6.3); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const SNOW_PATCH = /* glsl */`#include <normal_fragment_maps>
  {
    vec3 wn = inverseTransformDirection(normal, viewMatrix);
    float sn = uSnow * 0.85 * smoothstep(0.35, 0.8, wn.y + (texture2D(uNoiseTex, vWPos.xz * 0.21).r - 0.5) * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.96), sn);
  }`;
const REFLECT = (amt) => `#include <emissivemap_fragment>
  {
    vec3 Vr = normalize(vViewPosition);
    vec3 rw = inverseTransformDirection(reflect(-Vr, normal), viewMatrix); rw.y = abs(rw.y);
    float fr = 0.04 + 0.96 * pow(1.0 - max(dot(normal, Vr), 0.0), 5.0);
    totalEmissiveRadiance += skyLUT(rw) * ${amt};
  }`;
function makeMaterials() {
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide });
  patch(paint, 'paint', (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          float nz = texture2D(uNoiseTex, vWPos.xz * 0.37 + vWPos.y * 0.23).r;
          float nz2 = texture2D(uNoiseTex, vWPos.xy * 1.1 + vWPos.z * 0.7).g;
          diffuseColor.rgb *= 0.84 + 0.2 * nz + 0.1 * nz2;
        }`)
      .replace('#include <normal_fragment_maps>', SNOW_PATCH);
  });
  const roof = new THREE.MeshStandardMaterial({ map: metalTexture(), vertexColors: true, roughness: 0.38, metalness: 0.6, side: THREE.DoubleSide });
  patch(roof, 'metal', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', SNOW_PATCH).replace('#include <emissivemap_fragment>', REFLECT('diffuseColor.rgb * (0.35 + fr * 0.6)'));
  });
  const gloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.0, side: THREE.DoubleSide });
  patch(gloss, 'gloss', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', SNOW_PATCH).replace('#include <emissivemap_fragment>', REFLECT('fr * 0.55'));
  });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  patch(glow, 'glow', null);
  // clear glass: sky reflection by Fresnel, the world behind it slightly tinted, a hot glint
  const glass = new THREE.ShaderMaterial({
    uniforms: { ...U }, transparent: true, depthWrite: false, fog: false, side: THREE.FrontSide,
    vertexShader: 'attribute vec3 color; varying vec3 vN; varying vec3 vWPos; varying vec3 vCol; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vWPos = wp.xyz; vCol = color; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: /* glsl */`precision highp float; varying vec3 vN; varying vec3 vWPos; varying vec3 vCol; ${GLSL_COMMON}
      void main() {
        vec3 n = normalize(vN), V = normalize(cameraPosition - vWPos);
        float ndv = abs(dot(n, V)), fr = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        vec3 r = reflect(-V, n); vec3 rr = vec3(r.x, abs(r.y), r.z);
        float glint = pow(max(dot(r, uSunDirW), 0.0), 220.0) * 30.0 + pow(max(dot(r, uSunDirW), 0.0), 20.0) * 0.4;
        float caust = pow(max(dot(-V, uSunDirW) * 0.5 + 0.5, 0.0), 6.0);
        vec3 col = skyLUT(rr) * (0.15 + fr) + uSunCol * glint * cloudShadow(vWPos) + vCol * (uAmbCol * 0.25 + uSunCol * caust * 0.3);
        gl_FragColor = vec4(applyFog(col, vWPos), clamp(0.12 + fr * 0.75 + glint * 0.1, 0.0, 0.97));
      }`,
  });
  return { paint, roof, glow, gloss, glass };
}

// ------------------------------------------------------------------ manager
const KINDS = ['paint', 'roof', 'gloss', 'glow', 'glass'];
export class Structures {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.world = ctx.world;
    this.mat = makeMaterials();
    this.cache = new Map();
    this.sites = new Map(); this.minis = new Map(); this.bridges = new Map(); this.toriis = new Map();
    this.tick = 0;
    this.onSite = []; // callbacks(site, group) for other systems (fauna)
  }
  // blueprints with a seed are built per object; plain ones once and shared
  make(fn, seed) {
    const k = fn.name + ':' + (seed === undefined ? '' : Math.floor(seed * 1e6));
    let g = this.cache.get(k);
    if (!g) { const A = new Arch(); const info = fn(A, mulberry32(Math.floor((seed || 0) * 1e6) + 7)) || {}; g = A.build(); g.info = info; if (seed === undefined) this.cache.set(k, g); else g.own = true; }
    return g;
  }
  addParts(group, geo, x, y, z, ry = 0, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s);
    for (const k of KINDS) {
      if (!geo[k]) continue;
      const m = new THREE.Mesh(geo[k], this.mat[k]);
      m.castShadow = k !== 'glow' && k !== 'glass'; m.receiveShadow = k !== 'glow' && k !== 'glass';
      if (k === 'glass') m.renderOrder = 5;
      g.add(m);
    }
    group.add(g);
    return g;
  }
  buildSite(s) {
    const g = new THREE.Group();
    g.position.set(s.x, s.h, s.z); g.rotation.y = s.rot;
    const walk = [], domes = [], own = [];
    const put = (fn, x, z, ry = 0, sc = 1, seeded = true) => {
      const geo = this.make(fn, seeded ? (s.v * 7.31 + x * 0.013 + z * 0.017) % 1 : undefined);
      if (geo.own) own.push(geo);
      this.addParts(g, geo, x, 0, z, ry, sc);
      const inf = geo.info || {};
      for (const w of inf.walk || []) walk.push({ lx: x + w.lx * sc, lz: z + w.lz * sc, hw: w.hw * sc, hd: w.hd * sc, top: w.top * sc });
      if (inf.dome) domes.push({ lx: x, lz: z, R: inf.dome.R * sc, H: inf.dome.H * sc });
    };
    const r = mulberry32(Math.floor(s.v * 1e6) + 3);
    if (s.type === 0) { put(antHill, 0, 0, 0, 0.9 + 0.3 * r()); s.what = 'Ameisenhügel'; }
    else if (s.type === 1) {
      const v = s.v;
      if (v < 0.3) { put(gnome, 0, 0, 0, 1); s.what = 'Gartenzwerg'; }
      else if (v < 0.55) { put(teacup, 0, 0, r() * 6.28); s.what = 'Teetasse'; }
      else if (v < 0.8) { put(flowerPot, 0, 0, r() * 6.28); s.what = 'Blumentopf'; }
      else { put(wateringCan, 0, 0, r() * 6.28); s.what = 'Giesskanne'; }
    } else if (s.type === 2) {
      const v = s.v, fns = [marbleSet, coin, button, dice, thimble, bottleCap, pencil], names = ['Murmeln', 'Münze', 'Knopf', 'Würfel', 'Fingerhut', 'Kronkorken', 'Bleistift'];
      const i = Math.min(fns.length - 1, Math.floor(v * fns.length));
      put(fns[i], 0, 0, r() * 6.28); s.what = names[i];
    } else {
      const v = s.v, fns = [acorn, snailShell, feather, acorn], names = ['Eichel', 'Schneckenhaus', 'Feder', 'Eicheln'];
      const i = Math.min(3, Math.floor(v * 4));
      put(fns[i], 0, 0, r() * 6.28, s.sc);
      if (i === 3) { put(acorn, 18, 12, 1.3, 0.9); put(acorn, -14, 20, 2.4, 1.1); }
      s.what = names[i];
    }
    s.guards = [];
    g.updateMatrixWorld(true);
    g.traverse((o) => { o.matrixAutoUpdate = false; });
    this.scene.add(g);
    const rec = { site: s, group: g, walk, domes, own, sin: Math.sin(s.rot), cos: Math.cos(s.rot), gates: [] };
    for (const cb of this.onSite) cb(rec, true);
    return rec;
  }
  buildBridge(b) {
    const A = new Arch(); bridge(A, b);
    const geo = A.build();
    const m = new THREE.Mesh(geo.paint, this.mat.paint);
    m.position.set(b.ax, b.ha, b.az); m.rotation.y = -Math.atan2(b.dz, b.dx);
    m.castShadow = true; m.receiveShadow = true; m.updateMatrixWorld(); m.matrixAutoUpdate = false;
    this.scene.add(m);
    return { b, mesh: m, extra: null };
  }
  buildTorii(t) { // a paper boat drifting on the pond
    const g = new THREE.Group();
    g.position.set(t.x, 0.02, t.z); g.rotation.y = t.rot;
    this.addParts(g, this.make(paperBoat), 0, 0, 0, 0, 1.6);
    this.scene.add(g);
    return { t, group: g, ph: (t.x * 0.37 + t.z * 0.11) % 6.28 };
  }
  sync(map, cell, range, getter, builder, disposer) {
    const cam = this.ctx.camera.position;
    const ci = Math.floor(cam.x / cell), cj = Math.floor(cam.z / cell), n = Math.ceil(range / cell);
    const seen = new Set();
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const it = getter(i, j);
      if (!it) continue;
      if (Math.hypot(it.x - cam.x, it.z - cam.z) > range) continue;
      seen.add(it.id);
      if (!map.has(it.id)) map.set(it.id, builder(it));
    }
    for (const [id, rec] of map) {
      if (seen.has(id)) continue;
      const it = rec.site || rec.b || rec.t;
      if (Math.hypot(it.x - cam.x, it.z - cam.z) > range * 1.15) { disposer(rec); map.delete(id); }
    }
  }
  layers() {
    if (this._layers) return this._layers;
    const W = this.world;
    const dropSite = (r) => { for (const cb of this.onSite) cb(r, false); this.scene.remove(r.group); for (const geo of r.own) for (const k of KINDS) if (geo[k]) geo[k].dispose(); };
    this._layers = [
      { map: this.sites, cell: SITE_CELL, range: 2400, get: (i, j) => W.siteAt(i, j), build: (s) => this.buildSite(s), drop: dropSite },
      { map: this.minis, cell: MINI_CELL, range: 900, get: (i, j) => W.miniAt(i, j), build: (s) => this.buildSite(s), drop: dropSite },
      { map: this.bridges, cell: BRIDGE_CELL, range: 900, get: (i, j) => W.bridgeAt(i, j), build: (b) => this.buildBridge(b), drop: (r) => { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); } },
      { map: this.toriis, cell: TORII_CELL, range: 2000, get: (i, j) => W.waterToriiAt(i, j), build: (t) => this.buildTorii(t), drop: (r) => { this.scene.remove(r.group); } },
    ];
    return this._layers;
  }
  update(dt, time) {
    for (const rec of this.toriis.values()) { // the boats bob and turn a little
      const g = rec.group;
      g.position.y = 0.3 + Math.sin(time * 1.3 + rec.ph) * 0.5; g.rotation.z = Math.sin(time * 0.9 + rec.ph) * 0.05; g.rotation.x = Math.sin(time * 1.1 + rec.ph * 2) * 0.04; g.rotation.y = rec.t.rot + Math.sin(time * 0.05 + rec.ph) * 0.4;
    }
    if ((this.tick++ % 20) !== 0) return;
    for (const L of this.layers()) this.sync(L.map, L.cell, L.range, L.get, L.build, L.drop);
  }
  clear() {
    for (const L of this.layers()) { for (const r of L.map.values()) L.drop(r); L.map.clear(); }
    this.tick = 0;
  }
  // floating origin moved: slide every built object and its bookkeeping
  rebase(sx, sz) {
    const move = (o) => { if (!o) return; o.position.x -= sx; o.position.z -= sz; o.updateMatrix(); o.updateMatrixWorld(true); };
    for (const L of this.layers()) for (const r of L.map.values()) {
      const it = r.site || r.b || r.t;
      it.x -= sx; it.z -= sz;
      if (r.b) { it.ax -= sx; it.az -= sz; it.bx -= sx; it.bz -= sz; }
      move(r.group); move(r.mesh);
    }
    this.tick = 0;
  }
  // nearest named find (for the HUD)
  nearestFind(x, z, maxD) {
    let best = null, bd = maxD;
    for (const map of [this.sites, this.minis]) for (const rec of map.values()) { const d = Math.hypot(rec.site.x - x, rec.site.z - z) - rec.site.r1 * 0.5; if (d < bd) { bd = d; best = rec.site; } }
    return best;
  }
  groundAt(x, z, h) {
    let best = h;
    for (const rec of this.bridges.values()) {
      const b = rec.b;
      if (Math.abs(x - b.x) > b.len || Math.abs(z - b.z) > b.len) continue;
      const d = this.world.bridgeDeck(b, x, z);
      if (d > best) best = d;
    }
    for (const map of [this.sites, this.minis]) for (const rec of map.values()) {
      const s = rec.site;
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz > s.r2 * s.r2) continue;
      const lx = dx * rec.cos - dz * rec.sin, lz = dx * rec.sin + dz * rec.cos;
      for (const w of rec.walk) {
        const ax = Math.abs(lx - w.lx), az = Math.abs(lz - w.lz);
        if (ax < w.hw && az < w.hd) best = Math.max(best, s.h + w.top);
      }
      for (const d of rec.domes) { const q = Math.hypot(lx - d.lx, lz - d.lz) / d.R; if (q < 1) best = Math.max(best, s.h + d.H * Math.sqrt(1 - q * q) - 3); }
    }
    return best;
  }
}
function marbleSet(A, r) { marble(A, r, 0, 0); if (r() < 0.7) marble(A, r, 24 + 6 * r(), 10 * r()); if (r() < 0.4) marble(A, r, -12, 22); return {}; }
