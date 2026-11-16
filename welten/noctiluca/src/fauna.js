// Creatures: stilt walkers, the anteater who somehow made it here (glass helmet and all), stone guardian anteaters,
// drifting spores and light swarms, and the sky whales.
import * as THREE from 'three';
import { U, patch, GLSL_COMMON } from './shaders.js';
import { mulberry32, clamp, lerp, smoothstep } from './noise.js';

const V3 = THREE.Vector3;

// ------------------------------------------------------------------ anteater geometry
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

// stilt walker: a small striped body carried high on four thin legs; antennae and tail tuft glow after dark.
// (vertex colours above 1.25 mark the parts that light up)
const SGLOW = [0.5, 1.7, 1.45], SGLOW2 = [1.7, 0.6, 1.5];
function buildStelzerParts() {
  const base = [0.66, 0.60, 0.72], stripe = [0.17, 0.36, 0.42], belly = [0.82, 0.80, 0.76];
  const bc = (v) => { if (v.y < 2.28) return belly; const k = Math.sin(v.z * 8.5 + v.y * 2.0); return k > 0.45 ? stripe : base; };
  const body = new Mesher();
  body.ellipsoid(0, 2.45, 0, 0.36, 0.40, 0.86, bc, 14, 10);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) body.ellipsoid(sx * 0.345, 2.52, -0.42 + k * 0.42, 0.03, 0.06, 0.06, () => (k === 1 ? SGLOW2 : SGLOW), 6, 4);
  const head = new Mesher(); // pivot at (0, 2.68, 0.68)
  head.tube([[0, -0.12, -0.12, 0.2], [0, 0.45, 0.22, 0.13], [0, 1.05, 0.42, 0.1], [0, 1.5, 0.6, 0.11]], 8, (v, t) => (Math.sin(t * 20) > 0.3 ? stripe : base));
  head.ellipsoid(0, 1.58, 0.78, 0.11, 0.12, 0.23, () => base, 8, 6);
  for (const sx of [-1, 1]) {
    head.ellipsoid(sx * 0.1, 1.62, 0.82, 0.02, 0.025, 0.025, () => [0.02, 0.02, 0.03], 6, 4);
    head.tube([[sx * 0.05, 1.68, 0.7, 0.014], [sx * 0.12, 1.95, 0.6, 0.01], [sx * 0.2, 2.12, 0.42, 0.008]], 4, () => stripe);
    head.ellipsoid(sx * 0.2, 2.14, 0.4, 0.04, 0.04, 0.04, () => SGLOW, 6, 4);
  }
  const tail = new Mesher(); // pivot at (0, 2.5, -0.8)
  tail.tube([[0, 0, 0, 0.07], [0, -0.1, -0.4, 0.035], [0, -0.45, -0.75, 0.022], [0, -0.9, -0.9, 0.016]], 5, () => stripe);
  tail.ellipsoid(0, -1.0, -0.92, 0.06, 0.12, 0.06, () => SGLOW2, 6, 5);
  const leg = () => {
    const m = new Mesher();
    m.tube([[0, 0.1, 0, 0.1], [0, -0.85, 0.03, 0.06], [0, -1.2, 0.0, 0.072], [0, -2.18, 0.03, 0.04], [0, -2.3, 0.05, 0.065]], 6, (v, t) => (t > 0.86 ? stripe : base));
    return m;
  };
  return { body, head, tail, legF: leg(), legB: leg() };
}
const SHIP = [[0.24, 2.3, 0.55], [-0.24, 2.3, 0.55], [0.24, 2.3, -0.55], [-0.24, 2.3, -0.55]];

// ------------------------------------------------------------------ fauna manager
export class Fauna {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.world = ctx.world;
    const parts = buildAnteaterParts();
    
    this.mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), 'fur', (s) => {
      s.fragmentShader = s.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n float gkF = step(1.25, max(vColor.r, max(vColor.g, vColor.b)));\n diffuseColor.rgb *= mix(0.8 + 0.4 * texture2D(uNoiseTex, vWPos.xy * 3.0 + vWPos.z * 2.0).r, 0.42, gkF);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gkF * vColor.rgb * (uGlow * 1.5 + 0.05);');
    });
    const sp = buildStelzerParts();
    // the helmet: a glass capsule over the whole snout, a brass collar, an antenna with a little lamp
    const hm = new Mesher();
    hm.tube([[0, 0.02, -0.12, 0.3], [0, 0.02, -0.06, 0.31]], 14, () => [0.80, 0.62, 0.26]);
    hm.tube([[0, 0.28, 0.02, 0.012], [0, 0.52, -0.04, 0.008]], 4, () => [0.6, 0.6, 0.6]);
    hm.ellipsoid(0, 0.55, -0.045, 0.035, 0.035, 0.035, () => [1.7, 1.1, 0.4], 6, 5);
    this.kinds = {
      ant: { geo: { body: parts.body.geometry(), head: parts.head.geometry(), tail: parts.tail.geometry(), legF: parts.legF.geometry(), legB: parts.legB.geometry() }, hip: HIP, headPos: [0, 0.66, 0.40], tailPos: [0, 0.6, -0.48], speed: 0.75, swing: 0.5, graze: 0.32, sc: [1.15, 0.3] },
      stelz: { geo: { body: sp.body.geometry(), head: sp.head.geometry(), tail: sp.tail.geometry(), legF: sp.legF.geometry(), legB: sp.legB.geometry() }, hip: SHIP, headPos: [0, 2.68, 0.68], tailPos: [0, 2.5, -0.8], speed: 1.25, swing: 0.3, graze: 1.25, sc: [0.8, 0.5] },
    };
    this.helmetGeo = { frame: hm.geometry(), glass: new THREE.SphereGeometry(1, 20, 14).scale(0.3, 0.29, 0.7).translate(0, -0.1, 0.42) };
    this.glassMat = new THREE.ShaderMaterial({
      uniforms: { ...U }, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: /* glsl */`precision highp float; varying vec3 vN; varying vec3 vV; ${GLSL_COMMON}
        void main() {
          vec3 n = normalize(vN); float ndv = abs(dot(n, vV));
          float fr = pow(1.0 - ndv, 2.6);
          vec3 r = reflect(-vV, n); r.y = abs(r.y);
          float glint = pow(max(dot(reflect(-vV, n), uSunDirW), 0.0), 90.0);
          vec3 col = skyLUT(r) * (0.5 + fr) + uSunCol * glint * 1.5 + vec3(0.2, 0.9, 0.8) * fr * uGlow * 0.25;
          gl_FragColor = vec4(col, clamp(0.07 + fr * 0.7 + glint, 0.0, 0.95));
        }`,
    });
    // stone statue: all parts baked into one mesh, sitting proudly on a plinth, wearing a red bib
    const st = new Mesher(), M = new THREE.Matrix4();
    st.merge(parts.body, M.identity());
    st.merge(parts.head, M.makeRotationX(-0.25).setPosition(0, 0.66, 0.40));
    st.merge(parts.tail, M.makeRotationX(0.1).setPosition(0, 0.6, -0.48));
    HIP.forEach((h, i) => st.merge(i < 2 ? parts.legF : parts.legB, M.makeTranslation(h[0], h[1], h[2])));
    st.recolor([0.40, 0.40, 0.38]);
    const bib = new Mesher(); bib.ellipsoid(0, 0.5, 0.42, 0.2, 0.17, 0.12, () => [0.10, 0.62, 0.58], 10, 6);
    st.merge(bib, M.identity());
    const all = new Mesher();
    all.merge(st, M.makeScale(1.35, 1.35, 1.35).setPosition(0, 0.95, -0.1));
    const pl = new THREE.BoxGeometry(1.0, 1.9, 2.2).toNonIndexed(); pl.translate(0, 0.05, 0);
    const pm = new Mesher();
    for (let i = 0; i < pl.attributes.position.count; i++) { pm.p.push(pl.attributes.position.getX(i), pl.attributes.position.getY(i), pl.attributes.position.getZ(i)); pm.n.push(pl.attributes.normal.getX(i), pl.attributes.normal.getY(i), pl.attributes.normal.getZ(i)); pm.c.push(0.4, 0.4, 0.38); pm.i.push(i); }
    all.merge(pm, M.identity());
    this.statueGeo = all.geometry();
    this.statueMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), 'statue', (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        diffuseColor.rgb *= 0.72 + 0.5 * texture2D(uNoiseTex, vWPos.xz * 0.9 + vWPos.y * 0.7).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.22, 0.18), smoothstep(0.55, 0.8, texture2D(uNoiseTex, vWPos.xy * 0.6 + vWPos.z * 0.4).g) * 0.6 * step(diffuseColor.g, diffuseColor.r * 1.5 + 0.05));`);
    });
    this.list = [];
    this.rnd = mulberry32(ctx.world.seed * 31 + 5);
    this.spawnT = 0;
    if (ctx.structures) ctx.structures.onSite.push((rec, added) => this.onSite(rec, added));
  }
  onSite(rec, added) {
    if (!added) { this.list = this.list.filter((a) => { if (a.home.rec === rec) { this.scene.remove(a.root); return false; } return true; }); return; }
    const s = rec.site;
    for (const [lx, lz] of s.guards || []) {
      const m = new THREE.Mesh(this.statueGeo, this.statueMat);
      m.position.set(lx, 0, lz); m.rotation.y = lx < 0 ? 0.25 : -0.25; m.castShadow = true; m.receiveShadow = true;
      m.updateMatrix(); m.matrixAutoUpdate = false;
      rec.group.add(m); m.updateMatrixWorld(true);
    }
    const r = mulberry32(s.id & 0xffff);
    const n = s.type === 0 ? 2 : s.type === 1 ? 1 : s.type === 3 ? (r() < 0.25 ? 1 : 0) : (r() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = s.type === 3 ? 9 + 8 * r() : s.r1 * (0.45 + 0.4 * r());
      this.spawn(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, { x: s.x, z: s.z, r: s.type === 3 ? 22 : s.r1 * 0.92, rec }, 'ant');
    }
  }
  spawn(x, z, home, kindName = 'ant') {
    const K = this.kinds[kindName], G = K.geo;
    const root = new THREE.Group();
    const mk = (g) => { const m = new THREE.Mesh(g, this.mat); m.castShadow = true; m.receiveShadow = true; return m; };
    const body = mk(G.body); root.add(body);
    const head = mk(G.head); head.position.set(K.headPos[0], K.headPos[1], K.headPos[2]); root.add(head);
    const tail = mk(G.tail); tail.position.set(K.tailPos[0], K.tailPos[1], K.tailPos[2]); root.add(tail);
    const legs = K.hip.map((h, i) => { const l = mk(i < 2 ? G.legF : G.legB); l.position.set(h[0], h[1], h[2]); root.add(l); return l; });
    if (kindName === 'ant') {
      head.add(mk(this.helmetGeo.frame));
      const gl = new THREE.Mesh(this.helmetGeo.glass, this.glassMat); gl.renderOrder = 6; head.add(gl);
    }
    const sc = K.sc[0] + this.rnd() * K.sc[1];
    root.scale.setScalar(sc);
    root.position.set(x, this.world.height(x, z), z);
    this.scene.add(root);
    const a = { root, body, head, tail, legs, home, K, heading: this.rnd() * 6.28, phase: this.rnd() * 6, state: 'idle', timer: 1 + this.rnd() * 3, target: null, sniff: 0, sc, pitch: 0 };
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
  blocked(a, x, z) {
    const h = this.world.height(x, z);
    if (h < 0.6) return true;
    const rec = a.home.rec;
    if (rec) {
      const s = rec.site, dx = x - s.x, dz = z - s.z;
      const lx = dx * rec.cos - dz * rec.sin, lz = dx * rec.sin + dz * rec.cos;
      for (const w of rec.walk) if (Math.abs(lx - w.lx) < w.hw + 2.2 && Math.abs(lz - w.lz) < w.hd + 2.2) return true;
    }
    return false;
  }
  update(dt, time) {
    const cam = this.ctx.camera.position, W = this.world, rnd = this.rnd;
    // wild anteaters roam the meadows near the player
    this.spawnT -= dt;
    if (this.spawnT < 0) {
      this.spawnT = 2.5;
      const wild = this.list.filter((a) => !a.home.rec);
      for (let i = wild.length - 1; i >= 0; i--) {
        const a = wild[i];
        if (Math.hypot(a.root.position.x - cam.x, a.root.position.z - cam.z) > 300) { this.scene.remove(a.root); this.list.splice(this.list.indexOf(a), 1); wild.splice(i, 1); }
      }
      if (wild.length < 8 && this.ctx.player.agl < 160) { // herds of stilt walkers, now and then a lone anteater
        const an = rnd() * 6.28, d = 70 + rnd() * 90, x = cam.x + Math.cos(an) * d, z = cam.z + Math.sin(an) * d;
        const flat = (px, pz) => { const h = W.height(px, pz), h2 = W.height(px + 3, pz), h3 = W.height(px, pz + 3); return h > 1.0 && h < 400 && Math.abs(h2 - h) < 1.2 && Math.abs(h3 - h) < 1.2; };
        if (flat(x, z)) {
          if (rnd() < 0.2) this.spawn(x, z, { x, z, r: 35, rec: null }, 'ant');
          else { const home = { x, z, r: 60, rec: null }, n = 3 + Math.floor(rnd() * 3); for (let i = 0; i < n; i++) { const px = x + (rnd() - 0.5) * 30, pz = z + (rnd() - 0.5) * 30; if (flat(px, pz)) this.spawn(px, pz, home, 'stelz'); } }
        }
      }
    }
    for (const a of this.list) {
      const p = a.root.position;
      const dist = Math.hypot(p.x - cam.x, p.z - cam.z);
      a.root.visible = dist < 320;
      if (dist > 260) continue;
      a.timer -= dt;
      if (a.state === 'idle') {
        if (a.timer < 0) {
          for (let k = 0; k < 4; k++) {
            const an = rnd() * 6.28, d = 4 + rnd() * 16;
            let tx = p.x + Math.cos(an) * d, tz = p.z + Math.sin(an) * d;
            if (Math.hypot(tx - a.home.x, tz - a.home.z) > a.home.r) { tx = lerp(tx, a.home.x, 0.6); tz = lerp(tz, a.home.z, 0.6); }
            if (!this.blocked(a, tx, tz)) { a.target = [tx, tz]; a.state = 'walk'; a.timer = 30; break; }
          }
          if (a.state === 'idle') a.timer = 1;
        }
      } else if (a.state === 'walk') {
        const dx = a.target[0] - p.x, dz = a.target[1] - p.z, dl = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let dh = want - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        a.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
        const sp = a.K.speed * a.sc * (Math.abs(dh) > 1 ? 0.3 : 1);
        const nx = p.x + Math.sin(a.heading) * sp * dt, nz = p.z + Math.cos(a.heading) * sp * dt;
        if (dl < 0.6 || a.timer < 0 || this.blocked(a, nx + Math.sin(a.heading) * 0.8, nz + Math.cos(a.heading) * 0.8)) { a.state = 'sniff'; a.timer = 2.5 + rnd() * 5; }
        else { p.x = nx; p.z = nz; a.phase += dt * (a.K.swing < 0.4 ? 3.4 : 6.2); }
      } else if (a.state === 'sniff') {
        if (a.timer < 0) { a.state = 'idle'; a.timer = 0.5 + rnd() * 2; }
      }
      const walking = a.state === 'walk';
      const gh = W.height(p.x, p.z);
      p.y = lerp(p.y, gh, 1 - Math.exp(-dt * 10));
      const fh = W.height(p.x + Math.sin(a.heading) * 0.6, p.z + Math.cos(a.heading) * 0.6), bh = W.height(p.x - Math.sin(a.heading) * 0.6, p.z - Math.cos(a.heading) * 0.6);
      a.pitch = lerp(a.pitch, Math.atan2(bh - fh, 1.2), 1 - Math.exp(-dt * 5));
      a.root.rotation.set(a.pitch, a.heading, 0, 'YXZ');
      const sw = walking ? Math.sin(a.phase) : 0;
      const sg = a.K.swing; a.legs[0].rotation.x = sw * sg; a.legs[3].rotation.x = sw * sg; a.legs[1].rotation.x = -sw * sg; a.legs[2].rotation.x = -sw * sg;
      a.body.position.y = walking ? Math.abs(Math.cos(a.phase)) * 0.015 : 0;
      a.sniff = lerp(a.sniff, a.state === 'sniff' ? 1 : 0, 1 - Math.exp(-dt * 3));
      a.head.rotation.x = 0.05 + a.sniff * (a.K.graze + 0.06 * Math.sin(time * (a.K.graze > 1 ? 2 : 9) + a.phase)) + (walking ? Math.sin(a.phase * 2) * 0.03 : 0);
      a.head.rotation.y = Math.sin(time * 0.9 + a.phase) * (0.12 + 0.3 * a.sniff);
      a.tail.rotation.y = Math.sin(time * 1.3 + a.phase) * 0.14 + (walking ? sw * 0.08 : 0);
      a.tail.rotation.x = -0.05 + Math.sin(time * 0.7 + a.phase) * 0.04;
    }
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
      uniforms: { ...U, uBox: { value: new V3(46, 26, 46) }, uFall: { value: 0.8 }, uCount: { value: 0 }, uSize: { value: 0.03 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uSpin: { value: 2 }, uDrift: { value: 1 }, uRound: { value: 0 }, uEmit: { value: 0 } },
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
          p = mod(p - cameraPosition, uBox) - uBox * 0.5 + cameraPosition;
          float dc = length(p - cameraPosition);
          vFade = (1.0 - smoothstep(uBox.x * 0.36, uBox.x * 0.5, dc)) * step(aSeed.w, uCount) * smoothstep(0.8, 2.2, dc);
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
        uniform vec3 uColA, uColB; uniform float uRound; uniform float uEmit;
        void main() {
          if (vFade < 0.01) discard;
          // petal: ellipse with a small notch; snow: soft disc
          // petal / leaf: pointed oval; snow: disc
          float e = uRound > 0.5 ? length(vQ) : abs(vQ.x) * 1.45 + vQ.y * vQ.y;
          if (e > 1.0) discard;
          vec3 base = mix(uColA, uColB, vR);
          vec3 col = base * (uAmbCol * 1.1 + uSunCol * 0.55 * cloudShadow(vWPos)) + base * uEmit * (0.12 + uGlow * 1.6) * (uRound > 0.5 ? 1.0 - e * 0.7 : 1.0);
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
          vec3 box = vec3(56.0, 1.0, 56.0);
          vec3 p = vec3(aSeed.x, 0.0, aSeed.z) * box;
          p.x += sin(uTime * 0.31 * (0.5 + aSeed.w) + aSeed.y * 20.0) * 2.2; p.z += cos(uTime * 0.27 * (0.5 + aSeed.y) + aSeed.w * 20.0) * 2.2;
          p.xz = mod(p.xz - cameraPosition.xz, box.xz) - box.xz * 0.5 + cameraPosition.xz;
          p.y = uGround + 0.35 + aSeed.y * 3.2 + sin(uTime * 0.6 + aSeed.w * 30.0) * 0.4;
          float dc = length(p - cameraPosition);
          float blink = pow(max(sin(uTime * (1.2 + aSeed.w * 1.4) + aSeed.x * 50.0), 0.0), 3.0);
          vA = blink * uAmount * (1.0 - smoothstep(20.0, 28.0, dc)) * step(aSeed.z * 0.999, uAmount + 0.3);
          vC = step(0.72, aSeed.x);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uScale * 0.085 / max(-mv.z, 0.5), 1.5, 40.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float; varying float vA; varying float vC;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = (pow(max(1.0 - d, 0.0), 2.5) + step(d, 0.22) * 2.0) * vA;
          gl_FragColor = vec4(mix(vec3(0.25, 1.0, 0.85), vec3(1.0, 0.4, 0.9), vC) * a * 2.2, 1.0);
        }`,
    });
    this.flyMesh = new THREE.Points(fg, this.fly);
    this.flyMesh.frustumCulled = false; this.flyMesh.layers.set(1);
    ctx.scene.add(this.flyMesh);
    this.local = { sak: 0, forest: 0 }; this.t = 0; this.amount = 0;
  }
  update(dt) {
    const ctx = this.ctx, cam = ctx.camera.position, W = ctx.world, s = U.uSeason.value;
    this.t -= dt;
    if (this.t < 0) {
      this.t = 0.4;
      const h = W.height(cam.x, cam.z), inf = W.info(cam.x, cam.z);
      const sites = W.sitesNear(cam.x, cam.z, cam.x, cam.z);
      const v = W.veg(cam.x, cam.z, h, 1, inf.rr, W.siteWeight(cam.x, cam.z, sites));
      this.local.sak = Math.max(v.sakura * Math.max(v.forest, 0.3), W.siteWeight(cam.x, cam.z, sites)[0] * 0.6); this.local.forest = v.forest;
      this.ground = Math.max(h, 0);
    }
    const low = 1 - smoothstep(60, 160, ctx.player.agl);
    // what drifts through the air depends on the cycle: spores (bloom), warm motes (ember), a few pale motes (mist), ice needles (frost)
    const dusk = 1 - Math.abs(U.uNight.value * 2 - 1);
    const spores = s.x * (0.3 + 0.7 * Math.max(this.local.sak, this.local.forest)) * (0.6 + 0.6 * dusk), motes = s.y * 0.55 + s.z * 0.2, snow = s.w * 0.8;
    const u = this.fall.uniforms;
    let target, mode;
    if (snow >= spores && snow >= motes) { mode = 2; target = snow; } else if (motes > spores) { mode = 1; target = motes; } else { mode = 0; target = spores; }
    if (mode !== this.mode) { this.amount = Math.max(0, this.amount - dt * 0.6); if (this.amount <= 0.001) this.mode = mode; }
    else this.amount += (target * low - this.amount) * (1 - Math.exp(-dt * 0.8));
    u.uCount.value = this.amount * (this.mode === 2 ? 0.8 : 0.5);
    if (this.mode === 2) { u.uColA.value.setRGB(0.85, 0.97, 1.0); u.uColB.value.setRGB(0.75, 0.9, 1.0); u.uSize.value = 0.02; u.uFall.value = 0.5; u.uSpin.value = 1.2; u.uDrift.value = 0.5; u.uRound.value = 0; u.uEmit.value = 0.35; }
    else if (this.mode === 1) { u.uColA.value.setRGB(1.0, 0.62, 0.22); u.uColB.value.setRGB(1.0, 0.82, 0.5); u.uSize.value = 0.026; u.uFall.value = -0.12; u.uSpin.value = 0.4; u.uDrift.value = 1.4; u.uRound.value = 1; u.uEmit.value = 0.8; }
    else { u.uColA.value.setRGB(1.0, 0.55, 0.85); u.uColB.value.setRGB(0.45, 1.0, 0.88); u.uSize.value = 0.034 + 0.02 * dusk; u.uFall.value = -0.28; u.uSpin.value = 0.3; u.uDrift.value = 0.7; u.uRound.value = 1; u.uEmit.value = 1.0; }
    this.fallMesh.visible = u.uCount.value > 0.002;
    const f = this.fly.uniforms;
    f.uGround.value = this.ground || 0;
    f.uAmount.value = U.uGlow.value * low * (s.x * 1.0 + s.y * 0.8 + s.z * 0.6 + s.w * 0.4) * (ctx.player.agl < 40 ? 1 : 0);
    f.uScale.value = ctx.renderer.domElement.height;
    this.flyMesh.visible = f.uAmount.value > 0.01;
  }
}

// ------------------------------------------------------------------ sky whales
function whaleGeometry() {
  const NS = 24, NC = 10, P = [], C = [], G = [], I = [];
  for (const side of [1, -1]) {
    const base = P.length / 3;
    for (let i = 0; i <= NS; i++) for (let j = 0; j <= NC; j++) {
      const s = -1 + 2 * i / NS, as = Math.abs(s), c = j / NC;
      const chord = 1.2 * Math.pow(Math.max(0, 1 - Math.pow(as, 1.7)), 0.75) + 0.015;
      const zLead = 0.6 - 0.32 * Math.pow(as, 1.5) - 0.3 * as * as;
      const thick = 0.12 * Math.pow(1 - as, 1.25) * Math.pow(Math.sin(Math.PI * Math.pow(c, 0.6)), 0.8) + 0.003;
      const hump = 0.07 * Math.exp(-as * as * 30) * Math.sin(Math.PI * Math.pow(c, 0.5)); // the back
      P.push(s, side > 0 ? thick + hump : -thick * 0.55, zLead - c * chord);
      if (side > 0) {
        const m = 0.5 + 0.5 * Math.sin(s * 11 + c * 5) * Math.sin(c * 13 - s * 3), k = 0.75 + 0.5 * m;
        C.push(0.055 * k, 0.17 * k, 0.24 * k);
        const spots = Math.pow(Math.max(0, Math.sin(as * 21) * Math.sin(c * 15 + as * 4)), 6);
        G.push(Math.max(spots * 0.9, c > 0.9 ? 0.8 : 0) * (as > 0.06 ? 1 : 0.3));
      } else {
        C.push(0.60, 0.70, 0.72);
        G.push(Math.pow(Math.max(0, Math.sin(c * 19)), 8) * 0.7 * (1 - as));
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NC; j++) {
      const a = base + i * (NC + 1) + j, b = a + 1, c2 = a + NC + 1, d = c2 + 1;
      if (side > 0) I.push(a, b, c2, b, d, c2); else I.push(a, c2, b, b, c2, d);
    }
  }
  // tail: a long whip with a light at its end
  const tb = P.length / 3, TS = 10;
  for (let i = 0; i <= TS; i++) for (let k = 0; k < 4; k++) {
    const t = i / TS, a = k / 4 * Math.PI * 2, r = 0.03 * (1 - t) + 0.006;
    P.push(Math.cos(a) * r, Math.sin(a) * r + 0.02, -0.58 - t * 1.9);
    C.push(0.06, 0.16, 0.22); G.push(t > 0.85 ? 1 : 0.15 * t);
  }
  for (let i = 0; i < TS; i++) for (let k = 0; k < 4; k++) { const a = tb + i * 4 + k, b = tb + i * 4 + (k + 1) % 4; I.push(a, b, a + 4, b, b + 4, a + 4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return { pos: g.attributes.position, nor: g.attributes.normal, col: new THREE.Float32BufferAttribute(C, 3), glow: new THREE.Float32BufferAttribute(G, 1), idx: g.index };
}
export class Birds {
  constructor(ctx) {
    this.ctx = ctx;
    const W = whaleGeometry();
    const mk = (sizes, seed, o) => {
      const n = sizes.length, g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', W.pos); g.setAttribute('normal', W.nor); g.setAttribute('color', W.col); g.setAttribute('aGlow', W.glow); g.setIndex(W.idx);
      const off = new Float32Array(n * 4), scl = new Float32Array(n), r = mulberry32(seed);
      for (let i = 0; i < n; i++) {
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1), rank = Math.ceil(i / 2);
        off[i * 4] = side * rank * (26 + r() * 14); off[i * 4 + 1] = i === 0 ? 0 : -6 - r() * 12; off[i * 4 + 2] = -rank * (20 + r() * 22); off[i * 4 + 3] = r();
        scl[i] = sizes[i];
      }
      g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
      g.setAttribute('aScl', new THREE.InstancedBufferAttribute(scl, 1));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...U, uCenter: { value: new V3() }, uHead: { value: 0 }, uBank: { value: 0 } }, fog: false,
        vertexShader: /* glsl */`
          attribute vec3 color; attribute float aGlow; attribute vec4 aOff; attribute float aScl;
          uniform vec3 uCenter; uniform float uHead; uniform float uBank; uniform float uTime;
          varying vec3 vCol; varying vec3 vWPos; varying vec3 vN; varying float vGl;
          void main() {
            float ph = uTime * (0.95 - aScl * 0.012) + aOff.w * 6.283;
            float as = abs(position.x);
            vec3 p = position;
            float w = as * as * 0.44;
            p.y += sin(ph - as * 1.5) * w + sin(ph * 0.5) * 0.04;
            float dydx = sign(position.x) * (cos(ph - as * 1.5) * -1.5 * w + sin(ph - as * 1.5) * as * 0.88);
            float tz = max(-position.z - 0.6, 0.0);
            p.x += sin(ph * 1.3 - tz * 2.0) * 0.07 * tz; p.y += sin(ph - 1.2 - tz * 1.5) * 0.10 * tz;
            vec3 n = normalize(vec3(normal.x - dydx * normal.y, normal.y, normal.z));
            float cb = cos(uBank), sb = sin(uBank);
            p = vec3(p.x * cb - p.y * sb, p.x * sb + p.y * cb, p.z); n = vec3(n.x * cb - n.y * sb, n.x * sb + n.y * cb, n.z);
            p = p * aScl + aOff.xyz + vec3(0.0, sin(uTime * 0.23 + aOff.w * 9.0) * 3.0, 0.0);
            float c = cos(uHead), s = sin(uHead);
            vec3 wp = uCenter + vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
            vN = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
            vCol = color; vWPos = wp; vGl = aGlow * (0.75 + 0.25 * sin(uTime * 0.8 + position.x * 9.0 + aOff.w * 30.0));
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */`
          precision highp float; varying vec3 vCol; varying vec3 vWPos; varying vec3 vN; varying float vGl;
          ${GLSL_COMMON}
          void main() {
            vec3 n = normalize(vN);
            vec3 V = normalize(cameraPosition - vWPos);
            vec3 L = uAmbCol * (0.8 + 0.35 * n.y) + uSunCol * max(dot(n, uSunDirW), 0.0) * 0.8;
            vec3 col = vCol * L + uAmbCol * pow(1.0 - abs(dot(n, V)), 3.0) * 0.25;
            col += mix(vec3(0.15, 0.95, 0.9), vec3(0.6, 0.5, 1.0), step(0.0, -n.y)) * vGl * (0.06 + uGlow * 1.5);
            gl_FragColor = vec4(applyFog(col, vWPos), 1.0);
          }`,
      });
      const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
      ctx.scene.add(mesh);
      return { mesh, mat, pos: new V3(), heading: r() * 6.28, alt: 200, init: false, turn: r() < 0.5 ? 1 : -1, radius: o.radius, lift: o.lift, speed: o.speed, bank: 0 };
    };
    // pods: a matriarch with two calves, a lone giant high up, a pair
    this.flocks = [mk([21, 11, 9], 5, { radius: 300, lift: 120, speed: 7 }), mk([30], 9, { radius: 620, lift: 260, speed: 8 }), mk([16, 13], 13, { radius: 440, lift: 170, speed: 6.5 })];
  }
  clear() { for (const f of this.flocks) f.init = false; }
  rebase(sx, sz) { for (const f of this.flocks) { f.pos.x -= sx; f.pos.z -= sz; } }
  // nearest pod, for the whale song
  nearest(p) { let d = 1e9; for (const f of this.flocks) d = Math.min(d, f.pos.distanceTo(p)); return d; }
  update(dt) {
    const p = this.ctx.player.pos, W = this.ctx.world;
    for (const f of this.flocks) {
      let dx = f.pos.x - p.x, dz = f.pos.z - p.z, d = Math.hypot(dx, dz);
      if (!f.init || d > 1800) { const a = Math.random() * 6.28, r0 = f.radius * 1.3; f.pos.set(p.x + Math.cos(a) * r0, 0, p.z + Math.sin(a) * r0); f.heading = a + Math.PI * 0.6; f.alt = Math.max(W.height(f.pos.x, f.pos.z), 0) + f.lift; f.init = true; dx = f.pos.x - p.x; dz = f.pos.z - p.z; d = r0; }
      // circle the traveller at a respectful distance
      const tang = Math.atan2(dx, dz) + f.turn * (Math.PI / 2 + clamp((d - f.radius) / 300, -0.7, 0.9));
      let dh = tang - f.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const turn = clamp(dh, -0.07 * dt, 0.07 * dt);
      f.heading += turn;
      f.bank += (clamp(-turn / Math.max(dt, 1e-4) * 3.5, -0.3, 0.3) - f.bank) * (1 - Math.exp(-dt * 0.8));
      f.pos.x += Math.sin(f.heading) * f.speed * dt; f.pos.z += Math.cos(f.heading) * f.speed * dt;
      const ah = Math.max(W.height(f.pos.x + Math.sin(f.heading) * 160, f.pos.z + Math.cos(f.heading) * 160), W.height(f.pos.x, f.pos.z), 0) + f.lift;
      f.alt += (ah - f.alt) * (1 - Math.exp(-dt * 0.2));
      f.pos.y = f.alt;
      f.mat.uniforms.uCenter.value.copy(f.pos); f.mat.uniforms.uHead.value = f.heading; f.mat.uniforms.uBank.value = f.bank;
    }
  }
}
