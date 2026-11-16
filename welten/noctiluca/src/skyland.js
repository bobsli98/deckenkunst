// Things that stand apart from the height field: floating rocks (with waterfalls and a few trees on top),
// natural stone arches, crystal spires, and the giant crystal crowns on the great mountains.
import * as THREE from 'three';
import { U, patch, GLSL_COMMON } from './shaders.js';
import { mulberry32, clamp, lerp, smoothstep } from './noise.js';
import { Geo, crystalInto, foliageMaterial } from './flora.js';
import { SP, FLOAT_CELL, MARK_CELL, VOLC_CELL } from './world.js';

const V3 = THREE.Vector3;
const NVAR = 6;
// rim outline of each rock variant (shared by the mesh and the landing test)
const VAR = [];
for (let v = 0; v < NVAR; v++) { const r = mulberry32(900 + v * 31); VAR.push({ p1: r() * 6.28, p2: r() * 6.28, p3: r() * 6.28, a1: 0.12 + r() * 0.12, a2: 0.06 + r() * 0.08, seed: 900 + v * 31 }); }
const rim = (V, th) => 1 + V.a1 * Math.sin(2 * th + V.p1) + V.a2 * Math.sin(3 * th + V.p2) + 0.06 * Math.sin(5 * th + V.p3);
const topY = (rr) => 0.085 * Math.pow(Math.max(0, 1 - rr * rr), 0.8);

function rockGeometry(V) {
  const r = mulberry32(V.seed), SEG = 36, RT = 5, RB = 12;
  const P = [], C = [], I = [];
  const lobes = [{ x: (r() - 0.5) * 0.2, z: (r() - 0.5) * 0.2, d: 1.0 + r() * 0.7, w: 0.42 + r() * 0.15 }];
  for (let k = 0; k < 5; k++) { const a = r() * 6.28, q = 0.3 + r() * 0.4; lobes.push({ x: Math.cos(a) * q, z: Math.sin(a) * q, d: 0.3 + r() * 0.7, w: 0.14 + r() * 0.14 }); }
  const depth = (x, z, rr) => {
    let d = 0.36 + 0.3 * Math.pow(1 - rr, 0.7);
    for (const l of lobes) d += l.d * Math.exp(-((x - l.x) ** 2 + (z - l.z) ** 2) / (l.w * l.w));
    return d * (1 - Math.pow(rr, 8) * 0.45) * (1 + 0.16 * Math.sin(x * 13 + z * 7) * Math.sin(z * 11 - x * 5) + 0.1 * Math.sin(x * 29 - z * 23));
  };
  // top
  const tc = P.length / 3; P.push(0, topY(0), 0); C.push(1, 1, 0);
  for (let k = 1; k <= RT; k++) for (let i = 0; i <= SEG; i++) {
    const th = i / SEG * 6.2832, rr = k / RT, q = rr * rim(V, th);
    P.push(Math.cos(th) * q, topY(rr) + 0.006 * Math.sin(th * 7 + k), Math.sin(th) * q); C.push(1, 1, 0);
  }
  for (let i = 0; i < SEG; i++) I.push(tc, tc + 2 + i, tc + 1 + i);
  for (let k = 1; k < RT; k++) { const a0 = tc + 1 + (k - 1) * (SEG + 1), b0 = a0 + SEG + 1; for (let i = 0; i < SEG; i++) I.push(a0 + i, a0 + i + 1, b0 + i, a0 + i + 1, b0 + i + 1, b0 + i); }
  // underside
  const bb = P.length / 3;
  for (let k = 0; k <= RB; k++) for (let i = 0; i <= SEG; i++) {
    const th = i / SEG * 6.2832, rr = 1 - k / RB, q = rr * rim(V, th) * (k === 0 ? 1 : 0.97 + 0.05 * Math.sin(th * 9 + k * 1.7) + 0.03 * Math.sin(th * 17 - k * 2.3));
    const x = Math.cos(th) * q, z = Math.sin(th) * q, d = k === 0 ? 0 : depth(x, z, rr);
    P.push(x, -d, z);
    C.push(0.62 + 0.38 * Math.exp(-d * 1.2), 0, k === 0 ? 0 : clamp(d * 0.9, 0, 1));
  }
  for (let k = 0; k < RB; k++) { const a0 = bb + k * (SEG + 1), b0 = a0 + SEG + 1; for (let i = 0; i < SEG; i++) I.push(a0 + i, b0 + i, a0 + i + 1, a0 + i + 1, b0 + i, b0 + i + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

function archGeometry(a, W) {
  const r = mulberry32(Math.floor(a.seed * 1e6) + 3), NS = 26, NR = 10;
  const P = [], C = [], I = [];
  const A = new V3(a.ax, a.ha, a.az), B = new V3(a.bx, a.hb, a.bz), dir = new V3().subVectors(B, A), side = new V3(-dir.z, 0, dir.x).normalize();
  const p1 = r() * 6.28, p2 = r() * 6.28, lean = (r() - 0.5) * 0.3;
  const at = (t) => { const p = new V3().lerpVectors(A, B, t); const k = 4 * t * (1 - t); p.y += a.rise * (k > 0 ? Math.pow(k, 0.8) : k) + (t < 0 || t > 1 ? -a.thick : 0); p.addScaledVector(side, lean * a.rise * k); return p; };
  const tng = new V3(), nrm = new V3(), bin = new V3();
  for (let i = 0; i <= NS; i++) {
    const t = -0.07 + 1.14 * i / NS, p = at(t);
    tng.subVectors(at(t + 0.01), at(t - 0.01)).normalize();
    bin.crossVectors(tng, side).normalize(); nrm.crossVectors(bin, tng).normalize();
    const rad = a.thick * (1.5 - 0.85 * Math.sin(Math.PI * clamp(t, 0, 1)));
    for (let k = 0; k <= NR; k++) {
      const an = k / NR * 6.2832, q = rad * (1 + 0.2 * Math.sin(3 * an + t * 9 + p1) + 0.1 * Math.sin(7 * an - t * 17 + p2));
      P.push(p.x + (nrm.x * Math.cos(an) + bin.x * Math.sin(an)) * q - a.x, p.y + (nrm.y * Math.cos(an) + bin.y * Math.sin(an)) * q, p.z + (nrm.z * Math.cos(an) + bin.z * Math.sin(an)) * q - a.z);
      C.push(0.8 + 0.2 * Math.sin(an * 2 + i), 1, 0.25);
    }
    if (i > 0) { const a0 = (i - 1) * (NR + 1), b0 = a0 + NR + 1; for (let k = 0; k < NR; k++) I.push(a0 + k, a0 + k + 1, b0 + k, a0 + k + 1, b0 + k + 1, b0 + k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

export class Skyland {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.world = ctx.world;
    // rock: vertex colour = (shade, grows meadow, vein glow)
    this.rockMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), 'skyrock', (s) => {
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uDetailN;\nvec3 skGlow = vec3(0.0);')
        .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          {
            vec2 dnA = texture2D(uDetailN, vWPos.xz * 0.09 + vWPos.y * 0.13).xy - 0.5, dnB = texture2D(uDetailN, vWPos.xz * 0.021 + vWPos.y * 0.033).xy - 0.5;
            normal = normalize(normal + mat3(viewMatrix) * vec3(dnA.x + dnB.x * 1.5, (dnA.y - dnB.y) * 0.8, dnA.y + dnB.y * 1.5) * 1.5);
          }
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          vec4 q1 = texture2D(uNoiseTex, vWPos.xz * 0.027 + vWPos.y * 0.011);
          vec4 q2 = texture2D(uNoiseTex, vWPos.xz * 0.23 + vWPos.y * 0.19);
          vec4 q0 = texture2D(uNoiseTex, vWPos.xz * 0.0031);
          float strata = texture2D(uNoiseTex, vec2(vWPos.y * 0.0113 + q1.r * 0.22, (vWPos.x + vWPos.z) * 0.0021)).a;
          vec3 rock = mix(vec3(0.50, 0.43, 0.35), vec3(0.62, 0.55, 0.46), q1.g);
          rock = mix(rock, vec3(0.52, 0.27, 0.21), smoothstep(0.52, 0.72, strata) * 0.8);
          rock = mix(rock, vec3(0.70, 0.62, 0.50), smoothstep(0.6, 0.8, texture2D(uNoiseTex, vec2(vWPos.y * 0.047 + q1.g * 0.3, 0.5 + (vWPos.x - vWPos.z) * 0.0013)).r) * 0.5);
          rock *= (0.62 + 0.5 * q2.b) * vColor.r;
          vec3 grass = mix(vec3(0.040, 0.175, 0.130), vec3(0.085, 0.250, 0.150), q0.r);
          grass = mix(grass, vec3(0.19, 0.11, 0.25), smoothstep(0.55, 0.9, q0.g) * 0.75);
          grass = mix(grass, mix(vec3(0.34, 0.17, 0.05), vec3(0.36, 0.10, 0.08), q0.b), uSeason.y * 0.8);
          grass = mix(grass, dot(grass, vec3(0.3, 0.5, 0.2)) * vec3(0.85, 1.05, 1.1), uSeason.z * 0.45);
          grass = mix(grass, vec3(0.15, 0.21, 0.25), uSeason.w * 0.6);
          grass *= 0.7 + 0.55 * q2.r;
          float top = smoothstep(0.5, 0.78, wn.y + (q2.g - 0.5) * 0.35) * vColor.g;
          vec3 col = mix(rock, grass, top);
          col = mix(col, vec3(0.80, 0.90, 0.95), uSnow * 0.8 * smoothstep(0.45, 0.8, wn.y + (q2.r - 0.5) * 0.3));
          diffuseColor.rgb = col;
          // veins of light in the underside
          float vein = smoothstep(0.50, 0.66, q2.a * 0.55 + q1.b * 0.45) * vColor.b * smoothstep(0.2, -0.3, wn.y);
          skGlow = mix(vec3(0.10, 0.95, 0.85), vec3(0.75, 0.3, 1.0), smoothstep(0.4, 0.6, q1.a)) * vein * (0.05 + uGlow * 1.3);
        }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += skGlow;');
    });
    this.rockGeo = VAR.map(rockGeometry);
    this.rockMesh = this.rockGeo.map((g) => { const m = new THREE.InstancedMesh(g, this.rockMat, 96); m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m; });
    // waterfalls: camera-facing ribbons that thin into mist
    const fg = new THREE.InstancedBufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0.25, 0, 0.5, 0.25, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.75, 0, 0.5, 0.75, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    fg.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6, 5, 7, 6, 6, 7, 8, 7, 9, 8]);
    this.fallData = new Float32Array(64 * 8);
    this.fallBuf = new THREE.InstancedInterleavedBuffer(this.fallData, 8, 1);
    fg.setAttribute('aF0', new THREE.InterleavedBufferAttribute(this.fallBuf, 4, 0));
    fg.setAttribute('aF1', new THREE.InterleavedBufferAttribute(this.fallBuf, 4, 4));
    fg.instanceCount = 0;
    this.fallMesh = new THREE.Mesh(fg, new THREE.ShaderMaterial({
      uniforms: { ...U }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: /* glsl */`
        attribute vec4 aF0; attribute vec4 aF1; uniform vec3 uWind;
        varying vec2 vUv; varying vec3 vWPos; varying vec2 vS;
        void main() {
          vec3 top = aF0.xyz;
          float w = aF0.w * (1.0 + position.y * 2.2);
          vec3 toCam = cameraPosition - top;
          vec3 side = normalize(vec3(toCam.z, 0.0, -toCam.x));
          vec3 wp = top + side * position.x * w - vec3(0.0, position.y * aF1.x, 0.0);
          wp.xz += uWind.xz * position.y * position.y * aF1.x * 0.07;
          vUv = vec2(position.x + 0.5, position.y); vWPos = wp; vS = aF1.xy;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */`
        precision highp float; varying vec2 vUv; varying vec3 vWPos; varying vec2 vS;
        ${GLSL_COMMON}
        void main() {
          float n = texture2D(uNoiseTex, vec2(vUv.x * 0.35 + vS.y, vUv.y * vS.x * 0.012 - uTime * 0.21)).r;
          float n2 = texture2D(uNoiseTex, vec2(vUv.x * 0.9 + vS.y * 3.0, vUv.y * vS.x * 0.03 - uTime * 0.43)).g;
          float edge = smoothstep(0.0, 0.32, vUv.x) * smoothstep(1.0, 0.68, vUv.x);
          float a = edge * (0.3 + 0.7 * smoothstep(0.3, 0.7, n * 0.6 + n2 * 0.4)) * (1.0 - smoothstep(0.3, 1.0, vUv.y)) * smoothstep(0.0, 0.02, vUv.y);
          vec3 col = (uAmbCol * 1.3 + uSunCol * 0.6 * cloudShadow(vWPos)) * vec3(0.86, 0.96, 1.0) + vec3(0.08, 0.9, 0.85) * uGlow * 0.55;
          gl_FragColor = vec4(applyFog(col, vWPos), a * 0.85);
        }`,
    }));
    this.fallMesh.frustumCulled = false; this.fallMesh.renderOrder = 4;
    this.scene.add(this.fallMesh);
    this.cells = new Map(); this.marks = new Map(); this.crowns = new Map();
    this.rocks = []; // flat list of rocks currently shown
    this.tick = 0; this.dirty = true; this.treePos = new V3(1e9, 0, 0);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
  }
  // trees and the big-crystal material need Flora's textures, so they are created on first use
  lazy() {
    if (this.treeMesh) return;
    const fl = this.ctx.flora;
    this.treeMesh = [SP.SCHIRM, SP.KORALLE, SP.QUASTE].map((sp) => {
      const S = fl.species[sp], m = new THREE.InstancedMesh(S.geo[2], S.mat, 500);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(500 * 3), 3);
      m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; this.scene.add(m); return m;
    });
    const S = fl.species[SP.CRYSTAL];
    this.crystalMat = foliageMaterial(S.mat.map, 'bigcrystal', 0, 0, 0, { a: [0.22, 0.90, 1.0], b: [0.72, 0.40, 1.0], i: 0.8, rim: 0.9, noFade: true });
    this.crystalMat.side = THREE.FrontSide; this.crystalMat.alphaToCoverage = false;
  }
  sync(map, cell, range, getter, builder, disposer) {
    const cam = this.ctx.camera.position;
    const ci = Math.floor(cam.x / cell), cj = Math.floor(cam.z / cell), n = Math.ceil(range / cell);
    const seen = new Set();
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const it = getter(i, j);
      if (!it || Math.hypot(it.x - cam.x, it.z - cam.z) > range) continue;
      seen.add(it.id);
      if (!map.has(it.id)) map.set(it.id, builder(it));
    }
    for (const [id, rec] of map) {
      if (seen.has(id)) continue;
      if (Math.hypot(rec.it.x - cam.x, rec.it.z - cam.z) > range * 1.12) { disposer(rec); map.delete(id); }
    }
  }
  buildMark(a) {
    this.lazy();
    let mesh;
    if (a.type === 0) { mesh = new THREE.Mesh(archGeometry(a, this.world), this.rockMat); mesh.position.set(a.x, 0, a.z); }
    else {
      const G = new Geo(); crystalInto(G, mulberry32(Math.floor(a.seed * 1e6) + 1), 7, 6, a.size * 0.3, a.size);
      mesh = new THREE.Mesh(G.build(), this.crystalMat); mesh.position.set(a.x, a.h - a.size * 0.04, a.z);
    }
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.updateMatrixWorld(); mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    return { it: a, mesh };
  }
  buildCrown(v) {
    this.lazy();
    const W = this.world, h = W.rawHeight(v.x, v.z), r = mulberry32(Math.floor(v.H * 977) + 5);
    const G = new Geo(); crystalInto(G, r, 9, 6, v.rc * 0.9, v.H * 0.42 + 120);
    const mesh = new THREE.Mesh(G.build(), this.crystalMat);
    mesh.position.set(v.x, h - 30, v.z); mesh.updateMatrixWorld(); mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    return { it: v, mesh };
  }
  update() {
    const cam = this.ctx.camera.position, W = this.world;
    if ((this.tick++ % 30) === 0) {
      const drop = (r) => { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); };
      this.sync(this.cells, FLOAT_CELL, 2700, (i, j) => W.floatAt(i, j), (f) => { this.dirty = true; return { it: f }; }, () => { this.dirty = true; });
      this.sync(this.marks, MARK_CELL, 3400, (i, j) => W.markAt(i, j), (a) => this.buildMark(a), drop);
      this.sync(this.crowns, VOLC_CELL, 30000, (i, j) => { const v = W.volcanoAt(i, j); if (v && v.id === undefined) { const o = W.origin(); v.id = (i + o[0] / VOLC_CELL) * 4096 + (j + o[1] / VOLC_CELL) + 0.5; } return v; }, (v) => this.buildCrown(v), drop);
      if (this.dirty) this.rebuild();
      else if (this.treePos.distanceToSquared(cam) > 150 * 150) this.rebuildTrees();
    }
  }
  rebuild() {
    this.dirty = false;
    this.rocks = [];
    for (const c of this.cells.values()) for (const k of c.it.list) this.rocks.push(k);
    const cnt = new Array(NVAR).fill(0);
    let nf = 0;
    const fd = this.fallData, s = new V3(), p = new V3();
    for (const k of this.rocks) {
      const m = this.rockMesh[k.variant];
      if (cnt[k.variant] >= 96) continue;
      this._q.setFromEuler(this._e.set(0, k.rot, 0)); s.set(k.R, k.R * k.sy, k.R); p.set(k.x, k.y, k.z);
      m.setMatrixAt(cnt[k.variant]++, this._m.compose(p, this._q, s));
      if (k.fall && nf < 64) {
        const V = VAR[k.variant], th = k.seed * 6.2832, q = rim(V, th) * 0.93, lx = Math.cos(th) * q * k.R, lz = Math.sin(th) * q * k.R;
        const c = Math.cos(k.rot), sn = Math.sin(k.rot);
        fd[nf * 8] = k.x + lx * c + lz * sn; fd[nf * 8 + 1] = k.y + 0.02 * k.R; fd[nf * 8 + 2] = k.z - lx * sn + lz * c; fd[nf * 8 + 3] = k.R * 0.13 + 1.2;
        fd[nf * 8 + 4] = Math.min(k.R * 3.2 + 40, k.y - 5); fd[nf * 8 + 5] = k.seed * 7.3; nf++;
      }
    }
    this.rockMesh.forEach((m, v) => { m.count = cnt[v]; m.visible = cnt[v] > 0; m.instanceMatrix.needsUpdate = true; });
    this.fallBuf.needsUpdate = true; this.fallMesh.geometry.instanceCount = nf; this.fallMesh.visible = nf > 0;
    this.rebuildTrees();
  }
  rebuildTrees() {
    this.lazy();
    const cam = this.ctx.camera.position; this.treePos.copy(cam);
    const cnt = [0, 0, 0], s = new V3(), p = new V3();
    for (const k of this.rocks) {
      if (Math.hypot(k.x - cam.x, k.z - cam.z) > 1000) continue;
      const r = mulberry32(Math.floor(k.seed * 1e6) + 11), n = Math.min(16, Math.round(k.R * k.R / 150));
      const c = Math.cos(k.rot), sn = Math.sin(k.rot), V = VAR[k.variant];
      for (let i = 0; i < n; i++) {
        const th = r() * 6.2832, rr = 0.12 + 0.6 * Math.sqrt(r()), q = rr * rim(V, th) * k.R, lx = Math.cos(th) * q, lz = Math.sin(th) * q;
        const w = r() < 0.6 ? 0 : r() < 0.5 ? 1 : 2, sc = (0.6 + 0.55 * r()) * clamp(k.R / 26, 0.5, 1.15), t = r();
        if (cnt[w] >= 500) continue;
        const m = this.treeMesh[w];
        this._q.setFromEuler(this._e.set(0, r() * 6.28, 0)); s.set(sc, sc, sc); p.set(k.x + lx * c + lz * sn, k.y + topY(rr) * k.R * k.sy - 0.2, k.z - lx * sn + lz * c);
        m.setMatrixAt(cnt[w], this._m.compose(p, this._q, s));
        m.instanceColor.setXYZ(cnt[w], t, (t * 7.13) % 1, (t * 13.7) % 1);
        cnt[w]++;
      }
    }
    this.treeMesh.forEach((m, w) => { m.count = cnt[w]; m.visible = cnt[w] > 0; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
  }
  clear() {
    for (const m of [this.marks, this.crowns]) { for (const r of m.values()) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); } m.clear(); }
    this.cells.clear(); this.dirty = true; this.tick = 0; this.rocks = [];
  }
  rebase(sx, sz) {
    for (const m of [this.marks, this.crowns]) for (const r of m.values()) {
      const it = r.it; it.x -= sx; it.z -= sz;
      if (it.ax !== undefined) { it.ax -= sx; it.az -= sz; it.bx -= sx; it.bz -= sz; }
      r.mesh.position.x -= sx; r.mesh.position.z -= sz; r.mesh.updateMatrix(); r.mesh.updateMatrixWorld(true);
    }
    for (const c of this.cells.values()) { c.it.x -= sx; c.it.z -= sz; for (const k of c.it.list) { k.x -= sx; k.z -= sz; } }
    this.dirty = true; this.tick = 0;
  }
  // a floating rock only counts as ground for someone who is already above it
  groundAt(x, z, h, y) {
    if (y === undefined) return h;
    let best = h;
    for (const k of this.rocks) {
      const dx = x - k.x, dz = z - k.z;
      if (dx * dx + dz * dz > k.R * k.R * 1.7) continue;
      const c = Math.cos(k.rot), sn = Math.sin(k.rot), lx = (dx * c - dz * sn) / k.R, lz = (dx * sn + dz * c) / k.R;
      const rr = Math.hypot(lx, lz) / rim(VAR[k.variant], Math.atan2(lz, lx));
      if (rr > 0.97) continue;
      const t = k.y + topY(rr) * k.R * k.sy;
      if (y > t - 1.6 && t > best) best = t;
    }
    return best;
  }
}
