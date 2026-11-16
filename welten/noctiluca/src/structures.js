// Architecture of a vanished culture: ring gates, obelisks, stone circles, observatories, bridges. All procedural geometry.
import * as THREE from 'three';
import { U, patch, GLSL_COMMON } from './shaders.js';
import { SITE_CELL, MINI_CELL, BRIDGE_CELL, TORII_CELL } from './world.js';
import { mulberry32, lerp, clamp } from './noise.js';

const V3 = THREE.Vector3;
const C = {
  stone: [0.50, 0.47, 0.46], stoneDark: [0.30, 0.29, 0.31], stoneLight: [0.68, 0.64, 0.60], metal: [0.42, 0.62, 0.60], gold: [0.95, 0.74, 0.34],
  cyan: [0.30, 1.0, 0.88], magenta: [1.0, 0.42, 0.90], amber: [1.0, 0.72, 0.32], pale: [0.75, 1.0, 0.96],
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
  constructor() { this.k = { paint: new Buf(), roof: new Buf(), glow: new Buf() }; this.m = new THREE.Matrix4(); this.st = []; }
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
  build() { return { paint: this.k.paint.geometry(), roof: this.k.roof.geometry(), glow: this.k.glow.geometry() }; }
}

// ------------------------------------------------------------------ blueprints: what the vanished builders left behind
// ring gate: the counterpart of a torii. Walk through it and it answers with a chime.
function ringGate(A, S = 1, o = {}) {
  const R = 2.55 * S, w = 0.42 * S, d = 0.5 * S, cy = R + w / 2 - 0.3 * S;
  A.ring('paint', 0, cy, 0, R, w, d, C.stone, { seg: 30, a0: o.a0, a1: o.a1 });
  A.ring('glow', 0, cy, 0, R, w * 0.15, d + 0.05 * S, o.glyph || C.cyan, { seg: 30, a0: o.a0, a1: o.a1 });
  for (const sx of [-1, 1]) {
    A.box('paint', sx * R * 0.8, -1.2, 0, 1.25 * S, 1.2 + 0.86 * S, 1.0 * S, C.stoneDark);
    A.box('paint', sx * R * 0.8, 0.86 * S, 0, 1.0 * S, 0.14 * S, 0.8 * S, C.stoneLight);
    A.box('glow', sx * R * 0.8, 0.3 * S, 0.5 * S, 0.12 * S, 0.34 * S, 0.03, o.glyph || C.cyan);
    A.box('glow', sx * R * 0.8, 0.3 * S, -0.5 * S, 0.12 * S, 0.34 * S, 0.03, o.glyph || C.cyan);
  }
  if (!o.a1) {
    A.box('paint', 0, cy + R + w / 2 - 0.06 * S, 0, 0.74 * S, 0.3 * S, 0.66 * S, C.stoneLight);
    A.gem('glow', 0, cy + R + w / 2 + 0.5 * S, 0, 0.17 * S, 0.2 * S, 0.36 * S, o.glyph || C.cyan, 4);
  }
  return cy;
}
// small way marker with a hovering tip (the lanterns of this world)
function obelisk(A) {
  A.box('paint', 0, -0.7, 0, 0.82, 0.92, 0.82, C.stoneDark);
  A.cyl('paint', 0, 0.22, 0, 0.36, 0.2, 1.66, C.stone, 4);
  A.cyl('glow', 0, 0.62, 0, 0.345, 0.335, 0.1, C.cyan, 4, { noCap: true });
  A.cyl('glow', 0, 1.18, 0, 0.292, 0.282, 0.1, C.cyan, 4, { noCap: true });
  A.gem('glow', 0, 2.08, 0, 0.17, 0.18, 0.34, C.cyan, 4);
}
// wayside: a shard hovering over a ring of stone
function floatStone(A) {
  A.cyl('paint', 0, -0.6, 0, 0.95, 0.85, 0.8, C.stoneDark, 7);
  A.ring('glow', 0, 0.21, 0, 0.55, 0.1, 0.03, C.magenta, { rx: Math.PI / 2, seg: 14 });
  A.gem('paint', 0.05, 0.75, 0, 0.42, 0.5, 1.0, C.stoneLight, 5);
  A.cyl('glow', 0.05, 1.22, 0, 0.44, 0.44, 0.07, C.magenta, 5, { noCap: true });
}
function standing(A, h, w, lean, glyph, twist = 0.4) {
  A.push(new THREE.Matrix4().makeRotationY(twist));
  A.cyl('paint', 0, -1.2, 0, w, w * 0.62, h + 1.2, C.stone, 5, { rz: lean });
  A.pop();
  A.box('glow', 0, 0.7, -w * 0.83, 0.12, h * 0.45, 0.05, glyph);
}
// stone circle around a hovering heart crystal
function circle(A) {
  A.cyl('paint', 0, -1.4, 0, 4.3, 4.0, 1.9, C.stone, 20);
  A.cyl('paint', 0, 0.5, 0, 3.3, 3.3, 0.12, C.stoneLight, 20);
  A.ring('glow', 0, 0.635, 0, 2.5, 0.14, 0.03, C.cyan, { rx: Math.PI / 2, seg: 28 });
  A.ring('glow', 0, 0.635, 0, 1.2, 0.08, 0.03, C.cyan, { rx: Math.PI / 2, seg: 20 });
  const r = mulberry32(77);
  for (let k = 0; k < 11; k++) {
    if (k === 0) continue; // the opening faces the approach
    const a = k / 11 * Math.PI * 2, h = 3.0 + r() * 1.9;
    A.at(Math.sin(a) * 10, 0, Math.cos(a) * 10, a);
    standing(A, h, 0.62 + r() * 0.2, (r() - 0.5) * 0.14, k % 3 ? C.cyan : C.magenta, r() * 1.2);
    A.pop();
  }
  for (const k of [3, 7]) { // lintels across two pairs
    const a = (k + 0.5) / 11 * Math.PI * 2;
    A.at(Math.sin(a) * 10, 0, Math.cos(a) * 10, a); A.box('paint', 0, 3.05, 0, 6.6, 0.55, 0.9, C.stoneLight); A.pop();
  }
  A.gem('glow', 0, 2.3, 0, 0.95, 1.3, 2.3, C.pale, 6);
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.5; A.gem('glow', Math.cos(a) * 2.1, 3.0 + k * 0.5, Math.sin(a) * 2.1, 0.22, 0.3, 0.55, C.magenta, 4); }
  return { top: 0.62, hw: 3.0, hd: 3.0 };
}
// sanctum: a great ring on a stepped dais, an orb hovering at its heart
function sanctum(A) {
  A.cyl('paint', 0, -1.6, 0, 6.8, 6.6, 1.9, C.stone, 24);
  A.cyl('paint', 0, 0.3, 0, 5.8, 5.8, 0.3, C.stoneLight, 24);
  A.cyl('paint', 0, 0.6, 0, 4.9, 4.9, 0.3, C.stone, 24);
  A.ring('glow', 0, 0.915, 0, 4.2, 0.12, 0.03, C.cyan, { rx: Math.PI / 2, seg: 32 });
  A.at(0, 0.9, -1.2);
  const cy = ringGate(A, 1.6, { glyph: C.pale });
  A.dome('glow', 0, cy, 0, 0.8, C.amber, { full: true, seg: 14, rings: 10 });
  A.pop();
  for (const [x, z] of [[-3.6, 2.6], [3.6, 2.6], [-3.9, -2.2], [3.9, -2.2]]) { A.at(x, 0.9, z); obelisk(A); A.pop(); }
  return { top: 0.9, hw: 4.3, hd: 4.3 };
}
// observatory: nested rings in a yoke, turned towards the giant in the sky
function armillary(A) {
  A.cyl('paint', 0, -2.2, 0, 12.4, 12.0, 2.6, C.stone, 32);
  A.cyl('paint', 0, 0.4, 0, 10.8, 10.8, 0.4, C.stoneLight, 32);
  A.cyl('paint', 0, 0.8, 0, 9.4, 9.4, 0.4, C.stone, 32);
  A.ring('glow', 0, 1.215, 0, 8.2, 0.16, 0.03, C.cyan, { rx: Math.PI / 2, seg: 44 });
  A.ring('glow', 0, 1.215, 0, 3.0, 0.12, 0.03, C.cyan, { rx: Math.PI / 2, seg: 28 });
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; A.box('glow', Math.cos(a) * 5.6, 1.2, Math.sin(a) * 5.6, 0.1, 0.03, 4.2, C.cyan, { ry: -a + Math.PI / 2 }); }
  const cy = 9.6, R = 6.6, tilt = -0.61;
  for (const sx of [-1, 1]) {
    A.cyl('paint', sx * (R + 1.0), 1.2, 0, 0.95, 0.55, cy - 0.6, C.stone, 6);
    A.cyl('glow', sx * (R + 1.0), 3.0, 0, 0.86, 0.84, 0.12, C.cyan, 6, { noCap: true });
    A.cyl('glow', sx * (R + 1.0), 6.0, 0, 0.72, 0.70, 0.12, C.cyan, 6, { noCap: true });
    A.box('roof', sx * (R + 0.55), cy, 0, 1.3, 0.5, 0.5, C.metal, { centered: true });
    A.gem('glow', sx * (R + 1.0), cy + 1.0, 0, 0.3, 0.35, 0.7, C.cyan, 4);
  }
  A.ring('roof', 0, cy, 0, R, 0.5, 0.5, C.metal, { seg: 44, rx: tilt });
  A.ring('glow', 0, cy, 0, R, 0.08, 0.56, C.cyan, { seg: 44, rx: tilt });
  A.ring('roof', 0, cy, 0, R - 1.0, 0.36, 0.36, C.gold, { seg: 40, rx: tilt + 1.05, ry: 0.5 });
  A.ring('roof', 0, cy, 0, R - 1.9, 0.3, 0.3, C.metal, { seg: 36, rx: tilt - 0.7, ry: -0.9 });
  A.ring('glow', 0, cy, 0, R - 1.9, 0.06, 0.35, C.magenta, { seg: 36, rx: tilt - 0.7, ry: -0.9 });
  A.dome('glow', 0, cy, 0, 1.35, C.amber, { full: true, seg: 18, rings: 12 });
  A.cyl('paint', 0, 1.2, 0, 1.5, 1.1, 1.6, C.stoneDark, 10);
  A.gem('glow', 0, 3.1, 0, 0.35, 0.4, 0.9, C.amber, 4);
  return { top: 1.2, hw: 8.6, hd: 8.6 };
}
// slender tower with a hovering halo
function spire(A) {
  A.cyl('paint', 0, -1.6, 0, 5.0, 4.7, 2.6, C.stone, 8);
  let y = 1.0, rad = 3.0;
  for (let i = 0; i < 6; i++) {
    const h = 3.6 - i * 0.2, r1 = rad * 0.86;
    A.cyl('paint', 0, y, 0, rad, r1, h, i % 2 ? C.stoneLight : C.stone, 8);
    A.cyl('paint', 0, y + h, 0, r1 + 0.28, r1 + 0.28, 0.22, C.stoneDark, 8);
    A.cyl('glow', 0, y + h + 0.22, 0, r1 + 0.1, r1 + 0.1, 0.1, i % 2 ? C.magenta : C.cyan, 8, { noCap: true });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + i * 0.39; A.box('glow', Math.sin(a) * (rad * 0.905), y + h * 0.3, Math.cos(a) * (rad * 0.905), 0.3, h * 0.42, 0.06, C.amber, { ry: a }); }
    y += h + 0.32; rad = r1;
  }
  A.cyl('roof', 0, y, 0, rad + 0.2, 0.0, 3.4, C.metal, 8);
  A.ring('roof', 0, y + 4.6, 0, 2.3, 0.22, 0.22, C.gold, { rx: Math.PI / 2, seg: 28 });
  A.ring('glow', 0, y + 4.6, 0, 2.3, 0.05, 0.27, C.cyan, { rx: Math.PI / 2, seg: 28 });
  A.gem('glow', 0, y + 3.9, 0, 0.42, 0.6, 1.3, C.pale, 6);
  return y + 6;
}
// open rotunda
function rotunda(A) {
  A.cyl('paint', 0, -1.6, 0, 5.5, 5.3, 2.4, C.stone, 20);
  A.ring('glow', 0, 0.815, 0, 2.2, 0.1, 0.03, C.cyan, { rx: Math.PI / 2, seg: 24 });
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) / 8 * Math.PI * 2, x = Math.cos(a) * 4.3, z = Math.sin(a) * 4.3;
    A.cyl('paint', x, 0.8, z, 0.34, 0.27, 3.7, C.stoneLight, 8);
    A.cyl('paint', x, 0.8, z, 0.46, 0.42, 0.3, C.stoneDark, 8);
    A.cyl('glow', x, 2.6, z, 0.305, 0.3, 0.08, C.cyan, 8, { noCap: true });
  }
  A.ring('paint', 0, 4.75, 0, 4.3, 1.0, 0.5, C.stone, { rx: Math.PI / 2, seg: 28 });
  A.dome('roof', 0, 5.0, 0, 4.9, C.metal, { seg: 24, rings: 7, sy: 0.5 });
  A.gem('glow', 0, 7.7, 0, 0.3, 0.3, 0.8, C.cyan, 4);
  A.dome('glow', 0, 2.5, 0, 0.5, C.pale, { full: true, seg: 12, rings: 8 });
  return { top: 0.8, hw: 3.7, hd: 3.7 };
}

function bridge(A, b, style) {
  const L = b.len, W = b.width, n = Math.max(10, Math.round(L / 1.1));
  const yAt = (t) => lerp(b.ha, b.hb, t) - b.ha + 0.25 + b.rise * 4 * t * (1 - t);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const x0 = t0 * L, x1 = t1 * L, y0 = yAt(t0), y1 = yAt(t1);
    const rz = Math.atan2(y1 - y0, x1 - x0), sl = Math.hypot(x1 - x0, y1 - y0), ym = (y0 + y1) / 2;
    A.box('paint', tm * L, ym - 0.5, 0, sl * 1.02, 0.5, W, i % 2 ? C.stone : C.stoneLight, { rz });
    for (const s of [-1, 1]) {
      A.box('paint', tm * L, ym, s * (W / 2 - 0.14), sl * 1.02, 0.62, 0.28, C.stoneDark, { rz });
      if (style === 0) A.box('glow', tm * L, ym + 0.3, s * (W / 2 - 0.29), sl * 1.02, 0.07, 0.03, C.cyan, { rz });
    }
  }
  for (const s of [-1, 1]) for (const t of [0, 1]) {
    A.box('paint', t * L, yAt(t) - 0.5, s * (W / 2 - 0.14), 0.5, 1.7, 0.5, C.stone);
    A.gem('glow', t * L, yAt(t) + 1.4, s * (W / 2 - 0.14), 0.15, 0.16, 0.3, style === 0 ? C.cyan : C.amber, 4);
  }
  const np = Math.max(1, Math.round(L / 9));
  for (let i = 1; i <= np; i++) {
    const t = i / (np + 1), y = yAt(t);
    A.box('paint', t * L, -b.ha - 4.5, 0, 0.9, y + b.ha + 4.1, W - 0.6, C.stoneDark);
  }
}

// ------------------------------------------------------------------ materials
function metalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = mulberry32(9);
  g.fillStyle = '#8f9a98'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,60,60' : '210,225,220'},${0.04 + r() * 0.08})`; g.fillRect(r() * 256, r() * 256, 3 + r() * 30, 1 + r() * 5); }
  for (let y = 0; y < 256; y += 64) { g.fillStyle = 'rgba(20,30,32,0.5)'; g.fillRect(0, y, 256, 3); }
  for (let x = 0; x < 256; x += 128) { g.fillStyle = 'rgba(20,30,32,0.4)'; g.fillRect(x, 0, 3, 256); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const SNOW_PATCH = /* glsl */`#include <normal_fragment_maps>
  {
    vec3 wn = inverseTransformDirection(normal, viewMatrix);
    float sn = uSnow * 0.85 * smoothstep(0.35, 0.8, wn.y + (texture2D(uNoiseTex, vWPos.xz * 0.21).r - 0.5) * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.91, 0.96), sn);
  }`;
function makeMaterials() {
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.0 });
  patch(paint, 'paint', (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          float nz = texture2D(uNoiseTex, vWPos.xz * 0.37 + vWPos.y * 0.23).r;
          float nz2 = texture2D(uNoiseTex, vWPos.xy * 1.1 + vWPos.z * 0.7).g;
          float nz3 = texture2D(uNoiseTex, vWPos.xz * 0.05 + vWPos.y * 0.09).b;
          diffuseColor.rgb *= 0.74 + 0.28 * nz + 0.18 * nz2;
          // moss creeping over the old stone
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.24, 0.20), smoothstep(0.55, 0.8, nz3 * 0.6 + nz * 0.4) * 0.55);
        }`)
      .replace('#include <normal_fragment_maps>', SNOW_PATCH);
  });
  const rt = metalTexture();
  const roof = new THREE.MeshStandardMaterial({ map: rt, vertexColors: true, roughness: 0.42, metalness: 0.55, side: THREE.DoubleSide });
  patch(roof, 'roof', (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <normal_fragment_maps>', SNOW_PATCH)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { vec3 rv = reflect(-normalize(vViewPosition), normal); vec3 rw = inverseTransformDirection(rv, viewMatrix); rw.y = abs(rw.y); totalEmissiveRadiance += skyLUT(rw) * diffuseColor.rgb * 0.5; }');
  });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  patch(glow, 'glow', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      {
        float pulseG = 0.82 + 0.18 * sin(uTime * 0.9 + vWPos.x * 0.21 + vWPos.z * 0.17 + vWPos.y * 0.4);
        float trlG = trailGlow(vWPos);
        vec3 dayG = diffuseColor.rgb * (0.30 * (uAmbCol + uSunCol * 0.3) + 0.22);
        diffuseColor.rgb = mix(dayG, diffuseColor.rgb * 3.4 * pulseG, clamp(smoothstep(0.1, 0.6, uGlow) + trlG * 0.5, 0.0, 1.0));
      }`);
  });
  const decal = new THREE.ShaderMaterial({
    uniforms: { ...U }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vWPos;
      void main() { vUv = uv; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vWPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      precision highp float; varying vec2 vUv; varying vec3 vWPos;
      ${GLSL_COMMON}
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.2) * smoothstep(0.1, 0.6, uGlow);
        float mist; vec3 tr = fogTransmit(cameraPosition, vWPos, mist);
        gl_FragColor = vec4(vec3(0.16, 0.85, 0.80) * a * 0.42 * tr, 1.0);
      }`,
  });
  return { paint, roof, glow, decal };
}

// ------------------------------------------------------------------ manager
export class Structures {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.world = ctx.world;
    this.mat = makeMaterials();
    const mk = (fn) => { const A = new Arch(); const info = fn(A); const g = A.build(); g.info = info; return g; };
    this.geo = {
      armillary: mk(armillary), spire: mk(spire), rotunda: mk(rotunda), sanctum: mk(sanctum), circle: mk(circle),
      gate: mk((A) => { ringGate(A, 1); }), lantern: mk(obelisk), floatStone: mk(floatStone),
    };
    const dq = new THREE.PlaneGeometry(1, 1); dq.rotateX(-Math.PI / 2);
    this.decalGeo = dq;
    this.sites = new Map(); this.minis = new Map(); this.bridges = new Map(); this.toriis = new Map();
    this.walk = []; // walkable platforms {site, hw, hd, lx, lz, top}
    this.tick = 0;
    this.onSite = []; // callbacks(site, group) for other systems (fauna)
    this.gates = []; // world-space ring gates for the chime: {x, y, z, r, rec}
  }
  addParts(group, geo, x, y, z, ry = 0, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s);
    for (const k of ['paint', 'roof', 'glow']) {
      if (!geo[k]) continue;
      const m = new THREE.Mesh(geo[k], this.mat[k]);
      m.castShadow = k !== 'glow'; m.receiveShadow = k !== 'glow';
      g.add(m);
    }
    group.add(g);
    return g;
  }
  instanced(group, geo, list) { // list of {x,y,z,ry,s}
    const out = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new V3(0, 1, 0);
    for (const k of ['paint', 'roof', 'glow']) {
      if (!geo[k]) continue;
      const im = new THREE.InstancedMesh(geo[k], this.mat[k], list.length);
      list.forEach((l, i) => { m4.compose(new V3(l.x, l.y, l.z), q.setFromAxisAngle(up, l.ry || 0), new V3(l.s || 1, l.s || 1, l.s || 1)); im.setMatrixAt(i, m4); });
      im.castShadow = k !== 'glow'; im.receiveShadow = k !== 'glow';
      im.computeBoundingSphere();
      group.add(im); out.push(im);
    }
    return out;
  }
  decals(group, list) { // {x,y,z,r}
    const im = new THREE.InstancedMesh(this.decalGeo, this.mat.decal, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach((l, i) => { m4.compose(new V3(l.x, l.y, l.z), q, new V3(l.r * 2, 1, l.r * 2)); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere(); im.layers.set(1); im.renderOrder = 5;
    group.add(im);
  }
  buildSite(s) {
    const g = new THREE.Group();
    g.position.set(s.x, s.h, s.z); g.rotation.y = s.rot;
    const W = this.world, sin = Math.sin(s.rot), cos = Math.cos(s.rot);
    const toWorld = (lx, lz) => [s.x + lx * cos + lz * sin, s.z - lx * sin + lz * cos];
    const lanterns = [], glows = [];
    const walk = [];
    const addLantern = (lx, lz, y = 0) => { lanterns.push({ x: lx, y, z: lz, ry: 0 }); glows.push({ x: lx, y: y + 0.08, z: lz, r: 5.5 }); };
    const hAt = (lx, lz) => { const [wx, wz] = toWorld(lx, lz); return W.height(wx, wz) - s.h; };
    const path = new Arch();
    const gates = [];
    const addGate = (lx, lz, y, sc) => { gates.push({ x: lx, y, z: lz, s: sc }); };
    if (s.type === 0) {
      const ar = this.geo.armillary.info;
      this.addParts(g, this.geo.armillary, 0, 0, -15, -s.rot); // the yoke always faces the giant in the southern sky
      walk.push({ lx: 0, lz: -15, hw: ar.hw, hd: ar.hd, top: ar.top });
      this.addParts(g, this.geo.spire, -27, 0, 6);
      walk.push({ lx: -27, lz: 6, hw: 3.3, hd: 3.3, top: 1.0 });
      this.addParts(g, this.geo.rotunda, 27, 0, 4);
      walk.push({ lx: 27, lz: 4, hw: this.geo.rotunda.info.hw, hd: this.geo.rotunda.info.hd, top: this.geo.rotunda.info.top });
      addGate(0, 36, 0, 1.9);
      for (const z of [29, 21, 13, 5]) { addLantern(-3.4, z); addLantern(3.4, z); }
      addLantern(-15, 6); addLantern(15, 6);
      path.box('paint', 0, 0.0, 16.5, 2.6, 0.07, 39, C.stoneLight);
      path.box('paint', -12, 0.0, 6, 21.4, 0.06, 1.8, C.stoneLight); path.box('paint', 12, 0.0, 4, 21.4, 0.06, 1.8, C.stoneLight);
      glows.push({ x: 0, y: 0.1, z: -15, r: 16 });
      s.guards = [[-4.6, 31.5], [4.6, 31.5]];
      // an avenue of rings leads up to the great gate
      for (const [lz, sc] of [[58, 1.75], [76, 1.35]]) { const y = hAt(0, lz); if (y + s.h > 1.0) addGate(0, lz, y, sc); }
      for (const lz of [44, 50, 66]) { const y = hAt(3.2, lz), y2 = hAt(-3.2, lz); if (y + s.h > 0.8 && y2 + s.h > 0.8) { addLantern(3.2, lz, y); addLantern(-3.2, lz, y2); } }
    } else if (s.type === 1) {
      this.addParts(g, this.geo.sanctum, 0, 0, -11);
      walk.push({ lx: 0, lz: -11, hw: 4.3, hd: 4.3, top: 0.9 });
      addGate(0, 19, 0, 1.3);
      // a procession of rings climbing the slope towards the sanctum
      let prev = s.h;
      for (let i = 0; i < 14; i++) {
        const lz = 27 + i * 5;
        const [wx, wz] = toWorld(0, lz);
        const h = W.height(wx, wz);
        if (h < 0.9 || Math.abs(h - prev) > 2.6) break;
        prev = h;
        addGate(0, lz, h - s.h, i % 2 ? 0.82 : 0.96);
      }
      addLantern(-2.9, 14); addLantern(2.9, 14); addLantern(-2.9, 3); addLantern(2.9, 3);
      path.box('paint', 0, 0.0, 9, 2.2, 0.07, 34, C.stoneLight);
      glows.push({ x: 0, y: 0.1, z: -9, r: 9 });
      s.guards = [[-3.4, 17], [3.4, 17]];
    } else if (s.type === 3) {
      addGate(0, 4.6, 0, s.sc);
      this.addParts(g, this.geo.floatStone, 0, 0, -3.4);
      addLantern(-2.6 - s.sc * 0.7, 3.2); addLantern(2.6 + s.sc * 0.7, 3.2);
      glows.push({ x: 0, y: 0.1, z: -3.4, r: 4 });
      s.guards = [];
    } else {
      this.addParts(g, this.geo.circle, 0, 0, 0);
      walk.push({ lx: 0, lz: 0, hw: 3.0, hd: 3.0, top: 0.62 });
      addGate(0, 14.5, 0, 1.0);
      addLantern(-2.8, 11.5); addLantern(2.8, 11.5);
      path.box('paint', 0, 0.0, 9, 1.8, 0.06, 9, C.stoneLight);
      glows.push({ x: 0, y: 0.1, z: 0, r: 10 });
      s.guards = [];
    }
    if (gates.length) this.instanced(g, this.geo.gate, gates);
    const pg = path.build();
    if (pg.paint) { const m = new THREE.Mesh(pg.paint, this.mat.paint); m.receiveShadow = true; g.add(m); }
    this.instanced(g, this.geo.lantern, lanterns);
    this.decals(g, glows);
    g.updateMatrixWorld(true);
    g.traverse((o) => { o.matrixAutoUpdate = false; });
    this.scene.add(g);
    const rec = { site: s, group: g, walk, sin, cos, gates: gates.map((q) => { const [wx, wz] = toWorld(q.x, q.z); return { lx: q.x, lz: q.z, y: s.h + q.y + 2.4 * q.s, r: 2.3 * q.s }; }) };
    for (const cb of this.onSite) cb(rec, true);
    return rec;
  }
  buildBridge(b) {
    const A = new Arch(); bridge(A, b, b.style);
    const geo = A.build();
    const m = new THREE.Mesh(geo.paint, this.mat.paint);
    m.position.set(b.ax, b.ha, b.az); m.rotation.y = -Math.atan2(b.dz, b.dx);
    m.castShadow = true; m.receiveShadow = true; m.updateMatrixWorld(); m.matrixAutoUpdate = false;
    this.scene.add(m);
    let extra = null;
    if (b.style === 0 && (Math.floor(b.id / 7) % 10) < 6) {
      const tx = b.ax - b.dx * 6.5, tz = b.az - b.dz * 6.5, th = this.world.height(tx, tz);
      if (th > 0.8 && Math.abs(th - b.ha) < 2.5) {
        extra = new THREE.Group(); extra.position.set(tx, th, tz); extra.rotation.y = Math.atan2(b.dx, b.dz);
        this.addParts(extra, this.geo.gate, 0, 0, 0, 0, 1.25);
        extra.updateMatrixWorld(true); extra.traverse((o) => { o.matrixAutoUpdate = false; });
        this.scene.add(extra);
      }
    }
    return { b, mesh: m, extra };
  }
  buildTorii(t) {
    const g = new THREE.Group();
    g.position.set(t.x, t.h, t.z); g.rotation.y = t.rot;
    this.addParts(g, this.geo.gate, 0, 0.9, 0, 0, 2.3);
    g.updateMatrixWorld(true); g.traverse((o) => { o.matrixAutoUpdate = false; });
    this.scene.add(g);
    return { t, group: g };
  }
  sync(map, cell, range, getter, builder, disposer) {
    const cam = this.ctx.camera.position;
    const ci = Math.floor(cam.x / cell), cj = Math.floor(cam.z / cell), n = Math.ceil(range / cell);
    const seen = new Set();
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const it = getter(i, j);
      if (!it) continue;
      const d = Math.hypot(it.x - cam.x, it.z - cam.z);
      if (d > range) continue;
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
    const dropSite = (r) => { for (const cb of this.onSite) cb(r, false); this.scene.remove(r.group); r.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); };
    this._layers = [
      { map: this.sites, cell: SITE_CELL, range: 1700, get: (i, j) => W.siteAt(i, j), build: (s) => this.buildSite(s), drop: dropSite },
      { map: this.minis, cell: MINI_CELL, range: 1200, get: (i, j) => W.miniAt(i, j), build: (s) => this.buildSite(s), drop: dropSite },
      { map: this.bridges, cell: BRIDGE_CELL, range: 1300, get: (i, j) => W.bridgeAt(i, j), build: (b) => this.buildBridge(b), drop: (r) => { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); if (r.extra) this.scene.remove(r.extra); } },
      { map: this.toriis, cell: TORII_CELL, range: 2600, get: (i, j) => W.waterToriiAt(i, j), build: (t) => this.buildTorii(t), drop: (r) => { this.scene.remove(r.group); } },
    ];
    return this._layers;
  }
  // did the traveller just pass through a ring?
  checkGates() {
    const p = this.ctx.player.pos, q = this._prev || (this._prev = p.clone());
    if (p.distanceToSquared(q) < 400 && p.distanceToSquared(q) > 1e-6) {
      const test = (ox, oz, sin, cos, gx, gz, gy, r) => {
        const side = (v) => { const dx = v.x - ox, dz = v.z - oz; return [dx * cos - dz * sin - gx, dx * sin + dz * cos - gz]; };
        const a = side(q), b = side(p);
        if (a[1] * b[1] >= 0) return false;
        const t = a[1] / (a[1] - b[1]), lx = a[0] + (b[0] - a[0]) * t, ly = q.y + (p.y - q.y) * t - gy;
        return lx * lx + ly * ly < r * r;
      };
      for (const map of [this.sites, this.minis]) for (const rec of map.values()) {
        const s = rec.site;
        if (Math.abs(p.x - s.x) > 140 || Math.abs(p.z - s.z) > 140) continue;
        for (const g of rec.gates) if (test(s.x, s.z, rec.sin, rec.cos, g.lx, g.lz, g.y, g.r)) { const wx = s.x + g.lx * rec.cos + g.lz * rec.sin, wz = s.z - g.lx * rec.sin + g.lz * rec.cos; this.ctx.onGate && this.ctx.onGate({ x: wx, y: g.y, z: wz, r: g.r }); }
      }
      for (const rec of this.toriis.values()) {
        const t = rec.t;
        if (Math.abs(p.x - t.x) > 40 || Math.abs(p.z - t.z) > 40) continue;
        if (test(t.x, t.z, Math.sin(t.rot), Math.cos(t.rot), 0, 0, t.h + 0.9 + 2.46 * 2.3, 5.3)) this.ctx.onGate && this.ctx.onGate({ x: t.x, y: t.h + 0.9 + 2.46 * 2.3, z: t.z, r: 5.3 });
      }
    }
    q.copy(p);
  }
  update() {
    this.checkGates();
    if ((this.tick++ % 20) !== 0) return;
    for (const L of this.layers()) this.sync(L.map, L.cell, L.range, L.get, L.build, L.drop);
  }
  clear() {
    for (const L of this.layers()) { for (const r of L.map.values()) L.drop(r); L.map.clear(); }
    this.tick = 0; this._prev = null;
  }
  // floating origin moved: slide every built object and its bookkeeping
  rebase(sx, sz) {
    const move = (o) => { if (!o) return; o.position.x -= sx; o.position.z -= sz; o.updateMatrix(); o.updateMatrixWorld(true); };
    for (const L of this.layers()) for (const r of L.map.values()) {
      const it = r.site || r.b || r.t;
      it.x -= sx; it.z -= sz;
      if (r.b) { it.ax -= sx; it.az -= sz; it.bx -= sx; it.bz -= sz; }
      move(r.group); move(r.mesh); move(r.extra);
    }
    this.tick = 0; this._prev = null;
  }
  groundAt(x, z, h) {
    let best = h;
    for (const rec of this.bridges.values()) {
      const b = rec.b;
      if (Math.abs(x - b.x) > b.len || Math.abs(z - b.z) > b.len) continue;
      const d = this.world.bridgeDeck(b, x, z);
      if (d > best) best = d;
    }
    for (const rec of this.sites.values()) {
      const s = rec.site;
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz > s.r1 * s.r1) continue;
      const lx = dx * rec.cos - dz * rec.sin, lz = dx * rec.sin + dz * rec.cos;
      for (const w of rec.walk) {
        const ax = Math.abs(lx - w.lx), az = Math.abs(lz - w.lz);
        if (ax < w.hw && az < w.hd) best = Math.max(best, s.h + w.top);
        else if (ax < w.hw + 1.5 && az < w.hd + 1.5) { // ramp up the steps
          const k = 1 - Math.max(ax - w.hw, az - w.hd, 0) / 1.5;
          best = Math.max(best, s.h + w.top * k);
        }
      }
    }
    return best;
  }
}
