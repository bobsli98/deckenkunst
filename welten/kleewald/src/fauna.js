// Small folk of the lawn: ants (by the hundred near their hill), ladybirds, snails; butterflies, bumblebees and
// dragonflies in the air; pollen, dandelion seeds, falling leaves, snow crystals and fireflies. And, once in a
// while, a real giant anteater wandering past on the horizon, one metre tall and as large as a mountain.
import * as THREE from 'three';
import { U, patch, GLSL_COMMON } from './shaders.js';
import { mulberry32, clamp, lerp, smoothstep } from './noise.js';

const V3 = THREE.Vector3;

// ------------------------------------------------------------------ meshes
class Mesher {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  ellipsoid(cx, cy, cz, rx, ry, rz, colFn, sw = 12, sh = 8, rot = null) {
    const base = this.p.length / 3, v = new V3(), nn = new V3();
    for (let j = 0; j <= sh; j++) for (let i = 0; i <= sw; i++) {
      const th = j / sh * Math.PI, ph = i / sw * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      v.set(x * rx, y * ry, z * rz); nn.set(x / rx, y / ry, z / rz).normalize();
      if (rot) { v.applyEuler(rot); nn.applyEuler(rot); }
      v.x += cx; v.y += cy; v.z += cz;
      const col = colFn(v);
      this.p.push(v.x, v.y, v.z); this.n.push(nn.x, nn.y, nn.z); this.c.push(col[0], col[1], col[2]);
    }
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const a = base + j * (sw + 1) + i, b = a + 1, c = a + sw + 1, d = c + 1;
      this.i.push(a, b, c, b, d, c);
    }
  }
  tube(path, radial, colFn) { // path: [[x,y,z,r]]
    const t = new V3(), nrm = new V3(), bin = new V3(), tmp = new V3();
    const base0 = this.p.length / 3;
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      if (i === 0) { tmp.set(1, 0, 0); nrm.crossVectors(t, tmp).normalize(); } else nrm.addScaledVector(t, -nrm.dot(t)).normalize();
      bin.crossVectors(t, nrm);
      for (let k = 0; k <= radial; k++) {
        const an = k / radial * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an);
        const dx = nrm.x * cs + bin.x * sn, dy = nrm.y * cs + bin.y * sn, dz = nrm.z * cs + bin.z * sn;
        const r = path[i][3];
        const v = new V3(path[i][0] + dx * r, path[i][1] + dy * r, path[i][2] + dz * r);
        const col = colFn(v, i / (path.length - 1));
        this.p.push(v.x, v.y, v.z); this.n.push(dx, dy, dz); this.c.push(col[0], col[1], col[2]);
      }
      if (i > 0) {
        const a0 = base0 + (i - 1) * (radial + 1), b0 = a0 + radial + 1;
        for (let k = 0; k < radial; k++) this.i.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1);
      }
    }
  }
  merge(o, m4) {
    const base = this.p.length / 3, v = new V3(), nm = new THREE.Matrix3().getNormalMatrix(m4);
    for (let i = 0; i < o.p.length; i += 3) {
      v.set(o.p[i], o.p[i + 1], o.p[i + 2]).applyMatrix4(m4); this.p.push(v.x, v.y, v.z);
      v.set(o.n[i], o.n[i + 1], o.n[i + 2]).applyMatrix3(nm).normalize(); this.n.push(v.x, v.y, v.z);
      this.c.push(o.c[i], o.c[i + 1], o.c[i + 2]);
    }
    for (const q of o.i) this.i.push(q + base);
  }
  recolor(col) { for (let i = 0; i < this.c.length; i += 3) { const l = 0.55 + 0.9 * (this.c[i] * 0.3 + this.c[i + 1] * 0.5 + this.c[i + 2] * 0.2); this.c[i] = col[0] * l; this.c[i + 1] = col[1] * l; this.c[i + 2] = col[2] * l; } return this; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

const FUR = [0.30, 0.275, 0.25], DARK = [0.045, 0.04, 0.04], PALE = [0.72, 0.69, 0.62], TAIL = [0.20, 0.17, 0.14];
function bodyColor(v) {
  // the giant anteater's signature: a black shoulder stripe edged in white, running diagonally up the flank
  const s = (v.z - 0.02) + (0.66 - v.y) * 1.25;
  const d = Math.abs(s - 0.34);
  if (d < 0.085) return DARK;
  if (d < 0.125) return PALE;
  const k = 0.85 + 0.3 * Math.sin(v.x * 40 + v.z * 23) * Math.sin(v.y * 31);
  return [FUR[0] * k, FUR[1] * k, FUR[2] * k];
}
function buildAnteaterParts() {
  const body = new Mesher();
  body.ellipsoid(0, 0.62, 0, 0.235, 0.25, 0.54, bodyColor, 14, 10);
  const head = new Mesher(); // pivot at (0, 0.66, 0.40)
  head.tube([[0, 0.0, -0.08, 0.2], [0, 0.0, 0.1, 0.165], [0, -0.03, 0.3, 0.115], [0, -0.1, 0.52, 0.075], [0, -0.2, 0.74, 0.05], [0, -0.29, 0.92, 0.036], [0, -0.33, 1.0, 0.024]], 9,
    (v, t) => (t > 0.93 ? DARK : t < 0.2 ? bodyColor(new V3(v.x, v.y + 0.66, v.z + 0.4)) : [lerp(0.36, 0.5, t), lerp(0.33, 0.45, t), lerp(0.30, 0.38, t)]));
  for (const sx of [-1, 1]) {
    head.ellipsoid(sx * 0.1, 0.1, 0.2, 0.035, 0.05, 0.03, () => [0.2, 0.17, 0.15], 6, 4);
    head.ellipsoid(sx * 0.088, 0.0, 0.36, 0.017, 0.017, 0.017, () => [0.01, 0.01, 0.01], 6, 4);
  }
  const tail = new Mesher(); // pivot at (0, 0.6, -0.48)
  const tc = (v) => { const k = 0.7 + 0.5 * Math.abs(Math.sin(v.y * 30 + v.z * 9)); return [TAIL[0] * k, TAIL[1] * k, TAIL[2] * k]; };
  tail.ellipsoid(0, -0.06, -0.52, 0.11, 0.3, 0.64, tc, 10, 8, new THREE.Euler(0.18, 0, 0));
  tail.ellipsoid(0, -0.2, -0.62, 0.07, 0.3, 0.6, tc, 8, 6, new THREE.Euler(0.1, 0, 0));
  const leg = (front) => {
    const m = new Mesher(); // pivot at hip, extends down 0.5
    m.tube([[0, 0.05, 0, 0.1], [0, -0.2, 0.01, 0.085], [0, -0.42, 0, 0.07], [0, -0.5, 0.02, 0.075]], 7,
      (v, t) => (front ? (t > 0.62 && t < 0.82 ? DARK : PALE) : (t > 0.75 ? DARK : FUR)));
    m.ellipsoid(0, -0.5, 0.07, 0.07, 0.035, 0.11, () => DARK, 6, 4);
    return m;
  };
  return { body, head, tail, legF: leg(true), legB: leg(false) };
}
const HIP = [[0.15, 0.52, 0.3], [-0.15, 0.52, 0.3], [0.15, 0.52, -0.32], [-0.15, 0.52, -0.32]];

// ant: about 6 mm long, so taller than you. Pivots: head at the front of the thorax, gaster at the petiole.
const ANT = [0.13, 0.06, 0.04], ANT2 = [0.22, 0.10, 0.06];
const antShade = (k) => (v) => { const s = 0.75 + 0.3 * Math.sin(v.x * 9 + v.z * 7) * 0.3; return [k[0] * s, k[1] * s, k[2] * s]; };
function buildAntParts() {
  const body = new Mesher();
  body.ellipsoid(0, 2.0, 0.3, 0.55, 0.5, 1.0, antShade(ANT2), 12, 8);        // thorax
  body.ellipsoid(0, 2.05, -0.95, 0.28, 0.42, 0.3, antShade(ANT2), 8, 6);     // petiole node
  const head = new Mesher(); // pivot (0, 2.15, 1.2)
  head.ellipsoid(0, 0.15, 0.55, 0.62, 0.55, 0.6, antShade(ANT), 12, 8);
  for (const sx of [-1, 1]) {
    head.ellipsoid(sx * 0.44, 0.3, 0.75, 0.16, 0.2, 0.2, () => [0.02, 0.02, 0.02], 8, 6); // eyes
    head.tube([[sx * 0.25, 0.55, 0.85, 0.05], [sx * 0.55, 1.4, 1.1, 0.045], [sx * 0.75, 1.5, 2.2, 0.04], [sx * 0.85, 1.2, 2.8, 0.035]], 5, () => ANT); // elbowed antennae
    head.tube([[sx * 0.2, -0.15, 1.05, 0.08], [sx * 0.08, -0.25, 1.4, 0.05]], 5, () => [0.3, 0.14, 0.06]); // mandibles
  }
  const tail = new Mesher(); // gaster, pivot (0, 2.05, -1.25)
  tail.ellipsoid(0, 0.15, -1.1, 0.95, 0.85, 1.35, (v) => { const k = 0.8 + 0.2 * Math.sin(v.z * 8); return [ANT[0] * k * 1.4, ANT[1] * k * 1.3, ANT[2] * k]; }, 14, 10);
  const leg = (sx, fwd) => {
    const m = new Mesher();
    m.tube([[0, 0, 0, 0.12], [sx * 0.9, 0.7, fwd * 0.6, 0.1], [sx * 1.7, -0.6, fwd * 1.2, 0.08], [sx * 2.1, -1.95, fwd * 1.5, 0.06]], 5, () => ANT);
    return m;
  };
  return { body, head, tail, legs: [leg(1, 0.9), leg(-1, 0.9), leg(1, 0), leg(-1, 0), leg(1, -0.9), leg(-1, -0.9)] };
}
const AHIP = [[0.35, 1.8, 0.75], [-0.35, 1.8, 0.75], [0.4, 1.75, 0.3], [-0.4, 1.75, 0.3], [0.35, 1.8, -0.15], [-0.35, 1.8, -0.15]];
// ladybird: 7 mm, a lacquered red dome with black spots
function buildLadyParts() {
  const spots = [[0.5, 0.6], [-0.5, 0.6], [0.9, -0.1], [-0.9, -0.1], [0.45, -0.75], [-0.45, -0.75], [0, 0.95]];
  const body = new Mesher();
  body.ellipsoid(0, 1.0, 0, 2.6, 1.9, 3.1, (v) => {
    if (v.y < 0.9) return [0.04, 0.04, 0.04];
    if (Math.abs(v.x) < 0.06) return [0.05, 0.03, 0.03];
    for (const [sx, sz] of spots) if (Math.hypot(v.x / 2.6 - sx * 0.6, v.z / 3.1 - sz * 0.7) < 0.17) return [0.03, 0.03, 0.03];
    return [0.78, 0.07, 0.04];
  }, 18, 12);
  const head = new Mesher(); // pivot (0, 1.0, 2.8)
  head.ellipsoid(0, 0, 0.5, 1.3, 0.9, 0.9, (v) => (Math.abs(v.x) > 0.65 && v.z > 0.5 ? [0.92, 0.92, 0.88] : [0.04, 0.04, 0.04]), 12, 8);
  for (const sx of [-1, 1]) head.tube([[sx * 0.4, 0.3, 1.2, 0.06], [sx * 0.7, 0.5, 2.0, 0.05]], 4, () => [0.05, 0.05, 0.05]);
  const tail = new Mesher(); tail.ellipsoid(0, 0, 0, 0.01, 0.01, 0.01, () => [0, 0, 0], 3, 2);
  const leg = (sx) => { const m = new Mesher(); m.tube([[0, 0, 0, 0.13], [sx * 0.9, -0.1, 0, 0.1], [sx * 1.6, -0.9, 0.1, 0.07]], 4, () => [0.05, 0.05, 0.05]); return m; };
  return { body, head, tail, legs: [leg(1), leg(-1), leg(1), leg(-1), leg(1), leg(-1)] };
}
const LHIP = [[1.4, 0.6, 1.2], [-1.4, 0.6, 1.2], [1.6, 0.5, 0], [-1.6, 0.5, 0], [1.4, 0.6, -1.2], [-1.4, 0.6, -1.2]];
// snail: a soft grey foot, two eye stalks, a striped shell
function buildSnailParts() {
  const skin = (v) => { const k = 0.8 + 0.2 * Math.sin(v.x * 3 + v.z * 4) * Math.sin(v.y * 5); return [0.52 * k, 0.46 * k, 0.40 * k]; };
  const body = new Mesher();
  body.ellipsoid(0, 2.2, 0, 4.2, 2.6, 20, skin, 14, 10);
  const pts = [];
  for (let i = 0; i <= 50; i++) { const t = i / 50, a = t * 2.6 * Math.PI * 2, rr = 1.2 * Math.exp(t * 2.0), y = 9 + (1 - t) * 4; pts.push([Math.sin(t * 0.6) * 1.5 + 0.0, y + Math.sin(a) * rr, -3 + Math.cos(a) * rr, rr * 0.7 + 0.3]); }
  body.tube(pts, 12, (v, t) => { const b = Math.sin(t * 50); return b > 0.55 ? [0.36, 0.22, 0.12] : [0.78 * (0.8 + 0.2 * t), 0.62 * (0.8 + 0.2 * t), 0.40]; });
  const head = new Mesher(); // pivot (0, 2.4, 17)
  head.ellipsoid(0, 0.8, 3, 3.2, 2.6, 4.5, skin, 12, 8);
  for (const sx of [-1, 1]) { head.tube([[sx * 1.2, 2.0, 4.5, 0.55], [sx * 2.2, 6.5, 6.5, 0.4], [sx * 2.6, 9.5, 7.2, 0.35]], 6, skin); head.ellipsoid(sx * 2.6, 9.8, 7.3, 0.7, 0.7, 0.7, () => [0.10, 0.08, 0.07], 8, 6); }
  const tail = new Mesher(); tail.ellipsoid(0, 0, -3, 3, 1.4, 6, skin, 10, 6);
  return { body, head, tail, legs: [] };
}


// ------------------------------------------------------------------ crawlers
export class Fauna {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.world = ctx.world;
    this.mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide }), 'bug', (s) => {
      s.fragmentShader = s.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoiseTex, vWPos.xy * 0.9 + vWPos.z * 0.7).r;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { vec3 Vr = normalize(vViewPosition); vec3 rw = inverseTransformDirection(reflect(-Vr, normal), viewMatrix); rw.y = abs(rw.y); totalEmissiveRadiance += skyLUT(rw) * (0.04 + 0.5 * pow(1.0 - max(dot(normal, Vr), 0.0), 4.0)) * 0.5; }');
    });
    const geoOf = (P) => ({ body: P.body.geometry(), head: P.head.geometry(), tail: P.tail.geometry(), legs: P.legs.map((l) => l.geometry()) });
    this.kinds = {
      ant: { geo: geoOf(buildAntParts()), hip: AHIP, headPos: [0, 2.15, 1.2], tailPos: [0, 2.05, -1.25], speed: 13, swing: 0.45, gait: 26, graze: 0.35, sc: [0.85, 0.3], look: 1 },
      lady: { geo: geoOf(buildLadyParts()), hip: LHIP, headPos: [0, 1.0, 2.8], tailPos: [0, 1, -2], speed: 6, swing: 0.5, gait: 22, graze: 0.2, sc: [0.9, 0.25], look: 0.5 },
      snail: { geo: geoOf(buildSnailParts()), hip: [], headPos: [0, 2.4, 17], tailPos: [0, 2.2, -17], speed: 1.6, swing: 0, gait: 1.2, graze: 0.15, sc: [0.8, 0.5], look: 0.3 },
    };
    this.list = [];
    this.rnd = mulberry32(ctx.world.seed * 31 + 5);
    this.spawnT = 0;
    if (ctx.structures) ctx.structures.onSite.push((rec, added) => this.onSite(rec, added));
  }
  onSite(rec, added) {
    if (!added) { this.list = this.list.filter((a) => { if (a.home.rec === rec) { this.scene.remove(a.root); return false; } return true; }); return; }
    const s = rec.site;
    const r = mulberry32(s.id & 0xffff);
    if (s.type === 0) { // the ant hill: workers on the mound and a column on the road
      const home = { x: s.x, z: s.z, r: 200, rec, trail: true };
      for (let i = 0; i < 16; i++) {
        const onRoad = i >= 6, lz = 40 + r() * 220, a = r() * 6.28, d = 100 + r() * 70;
        const lx = 6 * Math.sin(lz * 0.03);
        const x = onRoad ? s.x + lx * rec.cos + lz * rec.sin : s.x + Math.cos(a) * d, z = onRoad ? s.z - lx * rec.sin + lz * rec.cos : s.z + Math.sin(a) * d;
        this.spawn(x, z, home, 'ant');
      }
    } else if (s.type !== 3 && r() < 0.5) {
      const a = r() * 6.28, d = s.r1 * (0.4 + 0.4 * r());
      this.spawn(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, { x: s.x, z: s.z, r: s.r1, rec }, r() < 0.6 ? 'lady' : 'snail');
    }
  }
  spawn(x, z, home, kindName) {
    const K = this.kinds[kindName], G = K.geo;
    const root = new THREE.Group();
    const mk = (g) => { const m = new THREE.Mesh(g, this.mat); m.castShadow = true; m.receiveShadow = true; return m; };
    const body = mk(G.body); root.add(body);
    const head = mk(G.head); head.position.set(K.headPos[0], K.headPos[1], K.headPos[2]); root.add(head);
    const tail = mk(G.tail); tail.position.set(K.tailPos[0], K.tailPos[1], K.tailPos[2]); root.add(tail);
    const legs = K.hip.map((h, i) => { const l = mk(G.legs[i]); l.position.set(h[0], h[1], h[2]); root.add(l); return l; });
    const sc = K.sc[0] + this.rnd() * K.sc[1];
    root.scale.setScalar(sc);
    root.position.set(x, this.ctx.groundAt(x, z), z);
    this.scene.add(root);
    const a = { root, body, head, tail, legs, home, K, kind: kindName, heading: this.rnd() * 6.28, phase: this.rnd() * 6, state: 'idle', timer: this.rnd() * 2, target: null, sniff: 0, sc, pitch: 0 };
    this.list.push(a);
    return a;
  }
  clear() { for (const a of this.list) this.scene.remove(a.root); this.list = []; }
  rebase(sx, sz) {
    this._rbN = (this._rbN || 0) + 1;
    for (const a of this.list) {
      a.root.position.x -= sx; a.root.position.z -= sz;
      if (!a.home.rec) { if (a.home._rb !== this._rbN) { a.home.x -= sx; a.home.z -= sz; a.home._rb = this._rbN; } } else { a.home.x = a.home.rec.site.x; a.home.z = a.home.rec.site.z; }
      if (a.target) { a.target[0] -= sx; a.target[1] -= sz; }
    }
  }
  blocked(a, x, z) { return this.world.height(x, z) < 0.5; }
  pickTarget(a) {
    const p = a.root.position, rnd = this.rnd;
    if (a.home.trail && rnd() < 0.7) { // follow the ant road, to the hill or away from it
      const rec = a.home.rec, s = rec.site, dx = p.x - s.x, dz = p.z - s.z, lz0 = dx * rec.sin + dz * rec.cos;
      const lz = clamp(lz0 + (rnd() < 0.5 ? -1 : 1) * (15 + 25 * rnd()), 30, 255), lx = 6 * Math.sin(lz * 0.03) + (rnd() - 0.5) * 6;
      return [s.x + lx * rec.cos + lz * rec.sin, s.z - lx * rec.sin + lz * rec.cos];
    }
    for (let k = 0; k < 4; k++) {
      const an = rnd() * 6.28, d = (a.kind === 'snail' ? 6 : 10) + rnd() * 30;
      let tx = p.x + Math.cos(an) * d, tz = p.z + Math.sin(an) * d;
      if (Math.hypot(tx - a.home.x, tz - a.home.z) > a.home.r) { tx = lerp(tx, a.home.x, 0.6); tz = lerp(tz, a.home.z, 0.6); }
      if (!this.blocked(a, tx, tz)) return [tx, tz];
    }
    return null;
  }
  update(dt, time) {
    const cam = this.ctx.camera.position, rnd = this.rnd, G = this.ctx.groundAt;
    // wanderers near the traveller
    this.spawnT -= dt;
    if (this.spawnT < 0) {
      this.spawnT = 2;
      const wild = this.list.filter((a) => !a.home.rec);
      for (let i = wild.length - 1; i >= 0; i--) {
        const a = wild[i];
        if (Math.hypot(a.root.position.x - cam.x, a.root.position.z - cam.z) > 260) { this.scene.remove(a.root); this.list.splice(this.list.indexOf(a), 1); wild.splice(i, 1); }
      }
      if (wild.length < 12 && this.ctx.player.agl < 200 && U.uSeason.value.w < 0.6) {
        const an = rnd() * 6.28, d = 25 + rnd() * 110, x = cam.x + Math.cos(an) * d, z = cam.z + Math.sin(an) * d;
        if (this.world.height(x, z) > 1) {
          const q = rnd(), night = U.uNight.value > 0.5;
          if (q < 0.45 && !night) { const home = { x, z, r: 60, rec: null }; for (let i = 0; i < 3 + (rnd() * 3 | 0); i++) this.spawn(x + (rnd() - 0.5) * 20, z + (rnd() - 0.5) * 20, home, 'ant'); }
          else if (q < 0.75 && !night) this.spawn(x, z, { x, z, r: 40, rec: null }, 'lady');
          else this.spawn(x, z, { x, z, r: 30, rec: null }, 'snail');
        }
      }
    }
    for (const a of this.list) {
      const p = a.root.position;
      const dist = Math.hypot(p.x - cam.x, p.z - cam.z);
      a.root.visible = dist < 420;
      if (dist > 380) continue;
      a.timer -= dt;
      if (a.state === 'idle') {
        if (a.timer < 0) { const t = this.pickTarget(a); if (t) { a.target = t; a.state = 'walk'; a.timer = 40; } else a.timer = 1; }
      } else if (a.state === 'walk') {
        const dx = a.target[0] - p.x, dz = a.target[1] - p.z, dl = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let dh = want - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        a.heading += clamp(dh, -2.5 * dt, 2.5 * dt);
        const sp = a.K.speed * a.sc * (Math.abs(dh) > 1 ? 0.3 : 1);
        const nx = p.x + Math.sin(a.heading) * sp * dt, nz = p.z + Math.cos(a.heading) * sp * dt;
        if (dl < 1.5 || a.timer < 0 || this.blocked(a, nx, nz)) { a.state = 'sniff'; a.timer = (a.kind === 'ant' ? 0.4 : 1.5) + rnd() * (a.kind === 'ant' ? 1.5 : 5); }
        else { p.x = nx; p.z = nz; a.phase += dt * a.K.gait; }
      } else if (a.state === 'sniff') {
        if (a.timer < 0) { a.state = 'idle'; a.timer = 0.1 + rnd() * (a.kind === 'ant' ? 0.4 : 2); }
      }
      const walking = a.state === 'walk';
      const gh = G(p.x, p.z);
      p.y = lerp(p.y, gh, 1 - Math.exp(-dt * 12));
      const L = 3 * a.sc, fh = G(p.x + Math.sin(a.heading) * L, p.z + Math.cos(a.heading) * L), bh = G(p.x - Math.sin(a.heading) * L, p.z - Math.cos(a.heading) * L);
      a.pitch = lerp(a.pitch, Math.atan2(bh - fh, 2 * L), 1 - Math.exp(-dt * 6));
      a.root.rotation.set(a.pitch, a.heading, 0, 'YXZ');
      const sw = walking ? Math.sin(a.phase) : 0, sg = a.K.swing, tri = [1, -1, -1, 1, 1, -1];
      for (let i = 0; i < a.legs.length; i++) { a.legs[i].rotation.x = sw * sg * tri[i]; a.legs[i].rotation.z = (walking ? Math.max(0, Math.cos(a.phase) * tri[i]) : 0) * 0.25 * (i % 2 ? -1 : 1); }
      a.body.position.y = walking ? Math.abs(Math.cos(a.phase)) * 0.05 : 0;
      a.sniff = lerp(a.sniff, a.state === 'sniff' ? 1 : 0, 1 - Math.exp(-dt * 4));
      a.head.rotation.x = 0.05 + a.sniff * (a.K.graze + 0.05 * Math.sin(time * 9 + a.phase));
      a.head.rotation.y = Math.sin(time * 1.3 + a.phase) * (0.1 + 0.3 * a.sniff) * a.K.look;
      if (a.kind === 'snail') { const k = 1 + (walking ? 0.05 * Math.sin(a.phase * 2) : 0); a.body.scale.set(1, 1, k); a.head.position.z = a.K.headPos[2] * k; }
      else a.tail.rotation.x = Math.sin(time * 2 + a.phase) * 0.06;
    }
  }
}

// ------------------------------------------------------------------ the giant
// Every few minutes a real giant anteater crosses the far side of the garden. It is a metre tall:
// here that is a thousand units, a walking mountain range.
export class Giant {
  constructor(ctx) {
    this.ctx = ctx;
    const P = buildAnteaterParts();
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 'giantfur', (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.78 + 0.45 * texture2D(uNoiseTex, vWPos.xy * 0.004 + vWPos.z * 0.003).r * texture2D(uNoiseTex, vWPos.zy * 0.02).g;');
    });
    const mk = (m) => { const o = new THREE.Mesh(m.geometry(), mat); o.frustumCulled = false; return o; };
    this.root = new THREE.Group();
    this.body = mk(P.body); this.root.add(this.body);
    this.head = mk(P.head); this.head.position.set(0, 0.66, 0.40); this.root.add(this.head);
    this.tail = mk(P.tail); this.tail.position.set(0, 0.6, -0.48); this.root.add(this.tail);
    this.legs = HIP.map((h, i) => { const l = mk(i < 2 ? P.legF : P.legB); l.position.set(h[0], h[1], h[2]); this.root.add(l); return l; });
    const tg = new THREE.CylinderGeometry(0.004, 0.006, 1, 6); tg.translate(0, -0.5, 0); tg.rotateX(Math.PI / 2 + 0.3);
    this.tongue = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0xc8506a, roughness: 0.4 }));
    this.tongue.position.set(0, -0.31, 0.98); this.head.add(this.tongue);
    this.root.scale.setScalar(1000);
    this.root.visible = false;
    ctx.scene.add(this.root);
    this.wait = 70 + Math.random() * 60; this.active = false; this.phase = 0; this.lastStep = 0; this.seen = false;
  }
  start() {
    const p = this.ctx.player.pos, a = Math.random() * 6.28, D = 2600 + Math.random() * 1800, L = 11000;
    const side = new V3(Math.cos(a), 0, Math.sin(a)), dir = new V3(-side.z, 0, side.x);
    this.dir = dir; this.from = new V3(p.x, 0, p.z).addScaledVector(side, D).addScaledVector(dir, -L); this.len = 2 * L; this.t = 0; this.speed = 230;
    this.active = true; this.root.visible = true; this.seen = false;
  }
  clear() { this.active = false; this.root.visible = false; this.wait = 40 + Math.random() * 40; }
  rebase(sx, sz) { if (this.from) { this.from.x -= sx; this.from.z -= sz; } this.root.position.x -= sx; this.root.position.z -= sz; }
  update(dt, time) {
    if (!this.active) {
      this.wait -= dt;
      if (this.wait < 0 && U.uNight.value < 0.6 && U.uSeason.value.w < 0.7) this.start();
      return;
    }
    const W = this.ctx.world, cam = this.ctx.camera.position;
    this.t += this.speed * dt;
    const pos = this.from.clone().addScaledVector(this.dir, this.t);
    pos.y = Math.max(W.height(pos.x, pos.z), 0) - 15;
    this.root.position.copy(pos);
    this.root.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.phase += dt * 2.2;
    const sw = Math.sin(this.phase);
    this.legs[0].rotation.x = sw * 0.45; this.legs[3].rotation.x = sw * 0.45; this.legs[1].rotation.x = -sw * 0.45; this.legs[2].rotation.x = -sw * 0.45;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.012;
    const sniff = smoothstep(0.3, 0.8, Math.sin(time * 0.17) * 0.5 + 0.5);
    this.head.rotation.x = 0.1 + sniff * 0.35 + Math.sin(time * 6) * 0.02 * sniff;
    this.head.rotation.y = Math.sin(time * 0.3) * 0.25;
    this.tail.rotation.y = Math.sin(time * 0.9) * 0.12;
    const flick = Math.max(0, Math.sin(time * 5.5)) * sniff;
    this.tongue.scale.set(1, 1, 0.02 + 0.4 * flick); this.tongue.visible = flick > 0.05;
    const d = Math.hypot(pos.x - cam.x, pos.z - cam.z);
    if (Math.floor(this.phase / Math.PI) !== this.lastStep) { this.lastStep = Math.floor(this.phase / Math.PI); if (this.ctx.onStomp) this.ctx.onStomp(d); }
    if (!this.seen && d < 5200) { this.seen = true; if (this.ctx.say) this.ctx.say('Ein Ameisenbär zieht vorbei – ein echter, einen Meter gross', 8); }
    if (this.t > this.len) { this.active = false; this.root.visible = false; this.wait = 150 + Math.random() * 200; }
  }
}
// ------------------------------------------------------------------ particles
export class Particles {
  constructor(ctx) {
    this.ctx = ctx;
    const N = 5000, r = mulberry32(77);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) seed[i] = r();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = N;
    this.fall = new THREE.ShaderMaterial({
      uniforms: { ...U, uBox: { value: new V3(46, 26, 46) }, uFall: { value: 0.8 }, uCount: { value: 0 }, uSize: { value: 0.03 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uSpin: { value: 2 }, uDrift: { value: 1 }, uRound: { value: 0 }, uEmit: { value: 0 }, uShape: { value: 0 } },
      side: THREE.DoubleSide, fog: false,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform vec3 uBox; uniform float uFall, uCount, uSize, uSpin, uDrift, uTime; uniform vec3 uWind;
        varying vec2 vQ; varying vec3 vWPos; varying float vR; varying float vFade;
        void main() {
          vec3 p = aSeed.xyz * uBox;
          float sp = 0.6 + 0.8 * aSeed.w;
          p.y -= uTime * uFall * sp;
          p.xz += uWind.xz * uTime * uDrift * (0.5 + 0.5 * aSeed.y);
          p.x += sin(uTime * 0.9 * sp + aSeed.w * 40.0) * 0.7 * uDrift;
          p.z += cos(uTime * 0.7 * sp + aSeed.x * 30.0) * 0.7 * uDrift;
          p.y += sin(uTime * 0.5 * sp + aSeed.z * 20.0) * 0.4 * uDrift;
          p = mod(p - cameraPosition, uBox) - uBox * 0.5 + cameraPosition;
          float dc = length(p - cameraPosition);
          vFade = (1.0 - smoothstep(uBox.x * 0.36, uBox.x * 0.5, dc)) * step(aSeed.w, uCount) * smoothstep(uSize * 0.8, uSize * 2.5 + 0.5, dc);
          float a1 = uTime * uSpin * (0.5 + aSeed.x) + aSeed.y * 6.28, a2 = uTime * uSpin * 0.7 * (0.5 + aSeed.z) + aSeed.w * 6.28;
          vec3 ax = vec3(cos(a1), sin(a1) * cos(a2), sin(a1) * sin(a2));
          vec3 ay = normalize(cross(ax, vec3(sin(a2), cos(a2), 0.3)));
          float s = uSize * (0.7 + 0.6 * aSeed.z) * vFade;
          vec3 wp = p + (ax * position.x + ay * position.y) * s;
          vQ = position.xy; vWPos = wp; vR = aSeed.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vQ; varying vec3 vWPos; varying float vR; varying float vFade;
        ${GLSL_COMMON}
        uniform vec3 uColA, uColB; uniform float uRound; uniform float uEmit; uniform float uShape;
        void main() {
          if (vFade < 0.01) discard;
          // petal: ellipse with a small notch; snow: soft disc
          // petal / leaf: pointed oval; snow: disc
          float e;
          if (uShape < 0.5) e = abs(vQ.x) * 1.45 + vQ.y * vQ.y;                    // leaf / petal
          else if (uShape < 1.5) e = length(vQ);                                   // pollen, dust
          else if (uShape < 2.5) {                                                 // six-armed snow crystal
            float r = length(vQ), a = atan(vQ.y, vQ.x), sec = mod(a + 0.5236, 1.0472) - 0.5236;
            float arm = abs(r * sin(sec)), along = r * cos(sec);
            float side = abs(abs(r * sin(sec - sign(sec) * 0.6)) );
            float br = (abs(fract(along * 4.0) - 0.5) < 0.12 && along < 0.85) ? smoothstep(0.32, 0.0, abs(r * sin(abs(sec) - 0.5)) ) : 0.0;
            e = (arm < 0.07 + 0.05 * (1.0 - r) || r < 0.18 || br > 0.5) && r < 1.0 ? 0.0 : 2.0;
          } else {                                                                 // dandelion seed: a stalk and a parachute
            vec2 c = vQ - vec2(0.0, 0.25); float r = length(c), a = atan(c.x, c.y);
            float fil = r < 0.72 && abs(a) < 1.25 && abs(fract(a * 3.2) - 0.5) < 0.09 ? 0.0 : 2.0;
            float stalk = abs(vQ.x) < 0.035 && vQ.y < 0.25 && vQ.y > -0.95 ? 0.0 : 2.0;
            float seedB = length((vQ - vec2(0.0, -0.85)) * vec2(3.0, 1.0)) < 0.18 ? 0.0 : 2.0;
            e = min(min(fil, stalk), seedB);
          }
          if (e > 1.0) discard;
          vec3 base = mix(uColA, uColB, vR);
          vec3 col = base * (uAmbCol * 1.1 + uSunCol * 0.55 * cloudShadow(vWPos)) + base * uEmit * (0.12 + uSunCol * 0.2);
          gl_FragColor = vec4(applyFog(col, vWPos), 1.0);
        }`,
    });
    this.fallMesh = new THREE.Mesh(g, this.fall);
    this.fallMesh.frustumCulled = false; this.fallMesh.layers.set(1);
    ctx.scene.add(this.fallMesh);

    // fireflies
    const NF = 320, fp = new Float32Array(NF * 3), fs = new Float32Array(NF * 4);
    for (let i = 0; i < NF * 4; i++) fs[i] = r();
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 4));
    this.fly = new THREE.ShaderMaterial({
      uniforms: { ...U, uGround: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 600 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        attribute vec4 aSeed; uniform float uTime, uGround, uAmount, uScale; varying float vA; varying float vC;
        void main() {
          vec3 box = vec3(420.0, 1.0, 420.0);
          vec3 p = vec3(aSeed.x, 0.0, aSeed.z) * box;
          p.x += sin(uTime * 0.31 * (0.5 + aSeed.w) + aSeed.y * 20.0) * 40.0; p.z += cos(uTime * 0.27 * (0.5 + aSeed.y) + aSeed.w * 20.0) * 40.0;
          p.xz = mod(p.xz - cameraPosition.xz, box.xz) - box.xz * 0.5 + cameraPosition.xz;
          p.y = uGround + 8.0 + aSeed.y * 140.0 + sin(uTime * 0.6 + aSeed.w * 30.0) * 8.0;
          float dc = length(p - cameraPosition);
          float blink = pow(max(sin(uTime * (1.2 + aSeed.w * 1.4) + aSeed.x * 50.0), 0.0), 3.0);
          vA = blink * uAmount * (1.0 - smoothstep(150.0, 205.0, dc)) * step(aSeed.z * 0.999, uAmount + 0.3);
          vC = step(0.72, aSeed.x);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uScale * 4.0 / max(-mv.z, 0.5), 1.5, 90.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float; varying float vA; varying float vC;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (pow(max(1.0 - d, 0.0), 2.5) + step(d, 0.22) * 2.0) * vA;
          gl_FragColor = vec4(mix(vec3(0.70, 1.0, 0.25), vec3(1.0, 0.85, 0.3), vC) * a * 2.2, 1.0);
        }`,
    });
    this.flyMesh = new THREE.Points(fg, this.fly);
    this.flyMesh.frustumCulled = false; this.flyMesh.layers.set(1);
    ctx.scene.add(this.flyMesh);
    this.local = { flower: 0, leaf: 0 }; this.t = 0; this.amount = 0;
  }
  update(dt) {
    const ctx = this.ctx, cam = ctx.camera.position, W = ctx.world, s = U.uSeason.value;
    this.t -= dt;
    if (this.t < 0) {
      this.t = 0.5;
      const h = W.height(cam.x, cam.z), inf = W.info(cam.x, cam.z);
      const sites = W.sitesNear(cam.x, cam.z, cam.x, cam.z);
      const v = W.veg(cam.x, cam.z, h, 1, inf.rr, W.siteWeight(cam.x, cam.z, sites));
      this.local.flower = v.flower; this.local.leaf = v.leaf;
      this.ground = Math.max(h, 0);
    }
    const low = 1 - smoothstep(300, 900, ctx.player.agl);
    // what drifts through the air: pollen in spring, dandelion seeds in summer, falling leaves in autumn, snow crystals in winter
    const day = 1 - U.uNight.value;
    const w = [s.x * (0.4 + 0.6 * this.local.flower) * day, s.y * 0.8, s.z * (0.3 + 0.7 * this.local.leaf), s.w];
    let mode = 0; for (let k = 1; k < 4; k++) if (w[k] > w[mode]) mode = k;
    const u = this.fall.uniforms;
    if (mode !== this.mode) { this.amount = Math.max(0, this.amount - dt * 0.6); if (this.amount <= 0.001) this.mode = mode; }
    else this.amount += (w[mode] * low - this.amount) * (1 - Math.exp(-dt * 0.8));
    const set = (o) => { u.uShape.value = o.shape; u.uBox.value.set(o.box, o.box * 0.6, o.box); u.uSize.value = o.size; u.uFall.value = o.fall; u.uSpin.value = o.spin; u.uDrift.value = o.drift; u.uEmit.value = o.emit; u.uColA.value.setRGB(...o.a); u.uColB.value.setRGB(...o.b); u.uCount.value = this.amount * o.count; };
    if (this.mode === 0) set({ shape: 1, box: 70, size: 0.22, fall: 0.6, spin: 0.2, drift: 3, emit: 0.6, a: [1.0, 0.86, 0.35], b: [1.0, 0.95, 0.65], count: 0.5 });
    else if (this.mode === 1) set({ shape: 3, box: 420, size: 7, fall: 2.5, spin: 0.15, drift: 14, emit: 0.4, a: [0.95, 0.95, 0.92], b: [1.0, 1.0, 0.98], count: 0.03 });
    else if (this.mode === 2) set({ shape: 0, box: 900, size: 34, fall: 40, spin: 1.1, drift: 40, emit: 0.15, a: [0.85, 0.36, 0.08], b: [0.9, 0.62, 0.12], count: 0.012 });
    else set({ shape: 2, box: 90, size: 1.6, fall: 14, spin: 0.6, drift: 6, emit: 0.5, a: [0.92, 0.96, 1.0], b: [0.85, 0.92, 1.0], count: 0.6 });
    this.fallMesh.visible = u.uCount.value > 0.0005;
    const f = this.fly.uniforms;
    f.uGround.value = this.ground || 0;
    f.uAmount.value = U.uNight.value * (s.x * 0.3 + s.y * 1.0 + s.z * 0.25) * (ctx.player.agl < 400 ? 1 : 0);
    f.uScale.value = ctx.renderer.domElement.height;
    this.flyMesh.visible = f.uAmount.value > 0.01;
  }
}

// ------------------------------------------------------------------ flying insects
// geometry per kind; aWing: 0 on the body, 1 at the wing tip (sign gives the side), aPart: 0 body, 1 wing
function insectGeometry(kind) {
  const P = [], C = [], Wg = [], I = [];
  const v = (x, y, z, w, c) => { P.push(x, y, z); Wg.push(w); C.push(c[0], c[1], c[2]); return P.length / 3 - 1; };
  const body = (len, rad, cols, n = 8) => { // a spindle along z
    const base = P.length / 3, R = 6;
    for (let i = 0; i <= n; i++) { const t = i / n, z = (0.5 - t) * len, r = rad * Math.sin(Math.PI * Math.max(0.04, t)) ** 0.6; const c = cols(t); for (let k = 0; k <= R; k++) { const a = k / R * 6.2832; v(Math.cos(a) * r, Math.sin(a) * r, z, 0, c); } }
    for (let i = 0; i < n; i++) for (let k = 0; k < R; k++) { const a = base + i * (R + 1) + k, b = a + R + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  };
  const wing = (pts, colAt) => { // fan of triangles from the root point
    for (const s of [1, -1]) {
      const root = v(0.0, 0.05, pts[0][1], 0.0001 * s, colAt(0, 0));
      const ids = pts.slice(1).map(([x, z], i) => v(s * x, 0.05, z, s * Math.max(0.05, x / pts.reduce((m, q) => Math.max(m, q[0]), 1)), colAt(x, z)));
      for (let i = 0; i < ids.length - 1; i++) I.push(root, ids[i], ids[i + 1]);
    }
  };
  if (kind === 'butterfly') {
    body(18, 1.4, () => [0.12, 0.10, 0.08]);
    const fore = [[0, 2], [6, 6], [18, 9], [26, 7], [27, 1], [20, -3], [8, -2]], hind = [[0, -1], [6, -2], [16, -6], [19, -13], [12, -17], [4, -10]];
    const orange = [0.88, 0.36, 0.08], dark = [0.10, 0.07, 0.05], eye = [0.15, 0.30, 0.65], pale = [0.95, 0.90, 0.70];
    wing(fore, (x, z) => (x > 21 ? dark : Math.hypot(x - 18, z - 5) < 3.5 ? eye : Math.hypot(x - 18, z - 5) < 5 ? pale : orange));
    wing(hind, (x, z) => (Math.hypot(x - 12, z + 9) < 3.5 ? eye : x > 15 ? dark : orange));
  } else if (kind === 'bee') {
    body(16, 4.8, (t) => (Math.floor(t * 6) % 2 ? [0.95, 0.75, 0.10] : t > 0.85 ? [0.95, 0.94, 0.88] : [0.07, 0.06, 0.05]), 10);
    wing([[0, 3], [5, 5], [11, 3], [12, 0], [7, -1.5]], () => [0.75, 0.82, 0.88]);
  } else { // dragonfly
    body(64, 1.6, (t) => (t < 0.15 ? [0.10, 0.35, 0.55] : Math.floor(t * 14) % 2 ? [0.08, 0.30, 0.48] : [0.20, 0.65, 0.80]), 14);
    wing([[0, 22], [10, 25], [30, 24], [38, 21], [30, 18], [8, 19]], (x) => [0.75, 0.85, 0.92]);
    wing([[0, 15], [10, 16], [28, 13], [35, 10], [28, 8], [8, 11]], (x) => [0.72, 0.82, 0.90]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(Wg, 1));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}
export class Birds {
  constructor(ctx) {
    this.ctx = ctx;
    const mk = (kind, n, seed, o) => {
      const src = insectGeometry(kind), g = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'color', 'aWing', 'normal']) g.setAttribute(k, src.attributes[k]);
      g.setIndex(src.index);
      const off = new Float32Array(n * 4), r = mulberry32(seed);
      for (let i = 0; i < n; i++) { off[i * 4] = (r() - 0.5) * o.spread; off[i * 4 + 1] = (r() - 0.5) * o.spread * 0.5; off[i * 4 + 2] = (r() - 0.5) * o.spread; off[i * 4 + 3] = r(); }
      g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U, uCenter: { value: new V3() }, uHead: { value: 0 }, uFlap: { value: o.flap }, uAmp: { value: o.amp }, uBob: { value: o.bob } }, side: THREE.DoubleSide, fog: false,
        vertexShader: /* glsl */`
          attribute float aWing; attribute vec3 color; attribute vec4 aOff;
          uniform vec3 uCenter; uniform float uHead; uniform float uTime; uniform float uFlap; uniform float uAmp; uniform float uBob;
          varying vec3 vCol; varying vec3 vWPos; varying vec3 vN;
          void main() {
            float ph = uTime * uFlap * (0.9 + 0.2 * aOff.w) + aOff.w * 6.283;
            float side = sign(aWing), w = abs(aWing);
            float ang = (sin(ph) * 0.5 + 0.25) * uAmp * step(0.00005, w);
            vec3 p = position;
            if (w > 0.00005) { float r = abs(p.x); p.x = side * r * cos(ang); p.y += r * sin(ang); }
            vec3 n = normalize(normal + vec3(0.0, 0.3, 0.0));
            p += aOff.xyz + vec3(sin(uTime * 0.7 + aOff.w * 20.0), sin(uTime * 2.3 + aOff.w * 9.0) * uBob, cos(uTime * 0.6 + aOff.w * 13.0)) * vec3(8.0, 1.0, 8.0);
            float c = cos(uHead), s = sin(uHead);
            vec3 wp = uCenter + vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
            vCol = color; vWPos = wp; vN = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */`
          precision highp float; varying vec3 vCol; varying vec3 vWPos; varying vec3 vN;
          ${GLSL_COMMON}
          void main() {
            vec3 n = normalize(vN);
            vec3 L = uAmbCol * 1.1 + uSunCol * (0.35 + 0.6 * abs(dot(n, uSunDirW))) * cloudShadow(vWPos);
            gl_FragColor = vec4(applyFog(vCol * L, vWPos), 1.0);
          }`,
      });
      const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
      ctx.scene.add(mesh);
      return { kind, mesh, mat, pos: new V3(), heading: r() * 6.28, alt: 100, init: false, turn: r() < 0.5 ? 1 : -1, ...o, t: r() * 10 };
    };
    this.flocks = [
      mk('butterfly', 2, 5, { flap: 9, amp: 2.4, bob: 6, spread: 50, radius: 160, lift: 70, speed: 26, season: [1, 1, 0.5, 0] }),
      mk('butterfly', 1, 17, { flap: 8, amp: 2.4, bob: 6, spread: 10, radius: 260, lift: 120, speed: 30, season: [0.6, 1, 0.3, 0] }),
      mk('bee', 2, 9, { flap: 160, amp: 1.0, bob: 2, spread: 40, radius: 110, lift: 45, speed: 60, season: [1, 1, 0.4, 0] }),
      mk('dragon', 1, 13, { flap: 60, amp: 0.7, bob: 1, spread: 4, radius: 320, lift: 110, speed: 110, season: [0.3, 1, 0.5, 0] }),
    ];
  }
  clear() { for (const f of this.flocks) f.init = false; }
  rebase(sx, sz) { for (const f of this.flocks) { f.pos.x -= sx; f.pos.z -= sz; } }
  nearest(p, kind = 'bee') { let d = 1e9; for (const f of this.flocks) if (f.kind === kind && f.mesh.visible) d = Math.min(d, f.pos.distanceTo(p)); return d; }
  update(dt) {
    const p = this.ctx.player.pos, W = this.ctx.world, s = U.uSeason.value, day = 1 - U.uNight.value;
    for (const f of this.flocks) {
      const sw = f.season[0] * s.x + f.season[1] * s.y + f.season[2] * s.z + f.season[3] * s.w;
      f.mesh.visible = day > 0.4 && sw > 0.45;
      if (!f.mesh.visible) continue;
      f.t += dt;
      let dx = f.pos.x - p.x, dz = f.pos.z - p.z, d = Math.hypot(dx, dz);
      if (!f.init || d > 1600) { const a = Math.random() * 6.28, r0 = f.radius * 1.4; f.pos.set(p.x + Math.cos(a) * r0, 0, p.z + Math.sin(a) * r0); f.heading = a + Math.PI * 0.6; f.alt = Math.max(W.height(f.pos.x, f.pos.z), 0) + f.lift; f.init = true; dx = f.pos.x - p.x; dz = f.pos.z - p.z; d = r0; }
      const tang = Math.atan2(dx, dz) + f.turn * (Math.PI / 2 + clamp((d - f.radius) / 200, -0.7, 0.9));
      let dh = tang - f.heading + Math.sin(f.t * (f.kind === 'butterfly' ? 0.9 : 0.4)) * 0.9; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      f.heading += clamp(dh, -1.2 * dt, 1.2 * dt);
      const sp = f.speed * (f.kind === 'dragon' ? (0.2 + 1.2 * Math.max(0, Math.sin(f.t * 0.7))) : 1);
      f.pos.x += Math.sin(f.heading) * sp * dt; f.pos.z += Math.cos(f.heading) * sp * dt;
      const ah = Math.max(W.height(f.pos.x, f.pos.z), 0) + f.lift * (0.7 + 0.5 * Math.sin(f.t * 0.23));
      f.alt += (ah - f.alt) * (1 - Math.exp(-dt * 0.8));
      f.pos.y = f.alt;
      f.mat.uniforms.uCenter.value.copy(f.pos); f.mat.uniforms.uHead.value = f.heading;
    }
  }
}
