// Architecture: pagodas, temple halls, shrines, torii, stone lanterns, bridges. All procedural geometry.
import * as THREE from 'three';
import { U, patch, GLSL_COMMON } from './shaders.js';
import { SITE_CELL, MINI_CELL, BRIDGE_CELL, TORII_CELL } from './world.js';
import { mulberry32, lerp, clamp } from './noise.js';

const V3 = THREE.Vector3;
const C = {
  red: [0.62, 0.085, 0.045], redDark: [0.36, 0.06, 0.04], white: [0.80, 0.77, 0.70], wood: [0.21, 0.14, 0.09], woodLight: [0.42, 0.29, 0.17],
  stone: [0.42, 0.42, 0.40], stoneDark: [0.27, 0.27, 0.26], black: [0.035, 0.035, 0.04], gold: [0.78, 0.56, 0.16], bronze: [0.22, 0.27, 0.22],
  roof: [1, 1, 1], lattice: [0.09, 0.10, 0.08], plank: [0.36, 0.25, 0.15],
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
  // curved hip roof centred at (x, y, z): y = eave height
  roof(x, y, z, o) {
    const { w, d, ridge = 0, H, over, upturn, curve = 1.55, thick = 0.16, under = C.redDark } = o;
    this.push(new THREE.Matrix4().makeTranslation(x, y, z));
    const ex = w / 2 + over, ez = d / 2 + over, rl = ridge / 2;
    const faces = [
      [new V3(-ex, 0, ez), new V3(ex, 0, ez), new V3(-rl, 0, 0), new V3(rl, 0, 0)],
      [new V3(ex, 0, ez), new V3(ex, 0, -ez), new V3(rl, 0, 0), new V3(rl, 0, 0)],
      [new V3(ex, 0, -ez), new V3(-ex, 0, -ez), new V3(rl, 0, 0), new V3(-rl, 0, 0)],
      [new V3(-ex, 0, -ez), new V3(-ex, 0, ez), new V3(-rl, 0, 0), new V3(-rl, 0, 0)],
    ];
    const NU = o.nu || 12, NV = o.nv || 7;
    const pt = (f, s, t) => {
      const e = new V3().lerpVectors(f[0], f[1], s), tp = new V3().lerpVectors(f[2], f[3], s);
      const p = new V3().lerpVectors(tp, e, t);
      const cn = Math.abs(2 * s - 1);
      p.y = H * Math.pow(1 - t, curve) + upturn * Math.pow(cn, 3) * Math.pow(t, 2.5);
      return p;
    };
    const R = this.k.roof, Pn = this.k.paint, nm = new THREE.Matrix3().getNormalMatrix(this.m);
    for (const f of faces) {
      const eaveLen = f[0].distanceTo(f[1]), slopeLen = Math.hypot(H, f[0].clone().add(f[1]).multiplyScalar(0.5).distanceTo(f[2].clone().add(f[3]).multiplyScalar(0.5)));
      const base = R.p.length / 3, baseU = Pn.p.length / 3;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const s = i / NU, t = j / NV;
        const p = pt(f, s, t);
        const e = 0.01;
        const tn = Math.max(t, 0.08);
        const ps = pt(f, Math.min(1, s + e), tn).sub(pt(f, Math.max(0, s - e), tn));
        const ptt = pt(f, s, Math.min(1, tn + e)).sub(pt(f, s, Math.max(0, tn - e)));
        let n = new V3().crossVectors(ptt, ps);
        if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
        n.normalize();
        if (n.y < 0) n.negate();
        const wp = p.clone().applyMatrix4(this.m), wn = n.clone().applyMatrix3(nm).normalize();
        // u runs along the eave in metres (kept constant per column so tiles run down the slope)
        R.v(wp, wn, C.roof, (s - 0.5) * eaveLen * lerp(0.35, 1, t), t * slopeLen);
        const pu = p.clone(); pu.y -= thick * (0.4 + 0.6 * t);
        Pn.v(pu.applyMatrix4(this.m), wn.clone().negate(), [under[0] * (0.5 + 0.5 * t), under[1] * (0.5 + 0.5 * t), under[2] * (0.5 + 0.5 * t)]);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d2 = c + 1;
        R.i.push(base + a, base + c, base + b, base + b, base + c, base + d2);
        Pn.i.push(baseU + a, baseU + b, baseU + c, baseU + b, baseU + d2, baseU + c);
      }
      // fascia along the eave
      for (let i = 0; i < NU; i++) {
        const a = pt(f, i / NU, 1), b = pt(f, (i + 1) / NU, 1);
        const a2 = a.clone(), b2 = b.clone(); a2.y -= thick; b2.y -= thick;
        this.quad('paint', a2, b2, b, a, under, 1.1);
      }
      // hip ridge
      const hp = [];
      for (let j = 0; j <= 6; j++) hp.push(pt(f, 0, j / 6));
      for (let j = 0; j < 6; j++) {
        const a = hp[j], b = hp[j + 1], mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a);
        const len = dir.length();
        const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
        this.push(new THREE.Matrix4().compose(mid, q, new V3(1, 1, 1)));
        this.cyl('roof', 0, -len / 2, 0, 0.13, 0.13, len, [0.75, 0.75, 0.78], 5, { noCap: true });
        this.pop();
      }
    }
    if (ridge > 0) {
      this.box('roof', 0, H - 0.1, 0, ridge + 0.5, 0.42, 0.46, [0.7, 0.7, 0.74]);
      for (const sx of [-1, 1]) {
        this.box('roof', sx * (rl + 0.2), H + 0.05, 0, 0.36, 0.75, 0.6, [0.6, 0.6, 0.64]);
        this.box('paint', sx * (rl + 0.2), H + 0.8, 0, 0.14, 0.5, 0.3, C.gold, { rz: -sx * 0.5 });
      }
    }
    this.pop();
  }
  railing(x0, z0, x1, z1, y, col, h = 0.85, capCol = null) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.6)), ry = -Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.box('paint', lerp(x0, x1, t), y, lerp(z0, z1, t), 0.11, h, 0.11, col);
      if (capCol) this.box('paint', lerp(x0, x1, t), y + h, lerp(z0, z1, t), 0.15, 0.06, 0.15, capCol);
    }
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    this.box('paint', mx, y + h * 0.88, mz, len, 0.09, 0.09, col, { ry });
    this.box('paint', mx, y + h * 0.45, mz, len, 0.06, 0.06, col, { ry });
  }
  build() { return { paint: this.k.paint.geometry(), roof: this.k.roof.geometry(), glow: this.k.glow.geometry() }; }
}

// ------------------------------------------------------------------ building blueprints
function pagoda(A, tiers = 5) {
  A.box('paint', 0, -1.5, 0, 9.6, 2.5, 9.6, C.stone);
  A.box('paint', 0, 1.0, 0, 8.6, 0.25, 8.6, C.stoneDark);
  for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (let s = 0; s < 4; s++) A.box('paint', sx * (4.9 + s * 0.3), -1.5, sz * (4.9 + s * 0.3), sx ? 0.3 : 2.4, 2.5 - s * 0.28, sx ? 2.4 : 0.3, C.stone);
  let y = 1.25;
  for (let i = 0; i < tiers; i++) {
    const w = 6.2 - i * 0.82, h = i === 0 ? 3.7 : 3.1, hw = w / 2;
    A.box('paint', 0, y, 0, w - 0.25, h, w - 0.25, C.white);
    for (let k = 0; k < 4; k++) {
      const t = -hw + k * w / 3;
      for (const s of [-1, 1]) { A.cyl('paint', t, y, s * hw, 0.16, 0.15, h, C.red, 8); if (k > 0 && k < 3) A.cyl('paint', s * hw, y, t, 0.16, 0.15, h, C.red, 8); }
    }
    for (const s of [-1, 1]) {
      A.box('paint', 0, y + h - 0.32, s * hw, w + 0.3, 0.3, 0.2, C.red); A.box('paint', s * hw, y + h - 0.32, 0, 0.2, 0.3, w + 0.3, C.red);
      A.box('paint', 0, y + 0.05, s * hw, w + 0.3, 0.22, 0.2, C.red); A.box('paint', s * hw, y + 0.05, 0, 0.2, 0.22, w + 0.3, C.red);
      // doors / windows
      A.box(i === 0 ? 'glow' : 'paint', 0, y + 0.5, s * (hw - 0.08), w / 3 - 0.4, h - 1.25, 0.08, i === 0 ? [1, 1, 1] : C.lattice);
      A.box(i === 0 ? 'glow' : 'paint', s * (hw - 0.08), y + 0.5, 0, 0.08, h - 1.25, w / 3 - 0.4, i === 0 ? [1, 1, 1] : C.lattice);
    }
    // bracket band
    A.box('paint', 0, y + h, 0, w + 0.7, 0.34, w + 0.7, C.redDark);
    A.box('paint', 0, y + h + 0.34, 0, w + 1.5, 0.22, w + 1.5, C.red);
    const top = i === tiers - 1;
    A.roof(0, y + h + 0.5, 0, { w, d: w, ridge: 0, H: top ? 1.9 : 1.25, over: 2.0 - i * 0.12, upturn: 0.62, under: [0.5, 0.11, 0.07], nu: 10, nv: 6 });
    y += h + 0.5 + (top ? 1.9 : 0.72);
    if (!top) { // balcony
      const bw = (6.2 - (i + 1) * 0.82) / 2 + 0.7;
      A.box('paint', 0, y - 0.1, 0, bw * 2, 0.1, bw * 2, C.wood);
      A.railing(-bw, bw, bw, bw, y, C.red, 0.6); A.railing(-bw, -bw, bw, -bw, y, C.red, 0.6);
      A.railing(bw, -bw, bw, bw, y, C.red, 0.6); A.railing(-bw, -bw, -bw, bw, y, C.red, 0.6);
    }
  }
  // sorin (finial)
  A.box('paint', 0, y - 0.25, 0, 1.0, 0.5, 1.0, C.bronze);
  A.cyl('paint', 0, y + 0.25, 0, 0.5, 0.28, 0.4, C.bronze, 10);
  A.cyl('paint', 0, y + 0.6, 0, 0.09, 0.07, 6.2, C.bronze, 6);
  for (let k = 0; k < 9; k++) A.cyl('paint', 0, y + 1.3 + k * 0.42, 0, 0.5 - k * 0.032, 0.5 - k * 0.032, 0.09, C.gold, 10);
  A.cyl('paint', 0, y + 5.3, 0, 0.2, 0.0, 0.9, C.gold, 8);
  A.cyl('paint', 0, y + 6.3, 0, 0.16, 0.0, 0.45, C.gold, 6);
  return y + 6.8;
}

function hall(A, o = {}) {
  const W = o.W || 14, D = o.D || 8.4, Hh = o.H || 4.6, bays = o.bays || 6, baysD = o.baysD || 4;
  const pw = W + 6, pd = D + 6;
  A.box('paint', 0, -2, 0, pw, 3.2, pd, C.stone);
  A.box('paint', 0, 1.2, 0, pw - 0.6, 0.12, pd - 0.6, C.stoneDark);
  for (let s = 0; s < 5; s++) A.box('paint', 0, -2, pd / 2 + 0.2 + s * 0.36, 6.4, 3.2 - (s + 1) * 0.24 + 0.02, 0.4, C.stone); // steps
  const fy = 1.32;
  A.box('paint', 0, fy, 0, W + 3.6, 0.16, D + 3.6, C.wood);
  const hw = W / 2, hd = D / 2, y = fy + 0.16;
  A.box('paint', 0, y, 0, W - 0.3, Hh, D - 0.3, C.white);
  for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) A.cyl('paint', -hw + i * W / bays, y, s * hd, 0.21, 0.2, Hh, C.red, 9);
  for (let i = 1; i < baysD; i++) for (const s of [-1, 1]) A.cyl('paint', s * hw, y, -hd + i * D / baysD, 0.21, 0.2, Hh, C.red, 9);
  for (const s of [-1, 1]) {
    A.box('paint', 0, y + Hh - 0.4, s * hd, W + 0.4, 0.4, 0.26, C.red); A.box('paint', s * hw, y + Hh - 0.4, 0, 0.26, 0.4, D + 0.4, C.red);
    A.box('paint', 0, y + Hh * 0.62, s * hd, W, 0.16, 0.2, C.red); A.box('paint', s * hw, y + Hh * 0.62, 0, 0.2, 0.16, D, C.red);
    A.box('paint', 0, y, s * hd, W + 0.3, 0.3, 0.24, C.redDark); A.box('paint', s * hw, y, 0, 0.24, 0.3, D + 0.3, C.redDark);
  }
  // front doors (shoji) glow, side lattice windows
  const bw = W / bays;
  for (let i = 0; i < bays; i++) {
    const cx = -hw + (i + 0.5) * bw, mid = i >= 1 && i < bays - 1;
    A.box(mid ? 'glow' : 'paint', cx, y + 0.3, hd - 0.02, bw - 0.55, Hh * 0.62 - 0.4, 0.08, mid ? [1, 1, 1] : C.lattice);
    if (mid) { A.box('paint', cx, y + 0.3, hd + 0.03, 0.06, Hh * 0.62 - 0.4, 0.05, C.wood); A.box('paint', cx, y + 0.3 + (Hh * 0.62 - 0.4) * 0.5, hd + 0.03, bw - 0.55, 0.06, 0.05, C.wood); }
    A.box('paint', cx, y + Hh * 0.62 + 0.3, hd - 0.02, bw - 0.55, Hh * 0.38 - 0.9, 0.08, C.lattice);
    A.box('paint', cx, y + 1.3, -hd + 0.02, bw - 0.55, 1.4, 0.08, C.lattice);
  }
  for (let i = 0; i < baysD; i++) for (const s of [-1, 1]) A.box(i % 2 ? 'glow' : 'paint', s * (hw - 0.02), y + 1.3, -hd + (i + 0.5) * D / baysD, 0.08, 1.3, D / baysD - 0.6, i % 2 ? [1, 1, 1] : C.lattice);
  // veranda railing
  const vx = W / 2 + 1.7, vz = D / 2 + 1.7;
  A.railing(-vx, vz, -3.4, vz, y, C.red, 0.8, C.black); A.railing(3.4, vz, vx, vz, y, C.red, 0.8, C.black);
  A.railing(-vx, -vz, vx, -vz, y, C.red, 0.8, C.black); A.railing(vx, -vz, vx, vz, y, C.red, 0.8, C.black); A.railing(-vx, -vz, -vx, vz, y, C.red, 0.8, C.black);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) A.cyl('paint', sx * (hw + 1.5), y, sz * (hd + 1.5), 0.15, 0.14, Hh, C.red, 8);
  A.box('paint', 0, y + Hh, 0, W + 1.0, 0.42, D + 1.0, C.redDark);
  A.box('paint', 0, y + Hh + 0.42, 0, W + 3.6, 0.26, D + 3.6, C.red);
  A.roof(0, y + Hh + 0.62, 0, { w: W + 1, d: D + 1, ridge: W * 0.56, H: o.RH || 4.6, over: 2.7, upturn: 1.0, curve: 1.7, thick: 0.22, under: [0.5, 0.11, 0.07], nu: 16, nv: 9 });
  // offering box + hanging lanterns under the eave
  A.box('paint', 0, y, hd + 1.0, 1.5, 0.7, 0.8, C.wood);
  for (const sx of [-1, 1]) { A.cyl('glow', sx * 3.1, y + Hh - 1.5, hd + 1.2, 0.26, 0.26, 0.7, [1, 0.5, 0.35], 8); A.cyl('paint', sx * 3.1, y + Hh - 0.8, hd + 1.2, 0.02, 0.02, 0.8, C.black, 4); }
  return { top: y, hw: pw / 2, hd: pd / 2 };
}

function honden(A) { // small shrine
  A.box('paint', 0, -1.5, 0, 7.4, 2.3, 6.4, C.stone);
  for (let s = 0; s < 3; s++) A.box('paint', 0, -1.5, 3.4 + s * 0.34, 3, 2.3 - (s + 1) * 0.25, 0.36, C.stone);
  const y = 0.8, W = 4.6, D = 3.6, Hh = 3.0, hw = W / 2, hd = D / 2;
  A.box('paint', 0, y, 0, W + 1.6, 0.14, D + 1.6, C.wood);
  A.box('paint', 0, y + 0.14, 0, W - 0.2, Hh, D - 0.2, C.white);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) A.cyl('paint', sx * hw, y + 0.14, sz * hd, 0.17, 0.16, Hh, C.red, 8);
  for (const s of [-1, 1]) { A.box('paint', 0, y + Hh - 0.2, s * hd, W + 0.3, 0.3, 0.2, C.red); A.box('paint', s * hw, y + Hh - 0.2, 0, 0.2, 0.3, D + 0.3, C.red); }
  A.box('glow', 0, y + 0.45, hd - 0.05, 1.7, 2.0, 0.08, [1, 1, 1]);
  A.box('paint', 0, y + 0.45, hd, 0.07, 2.0, 0.05, C.red);
  A.railing(-hw - 0.7, hd + 0.7, -1.1, hd + 0.7, y + 0.14, C.red, 0.7, C.black); A.railing(1.1, hd + 0.7, hw + 0.7, hd + 0.7, y + 0.14, C.red, 0.7, C.black);
  A.railing(-hw - 0.7, -hd - 0.7, -hw - 0.7, hd + 0.7, y + 0.14, C.red, 0.7, C.black); A.railing(hw + 0.7, -hd - 0.7, hw + 0.7, hd + 0.7, y + 0.14, C.red, 0.7, C.black);
  A.box('paint', 0, y + Hh + 0.14, 0, W + 0.8, 0.3, D + 0.8, C.redDark);
  A.roof(0, y + Hh + 0.44, 0, { w: W + 0.4, d: D + 0.4, ridge: W * 0.7, H: 2.3, over: 1.5, upturn: 0.5, curve: 1.6, under: [0.5, 0.11, 0.07], nu: 10, nv: 6 });
  const ry = y + Hh + 0.44 + 2.3;
  for (const sx of [-1, 1]) for (const s of [-1, 1]) A.box('paint', sx * (W * 0.35 + 0.3), ry + 0.05, 0, 0.1, 1.5, 0.16, C.gold, { rx: s * 0.6, centered: true }); // chigi
  for (let k = -2; k <= 2; k++) A.cyl('paint', k * 0.6, ry + 0.38, -0.45, 0.11, 0.11, 0.9, C.gold, 6, { rx: Math.PI / 2 });
  A.box('paint', 0, y + 0.14, hd + 1.3, 1.1, 0.6, 0.6, C.wood);
  return { top: y + 0.14, hw: 3.7, hd: 3.2 };
}

function gate(A) { // roofed temple gate
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { A.cyl('paint', sx * 2.6, -1.5, sz * 1.1, 0.26, 0.24, 6.0, C.red, 9); A.box('paint', sx * 2.6, -1.5, sz * 1.1, 0.8, 1.7, 0.8, C.stone); }
  A.box('paint', 0, 3.7, 1.1, 6.2, 0.4, 0.3, C.red); A.box('paint', 0, 3.7, -1.1, 6.2, 0.4, 0.3, C.red);
  for (const sx of [-1, 1]) A.box('paint', sx * 2.6, 3.7, 0, 0.3, 0.4, 2.6, C.red);
  A.box('paint', 0, 4.3, 0, 6.4, 0.3, 3.0, C.redDark);
  A.roof(0, 4.6, 0, { w: 6.2, d: 2.8, ridge: 4.6, H: 2.0, over: 1.5, upturn: 0.55, under: [0.5, 0.11, 0.07], nu: 10, nv: 6 });
  for (const sx of [-1, 1]) A.cyl('glow', sx * 1.5, 2.9, 0, 0.3, 0.3, 0.75, [1, 0.5, 0.35], 8);
}

function torii(A, S = 1) {
  for (const sx of [-1, 1]) {
    A.cyl('paint', sx * 1.95 * S, -1.2, 0, 0.23 * S, 0.19 * S, 4.6 * S + 1.2, C.red, 10, { rz: sx * 0.035 });
    A.cyl('paint', sx * 1.97 * S, -1.2, 0, 0.29 * S, 0.27 * S, 0.55 * S + 1.2, C.black, 10, { rz: sx * 0.035 });
  }
  A.box('paint', 0, 3.42 * S, 0, 4.7 * S, 0.3 * S, 0.2 * S, C.red);
  A.box('paint', 0, 3.72 * S, 0, 0.3 * S, 0.62 * S, 0.16 * S, C.red);
  // shimaki + kasagi, curving up at the ends
  const n = 15, L = 6.3 * S;
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + i * L / n, x1 = x0 + L / n, xm = (x0 + x1) / 2;
    const f = (x) => 0.42 * S * Math.pow(Math.abs(x) / (L / 2), 2.4);
    const rz = Math.atan2(f(x1) - f(x0), x1 - x0);
    A.box('paint', xm * 0.9, 4.34 * S + f(xm) * 0.9, 0, L / n * 0.92, 0.3 * S, 0.3 * S, C.red, { rz });
    A.box('paint', xm, 4.64 * S + f(xm), 0, L / n * 1.03, 0.2 * S, 0.44 * S, C.black, { rz });
  }
}

function lantern(A) {
  A.cyl('paint', 0, -0.6, 0, 0.44, 0.40, 0.8, C.stone, 6);
  A.cyl('paint', 0, 0.2, 0, 0.17, 0.14, 0.95, C.stone, 6);
  A.cyl('paint', 0, 1.15, 0, 0.22, 0.38, 0.14, C.stone, 6);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) A.box('paint', sx * 0.19, 1.29, sz * 0.19, 0.07, 0.38, 0.07, C.stone);
  A.box('glow', 0, 1.31, 0, 0.33, 0.34, 0.33, [1, 1, 1]);
  A.cyl('paint', 0, 1.67, 0, 0.56, 0.1, 0.3, C.stoneDark, 6);
  A.cyl('paint', 0, 1.97, 0, 0.1, 0.0, 0.2, C.stone, 6);
}

function hokora(A) { // tiny wayside shrine
  A.box('paint', 0, -0.8, 0, 1.5, 1.3, 1.2, C.stone);
  A.box('paint', 0, 0.5, 0, 1.2, 0.12, 0.95, C.stoneDark);
  A.box('paint', 0, 0.62, 0, 0.85, 0.75, 0.62, C.woodLight);
  for (const sx of [-1, 1]) A.box('paint', sx * 0.42, 0.62, 0.31, 0.07, 0.75, 0.07, C.red);
  A.box('glow', 0, 0.72, 0.3, 0.42, 0.5, 0.04, [1, 1, 1]);
  A.box('paint', 0, 1.37, 0, 1.0, 0.08, 0.76, C.redDark);
  A.roof(0, 1.45, 0, { w: 0.9, d: 0.66, ridge: 0.7, H: 0.5, over: 0.34, upturn: 0.12, thick: 0.05, under: [0.5, 0.11, 0.07], nu: 6, nv: 4 });
}

function bridge(A, b, style) {
  const L = b.len, W = b.width, n = Math.max(10, Math.round(L / 1.1));
  const rail = style === 0 ? C.red : C.woodLight, cap = style === 0 ? C.black : C.wood;
  const yAt = (t) => lerp(b.ha, b.hb, t) - b.ha + 0.25 + b.rise * 4 * t * (1 - t);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const x0 = t0 * L, x1 = t1 * L, y0 = yAt(t0), y1 = yAt(t1);
    const rz = Math.atan2(y1 - y0, x1 - x0), sl = Math.hypot(x1 - x0, y1 - y0);
    const pc = i % 2 ? C.plank : [0.32, 0.22, 0.13];
    A.box('paint', tm * L, (y0 + y1) / 2 - 0.14, 0, sl * 1.02, 0.14, W, pc, { rz });
    for (const s of [-1, 1]) {
      A.box('paint', tm * L, (y0 + y1) / 2 - 0.36, s * (W / 2 - 0.1), sl * 1.02, 0.36, 0.22, rail, { rz });
      A.box('paint', tm * L, (y0 + y1) / 2 + 0.88, s * (W / 2 - 0.08), sl * 1.02, 0.1, 0.1, rail, { rz });
      A.box('paint', tm * L, (y0 + y1) / 2 + 0.45, s * (W / 2 - 0.08), sl * 1.02, 0.06, 0.06, rail, { rz });
      if (i % 2 === 0) { A.box('paint', x0, y0 - 0.1, s * (W / 2 - 0.08), 0.14, 1.12, 0.14, rail); A.box('paint', x0, y0 + 1.02, s * (W / 2 - 0.08), 0.2, 0.07, 0.2, cap); }
    }
  }
  for (const s of [-1, 1]) for (const t of [0, 1]) {
    A.box('paint', t * L, yAt(t) - 0.4, s * (W / 2 - 0.08), 0.24, 1.75, 0.24, rail);
    A.cyl('paint', t * L, yAt(t) + 1.35, s * (W / 2 - 0.08), 0.17, 0.0, 0.36, style === 0 ? C.gold : cap, 6);
  }
  const np = Math.max(1, Math.round(L / 9));
  for (let i = 1; i <= np; i++) {
    const t = i / (np + 1), y = yAt(t);
    for (const s of [-1, 1]) A.cyl('paint', t * L, -b.ha - 4.5, s * (W / 2 - 0.5), 0.24, 0.22, y + b.ha + 4.4, style === 0 ? C.redDark : C.wood, 8, { noCap: true });
    A.box('paint', t * L, y - 0.62, 0, 0.3, 0.26, W - 0.5, style === 0 ? C.redDark : C.wood);
  }
}

// ------------------------------------------------------------------ materials
function roofTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = mulberry32(9);
  g.fillStyle = '#39414b'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, '#1d2228'); gr.addColorStop(0.3, '#4c5663'); gr.addColorStop(0.5, '#66717f'); gr.addColorStop(0.7, '#4a5460'); gr.addColorStop(1, '#1d2228');
    g.fillStyle = gr; g.fillRect(x, 0, 32, 256);
  }
  for (let y = 0; y < 256; y += 64) { g.fillStyle = 'rgba(10,12,16,0.75)'; g.fillRect(0, y, 256, 5); g.fillStyle = 'rgba(160,175,190,0.25)'; g.fillRect(0, y + 5, 256, 4); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '170,180,190'},${0.05 + r() * 0.08})`; g.fillRect(r() * 256, r() * 256, 2 + r() * 10, 2 + r() * 14); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const SNOW_PATCH = /* glsl */`#include <normal_fragment_maps>
  {
    vec3 wn = inverseTransformDirection(normal, viewMatrix);
    float sn = uSnow * smoothstep(0.35, 0.8, wn.y + (texture2D(uNoiseTex, vWPos.xz * 0.21).r - 0.5) * 0.4);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.96), sn);
  }`;
function makeMaterials() {
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 });
  patch(paint, 'paint', (s) => {
    s.fragmentShader = s.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          float nz = texture2D(uNoiseTex, vWPos.xz * 0.37 + vWPos.y * 0.23).r;
          float nz2 = texture2D(uNoiseTex, vWPos.xy * 1.1 + vWPos.z * 0.7).g;
          diffuseColor.rgb *= 0.78 + 0.26 * nz + 0.16 * nz2;
        }`)
      .replace('#include <normal_fragment_maps>', SNOW_PATCH);
  });
  const rt = roofTexture(); rt.repeat.set(1 / 1.6, 1 / 1.9);
  const roof = new THREE.MeshStandardMaterial({ map: rt, bumpMap: rt, bumpScale: 2.0, vertexColors: true, roughness: 0.48, metalness: 0.2, side: THREE.DoubleSide });
  patch(roof, 'roof', (s) => { s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', SNOW_PATCH); });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  patch(glow, 'glow', (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.55, 0.52, 0.45) * (uAmbCol + uSunCol * 0.3), diffuseColor.rgb * vec3(1.0, 0.64, 0.28) * 5.5, smoothstep(0.12, 0.6, uNight));`);
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
        float a = pow(max(1.0 - d, 0.0), 2.2) * smoothstep(0.15, 0.7, uNight);
        float mist; vec3 tr = fogTransmit(cameraPosition, vWPos, mist);
        gl_FragColor = vec4(vec3(1.0, 0.52, 0.18) * a * 0.7 * tr, 1.0);
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
      pagoda: mk((A) => pagoda(A, 5)), pagoda3: mk((A) => pagoda(A, 3)), hall: mk((A) => hall(A)), honden: mk(honden), gate: mk(gate),
      torii: mk((A) => torii(A, 1)), lantern: mk(lantern), hokora: mk(hokora),
      pavilion: mk((A) => hall(A, { W: 7, D: 5.6, H: 3.4, bays: 3, baysD: 2, RH: 3.0 })),
    };
    const dq = new THREE.PlaneGeometry(1, 1); dq.rotateX(-Math.PI / 2);
    this.decalGeo = dq;
    this.sites = new Map(); this.minis = new Map(); this.bridges = new Map(); this.toriis = new Map();
    this.walk = []; // walkable platforms {site, hw, hd, lx, lz, top}
    this.tick = 0;
    this.onSite = []; // callbacks(site, group) for other systems (fauna)
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
    if (s.type === 0) {
      this.addParts(g, this.geo.hall, 0, 0, -17);
      walk.push({ lx: 0, lz: -17, hw: this.geo.hall.info.hw, hd: this.geo.hall.info.hd + 1.6, top: this.geo.hall.info.top });
      this.addParts(g, this.geo.pagoda, -24, 0, 1);
      walk.push({ lx: -24, lz: 1, hw: 4.8, hd: 4.8, top: 1.25 });
      this.addParts(g, this.geo.pavilion, 23, 0, -1, -Math.PI / 2);
      walk.push({ lx: 23, lz: -1, hw: this.geo.pavilion.info.hd, hd: this.geo.pavilion.info.hw, top: this.geo.pavilion.info.top });
      this.addParts(g, this.geo.gate, 0, 0, 36);
      for (const z of [29, 21, 13, 5]) { addLantern(-3.4, z); addLantern(3.4, z); }
      addLantern(-15, -4); addLantern(15, -4);
      path.box('paint', 0, 0.0, 14.5, 2.6, 0.07, 43, C.stone);
      path.box('paint', -12, 0.0, 1, 21.4, 0.06, 1.8, C.stone); path.box('paint', 11.5, 0.0, -1, 20.4, 0.06, 1.8, C.stone);
      glows.push({ x: 0, y: 0.1, z: -7, r: 9 });
      s.guards = [[-4.6, 31.5], [4.6, 31.5]];
      // a great torii and lantern avenue lead up to the gate
      const av = [];
      for (const [lz, sc] of [[58, 1.75], [76, 1.35]]) { const y = hAt(0, lz); if (y + s.h > 1.0) av.push({ x: 0, y, z: lz, s: sc }); }
      if (av.length) this.instanced(g, this.geo.torii, av);
      for (const lz of [44, 50, 66]) { const y = hAt(3.2, lz), y2 = hAt(-3.2, lz); if (y + s.h > 0.8 && y2 + s.h > 0.8) { addLantern(3.2, lz, y); addLantern(-3.2, lz, y2); } }
    } else if (s.type === 1) {
      this.addParts(g, this.geo.honden, 0, 0, -11);
      walk.push({ lx: 0, lz: -11, hw: 3.7, hd: 3.2 + 1.2, top: 0.94 });
      const tl = [{ x: 0, y: 0, z: 19, s: 1.3 }];
      // senbon torii climbing the slope towards the shrine
      let prev = s.h;
      for (let i = 0; i < 26; i++) {
        const lz = 27 + i * 2.5;
        const [wx, wz] = toWorld(0, lz);
        const h = W.height(wx, wz);
        if (h < 0.9 || Math.abs(h - prev) > 1.7) break;
        prev = h;
        tl.push({ x: 0, y: h - s.h, z: lz, s: 0.92 });
      }
      this.instanced(g, this.geo.torii, tl);
      addLantern(-2.7, 14); addLantern(2.7, 14); addLantern(-2.7, 3); addLantern(2.7, 3);
      path.box('paint', 0, 0.0, 9, 2.2, 0.07, 34, C.stone);
      glows.push({ x: 0, y: 0.1, z: -5, r: 6 });
      s.guards = [[-3.2, 17], [3.2, 17]];
    } else if (s.type === 3) {
      this.instanced(g, this.geo.torii, [{ x: 0, y: 0, z: 4.6, s: s.sc }]);
      this.addParts(g, this.geo.hokora, 0, 0, -3.4);
      addLantern(-2.3 - s.sc * 0.6, 3.2); addLantern(2.3 + s.sc * 0.6, 3.2);
      s.guards = [];
    } else {
      this.addParts(g, this.geo.pagoda3, 0, 0, 0, 0, 0.8);
      walk.push({ lx: 0, lz: 0, hw: 3.9, hd: 3.9, top: 1.0 });
      this.instanced(g, this.geo.torii, [{ x: 0, y: 0, z: 12, s: 1.0 }]);
      addLantern(-2.4, 8); addLantern(2.4, 8);
      path.box('paint', 0, 0.0, 8, 1.8, 0.06, 9, C.stone);
      s.guards = [];
    }
    const pg = path.build();
    if (pg.paint) { const m = new THREE.Mesh(pg.paint, this.mat.paint); m.receiveShadow = true; g.add(m); }
    this.instanced(g, this.geo.lantern, lanterns);
    this.decals(g, glows);
    g.updateMatrixWorld(true);
    g.traverse((o) => { o.matrixAutoUpdate = false; });
    this.scene.add(g);
    const rec = { site: s, group: g, walk, sin, cos };
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
        this.addParts(extra, this.geo.torii, 0, 0, 0, 0, 1.25);
        extra.updateMatrixWorld(true); extra.traverse((o) => { o.matrixAutoUpdate = false; });
        this.scene.add(extra);
      }
    }
    return { b, mesh: m, extra };
  }
  buildTorii(t) {
    const g = new THREE.Group();
    g.position.set(t.x, t.h, t.z); g.rotation.y = t.rot;
    this.addParts(g, this.geo.torii, 0, 0.6, 0, 0, 2.3);
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
  update() {
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
      move(r.group); move(r.mesh); move(r.extra);
    }
    this.tick = 0;
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
