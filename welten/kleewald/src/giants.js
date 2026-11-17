// The real world, seen from 3 mm: trees whose trunks are cliffs and whose crowns are clouds,
// a garden hose lying across the lawn like a pipeline, sunflowers taller than towers.
import * as THREE from 'three';
import { U, patch } from './shaders.js';
import { mulberry32, clamp, lerp, smoothstep } from './noise.js';
import { MARK_CELL, VOLC_CELL } from './world.js';

const V3 = THREE.Vector3;

class Mesh {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  v(x, y, z, nx, ny, nz, c) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(c[0], c[1], c[2]); return this.p.length / 3 - 1; }
  // tube along points [[x, y, z, r], ...]; col(t, angle)
  tube(pts, seg, col, close = false) {
    const base = this.p.length / 3, P = pts.map((q) => new V3(q[0], q[1], q[2])), t = new V3(), nrm = new V3(), bin = new V3(), tmp = new V3();
    for (let i = 0; i < P.length; i++) {
      t.subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
      if (i === 0) { tmp.set(Math.abs(t.y) > 0.9 ? 1 : 0, Math.abs(t.y) > 0.9 ? 0 : 1, 0); nrm.crossVectors(t, tmp).normalize(); } else nrm.addScaledVector(t, -nrm.dot(t)).normalize();
      bin.crossVectors(t, nrm);
      for (let k = 0; k <= seg; k++) {
        const an = k / seg * Math.PI * 2, d = new V3().addScaledVector(nrm, Math.cos(an)).addScaledVector(bin, Math.sin(an));
        const r = typeof pts[i][3] === 'function' ? pts[i][3](an) : pts[i][3];
        const q = P[i].clone().addScaledVector(d, r);
        this.v(q.x, q.y, q.z, d.x, d.y, d.z, col(i / (P.length - 1), an));
      }
    }
    for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < seg; k++) { const a = base + i * (seg + 1) + k, b = a + seg + 1; this.i.push(a, b, a + 1, a + 1, b, b + 1); }
    if (close) for (const [i, s] of [[0, -1], [P.length - 1, 1]]) {
      const dir = new V3().subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize().multiplyScalar(s);
      const c = this.v(P[i].x, P[i].y, P[i].z, dir.x, dir.y, dir.z, col(i / (P.length - 1), 0)), r0 = base + i * (seg + 1);
      for (let k = 0; k < seg; k++) if (s > 0) this.i.push(c, r0 + k, r0 + k + 1); else this.i.push(c, r0 + k + 1, r0 + k);
    }
  }
  // lumpy ball (leaf cluster)
  blob(cx, cy, cz, R, col, r, detail = 2) {
    const g = new THREE.IcosahedronGeometry(1, detail), pos = g.attributes.position, base = this.p.length / 3, map = new Map(), idx = [];
    const ph = [r() * 6, r() * 6, r() * 6];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = Math.round(x * 1e4) + '_' + Math.round(y * 1e4) + '_' + Math.round(z * 1e4);
      let id = map.get(k);
      if (id === undefined) {
        const d = 1 + 0.18 * Math.sin(x * 3.1 + ph[0]) * Math.sin(y * 2.7 + ph[1]) + 0.12 * Math.sin(z * 4.3 + ph[2]);
        const sh = 0.55 + 0.45 * (y * 0.5 + 0.5);
        id = this.v(cx + x * R * d, cy + y * R * d * 0.78, cz + z * R * d, x, y, z, [col[0] * sh, col[1] * sh, col[2] * sh]);
        map.set(k, id);
      }
      idx.push(id);
    }
    for (let i = 0; i < idx.length; i += 3) this.i.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// trunk and limbs: bark furrows at this scale are canyons
function treeWood(v, r) {
  // kind 0: an oak-like broadleaf, kind 1: a birch with white bark
  const birch = v.kind === 1;
  const M = new Mesh(), bark = birch
    ? (t, an) => { const m = Math.sin(an * 5 + t * 40) * Math.sin(t * 90 + an * 2) > 0.55 || t < 0.05; return m ? [0.10, 0.09, 0.08] : [0.86, 0.85, 0.80]; }
    : (t, an) => { const k = 0.7 + 0.3 * Math.sin(an * 23 + t * 3) * Math.sin(an * 7); return [0.30 * k, 0.26 * k, 0.21 * k]; };
  const trunkH = v.H * (birch ? 0.5 : 0.42), lean = new V3((r() - 0.5) * 0.08, 1, (r() - 0.5) * 0.08).normalize();
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, R = v.rc * (1.25 - 0.45 * t) * (birch ? 0.75 : 1);
    pts.push([lean.x * trunkH * t, -200 + t * (trunkH + 200), lean.z * trunkH * t, (an) => R * (1 + 0.06 * Math.sin(an * 9 + t * 4) + 0.03 * Math.sin(an * 23))]);
  }
  M.tube(pts, 28, bark);
  const top = new V3(lean.x * trunkH, trunkH, lean.z * trunkH), ends = [];
  { // the crown rests on a few great limbs
    const n = 6 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.2832 + r() * 0.5, el = (birch ? 0.8 : 0.45) + 0.5 * r(), L = v.L * (birch ? 0.45 : 0.55 + 0.35 * r());
      const d = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const st = top.clone().addScaledVector(new V3(0, -1, 0), v.H * 0.06 * r());
      const lp = []; const p = st.clone();
      for (let i = 0; i <= 6; i++) { const t = i / 6; lp.push([p.x, p.y, p.z, v.rc * 0.42 * (1 - 0.8 * t)]); d.y += 0.04; d.normalize(); p.addScaledVector(d, L / 6); }
      M.tube(lp, 10, bark);
      ends.push(new V3(lp[6][0], lp[6][1], lp[6][2]), new V3(lp[3][0], lp[3][1], lp[3][2]));
    }
  }
  return { geo: M.geometry(), ends, top };
}
function treeCrown(v, r, ends, top) {
  const M = new Mesh();
  {
    // many smaller clumps of leaves around the ends of the limbs and over the top: a ragged, airy crown
    const cc = new V3(top.x, top.y + v.L * 0.45, top.z);
    const birch = v.kind === 1, base = birch ? [0.30, 0.46, 0.14] : [0.20, 0.36, 0.13];
    const put = (p, R) => { const k = 0.8 + 0.4 * r(), lo = clamp((p.y - top.y) / (v.L * 1.1), 0, 1); M.blob(p.x, p.y * (birch ? 1 : 1), p.z, R * (birch ? 0.8 : 1), [base[0] * k * (0.7 + 0.4 * lo), base[1] * k * (0.7 + 0.4 * lo), base[2] * k], r, 2); };
    for (const e of ends) for (let q = 0; q < 7; q++) put(e.clone().add(new V3((r() - 0.5) * v.L * 0.45, (r() - 0.2) * v.L * 0.35, (r() - 0.5) * v.L * 0.45)), v.L * (0.13 + 0.1 * r()));
    for (let q = 0; q < 70; q++) {
      const d = new V3(r() - 0.5, (r() - 0.25) * 0.9, r() - 0.5).normalize(), sh = 0.6 + 0.4 * Math.sqrt(r());
      put(cc.clone().add(new V3(d.x * v.L * (birch ? 0.6 : 0.95) * sh, d.y * v.L * (birch ? 1.1 : 0.75) * sh, d.z * v.L * (birch ? 0.6 : 0.95) * sh)), v.L * (0.14 + 0.12 * r()));
    }
  }
  if (false) { // a spruce: tiers of drooping boughs, dark and evergreen
    const n = 16;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), y = v.H * (0.2 + 0.78 * t), R = v.L * 0.6 * Math.pow(1 - t, 0.9) + 250;
      const prof = [];
      for (let i = 0; i <= 6; i++) { const a = i / 6; prof.push([R * a, y - R * (0.35 * a + 0.5 * a * a)]); }
      const seg = 72, base = M.p.length / 3;
      for (let i = 0; i <= 6; i++) for (let s = 0; s <= seg; s++) {
        const an = s / seg * 6.2832, jag = i === 6 ? 0.22 * Math.abs(Math.sin(an * 9 + k * 1.7)) : 0, rr = prof[i][0] * (1 + 0.12 * Math.sin(an * 7 + k) - jag), sh = (0.45 + 0.4 * (1 - i / 6)) * (0.8 + 0.4 * Math.abs(Math.sin(an * 13 + k)));
        M.v(Math.cos(an) * rr, prof[i][1] + (i === 6 ? 0.12 * R * Math.sin(an * 11) : 0), Math.sin(an) * rr, Math.cos(an) * 0.5, 0.85, Math.sin(an) * 0.5, [0.07 * sh, 0.15 * sh, 0.08 * sh]);
      }
      for (let i = 0; i < 6; i++) for (let s = 0; s < seg; s++) { const a = base + i * (seg + 1) + s, b = a + seg + 1; M.i.push(a, b, a + 1, a + 1, b, b + 1); }
    }
  }
  return M.geometry();
}
// the garden hose: a green tube snaking across the lawn
function hose(W, m) {
  const M = new Mesh(), r = mulberry32(Math.floor(m.seed * 1e6) + 2), R = 9.5;
  const pts = []; let x = m.x, z = m.z, hd = m.heading, curv = 0;
  for (let s = 0; s <= m.len; s += 40) {
    curv += (r() - 0.5) * 0.004; curv *= 0.97; hd += curv * 40 + Math.sin(s * 0.0011) * 0.004 * 40;
    pts.push([x - m.x, Math.max(W.rawHeight(x, z), -1) + R * 0.9, z - m.z, R]);
    x += Math.sin(hd) * 40; z += Math.cos(hd) * 40;
  }
  M.tube(pts, 14, (t, an) => (Math.abs(Math.sin(an * 0.5 + 0.4)) < 0.08 ? [0.85, 0.80, 0.30] : [0.10, 0.42, 0.14]), true);
  // a brass coupling at one end
  const e = pts[pts.length - 1], e2 = pts[pts.length - 2], d = new V3(e[0] - e2[0], 0, e[2] - e2[2]).normalize();
  M.tube([[e[0], e[1], e[2], R * 1.25], [e[0] + d.x * 30, e[1], e[2] + d.z * 30, R * 1.25], [e[0] + d.x * 32, e[1], e[2] + d.z * 32, R * 1.05]], 16, () => [0.85, 0.66, 0.30], true);
  return M.geometry();
}
// sunflowers: stems like towers, heads like stadiums
function sunflowers(W, m, petals) {
  const M = new Mesh(), P = new Mesh(), r = mulberry32(Math.floor(m.seed * 1e6) + 5);
  for (let k = 0; k < m.n; k++) {
    const a = r() * 6.28, d = k === 0 ? 0 : 200 + 300 * r(), bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const H = m.size * (0.75 + 0.35 * r()), g = W.rawHeight(m.x + bx, m.z + bz), face = 2.6 + (r() - 0.5) * 1.2;
    const sp = [], lean = new V3(Math.sin(face) * 0.08, 1, Math.cos(face) * 0.08);
    for (let i = 0; i <= 10; i++) { const t = i / 10; sp.push([bx + lean.x * H * t * t, g - 10 + H * t, bz + lean.z * H * t * t, 18 - 8 * t]); }
    M.tube(sp, 12, (t, an) => { const h = 0.85 + 0.15 * Math.sin(an * 9); return [0.30 * h, 0.48 * h, 0.16 * h]; });
    // leaves: drooping hearts on short stalks
    for (let q = 0; q < 9; q++) {
      const t = 0.15 + 0.7 * q / 9, s = sp[Math.round(t * 10)], la = q * 2.4 + r(), L = 260 * (1 - t * 0.5);
      const dir = new V3(Math.cos(la), 0.1, Math.sin(la)), side = new V3(-dir.z, 0, dir.x), base = M.p.length / 3, NU = 6, NV = 5;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const v = j / NV, u = i / NU * 2 - 1, w = Math.sin(Math.PI * Math.min(1, v * 1.1)) * (1 - v * 0.35) * 0.55;
        const p = new V3(s[0], s[1], s[2]).addScaledVector(dir, 30 + v * L).addScaledVector(side, u * w * L);
        p.y -= v * v * L * 0.5 + Math.abs(u) * 18;
        const sh = 0.75 + 0.25 * (1 - Math.abs(u));
        M.v(p.x, p.y, p.z, 0, 1, 0, [0.22 * sh, 0.42 * sh, 0.12 * sh]);
      }
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a0 = base + j * (NU + 1) + i, b0 = a0 + NU + 1; M.i.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    }
    // the head: a disc of spiralling seeds, facing the morning
    const top = new V3(sp[10][0], sp[10][1], sp[10][2]), fd = new V3(Math.sin(face), -0.35, Math.cos(face)).normalize();
    const ax = new V3().crossVectors(fd, new V3(0, 1, 0)).normalize(), ay = new V3().crossVectors(ax, fd).normalize(), HR = 150 + 70 * r(), c = top.clone().addScaledVector(fd, 40);
    const base = M.p.length / 3, NR = 14, NS = 40;
    const ctr = M.v(c.x, c.y, c.z, fd.x, fd.y, fd.z, [0.25, 0.16, 0.06]);
    for (let i = 1; i <= NR; i++) for (let s = 0; s <= NS; s++) {
      const rr = HR * i / NR, an = s / NS * 6.2832, p = c.clone().addScaledVector(ax, Math.cos(an) * rr).addScaledVector(ay, Math.sin(an) * rr).addScaledVector(fd, -Math.pow(i / NR, 2) * 25);
      const spiral = Math.sin(an * 21 + rr * 0.09) * Math.sin(an * 34 - rr * 0.06), k = 0.65 + 0.35 * spiral;
      M.v(p.x, p.y, p.z, fd.x, fd.y, fd.z, i < NR * 0.35 ? [0.32 * k, 0.24 * k, 0.06] : [0.22 * k, 0.12 * k, 0.04 * k]);
    }
    for (let s = 0; s < NS; s++) M.i.push(ctr, base + 1 + s + 1, base + 1 + s);
    for (let i = 1; i < NR; i++) for (let s = 0; s < NS; s++) { const a0 = base + 1 + (i - 1) * (NS + 1) + s, b0 = a0 + NS + 1; M.i.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
    M.tube([[c.x - fd.x * 10, c.y - fd.y * 10, c.z - fd.z * 10, HR * 0.9], [c.x - fd.x * 70, c.y - fd.y * 70, c.z - fd.z * 70, HR * 0.4], [top.x, top.y, top.z, 20]], 24, () => [0.26, 0.42, 0.14]);
    // the petals, on their own mesh so they can wither away
    for (let q = 0; q < 34; q++) {
      const an = q / 34 * 6.2832 + (q % 2) * 0.09, L = HR * (0.75 + 0.15 * r()), W2 = HR * 0.12, root = c.clone().addScaledVector(ax, Math.cos(an) * HR * 0.92).addScaledVector(ay, Math.sin(an) * HR * 0.92);
      const out = new V3().addScaledVector(ax, Math.cos(an)).addScaledVector(ay, Math.sin(an)).addScaledVector(fd, 0.25 * (q % 2 ? 1 : 0.4)).normalize(), side = new V3().crossVectors(out, fd).normalize();
      const pb = P.p.length / 3, col = q % 2 ? [1.0, 0.78, 0.08] : [0.98, 0.70, 0.05];
      for (let j = 0; j <= 3; j++) for (let s = -1; s <= 1; s += 2) {
        const t = j / 3, w = W2 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) * (t < 0.9 ? 1 : 0.4);
        const p = root.clone().addScaledVector(out, t * L).addScaledVector(side, s * w).addScaledVector(fd, -t * t * L * 0.15);
        P.v(p.x, p.y, p.z, fd.x, fd.y, fd.z, col);
      }
      for (let j = 0; j < 3; j++) { const a0 = pb + j * 2, b0 = a0 + 2; P.i.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    }
  }
  return { geo: M.geometry(), petals: P.geometry() };
}

export class Giants {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.world = ctx.world;
    this.wood = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 'giantwood', (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          float f1 = texture2D(uNoiseTex, vec2(atan(vWPos.z, vWPos.x) * 0.0 + vWPos.x * 0.004 + vWPos.z * 0.004, vWPos.y * 0.0006)).r;
          float furrow = texture2D(uNoiseTex, vec2((vWPos.x + vWPos.z) * 0.012, vWPos.y * 0.0019)).g;
          diffuseColor.rgb *= 0.55 + 0.6 * smoothstep(0.25, 0.75, furrow) * (0.8 + 0.4 * f1);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.32, 0.10), smoothstep(0.6, 0.85, texture2D(uNoiseTex, vWPos.xz * 0.0011 + vWPos.y * 0.0004).b) * smoothstep(1500.0, 0.0, vWPos.y) * 0.6);
        }`);
    });
    this.leaves = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'giantleaves', (s) => {
      s.uniforms.uEver = this.uEver = { value: 0 };
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uEver;').replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          float lv = texture2D(uNoiseTex, vWPos.xz * 0.0019 + vWPos.y * 0.0013).r * 0.6 + texture2D(uNoiseTex, vWPos.xy * 0.006).g * 0.4;
          vec3 c = diffuseColor.rgb * (0.7 + 0.6 * lv);
          if (uEver < 0.5) {
            vec3 autumn = mix(vec3(0.75, 0.42, 0.08), vec3(0.72, 0.22, 0.06), smoothstep(0.4, 0.7, lv)) * (0.6 + 0.5 * lv);
            c = mix(c, c * vec3(1.15, 1.12, 0.8), uSeason.x * 0.5);
            c = mix(c, autumn, uSeason.z);
            if (uSeason.w > 0.5 && lv > 0.2 + (1.0 - uSeason.w) * 0.6) discard; // bare in winter
          }
          c = mix(c, vec3(0.86, 0.9, 0.95), uSnow * 0.6 * smoothstep(0.4, 0.7, lv));
          diffuseColor.rgb = c;
        }`);
    });
    this.everMat = this.leaves.clone(); patch(this.everMat, 'giantever', (s) => { s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.7 + 0.6 * texture2D(uNoiseTex, vWPos.xz * 0.0019 + vWPos.y * 0.0013).r;\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), uSnow * 0.5 * texture2D(uNoiseTex, vWPos.xz * 0.003).g);'); });
    this.plant = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }), 'giantplant', (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoiseTex, vWPos.xz * 0.013 + vWPos.y * 0.011).r;\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), uSnow * 0.4);');
    });
    this.hoseMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }), 'hose', (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { vec3 Vr = normalize(vViewPosition); vec3 rw = inverseTransformDirection(reflect(-Vr, normal), viewMatrix); rw.y = abs(rw.y); totalEmissiveRadiance += skyLUT(rw) * (0.03 + 0.5 * pow(1.0 - max(dot(normal, Vr), 0.0), 4.0)) * 0.6; }');
    });
    this.trees = new Map(); this.marks = new Map(); this.tick = 0;
    this._shade = [];
  }
  buildTree(v) {
    const r = mulberry32(v.id % 1000003 + 11), g = new THREE.Group();
    g.position.set(v.x, 0, v.z);
    const w = treeWood(v, r), wood = new THREE.Mesh(w.geo, this.wood);
    const crown = new THREE.Mesh(treeCrown(v, r, w.ends, w.top), this.leaves);
    for (const m of [wood, crown]) { m.frustumCulled = false; g.add(m); }
    wood.castShadow = true; wood.receiveShadow = true;
    g.updateMatrixWorld(true); g.traverse((o) => { o.matrixAutoUpdate = false; });
    this.scene.add(g);
    return { it: v, group: g, crownH: w.top.y + v.L * 0.4 };
  }
  buildMark(m) {
    const g = new THREE.Group(); g.position.set(m.x, 0, m.z);
    let petals = null;
    if (m.type === 0) { const mesh = new THREE.Mesh(hose(this.world, m), this.hoseMat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
    else { const s = sunflowers(this.world, m); const a = new THREE.Mesh(s.geo, this.plant); a.castShadow = true; a.receiveShadow = true; g.add(a); petals = new THREE.Mesh(s.petals, this.plant); g.add(petals); a.frustumCulled = false; }
    g.updateMatrixWorld(true); g.traverse((o) => { o.matrixAutoUpdate = false; });
    this.scene.add(g);
    return { it: m, group: g, petals };
  }
  sync(map, cell, range, getter, builder) {
    const cam = this.ctx.camera.position, ci = Math.floor(cam.x / cell), cj = Math.floor(cam.z / cell), n = Math.ceil(range / cell), seen = new Set();
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const it = getter(i, j);
      if (!it || Math.hypot(it.x - cam.x, it.z - cam.z) > range) continue;
      seen.add(it.id);
      if (!map.has(it.id)) map.set(it.id, builder(it));
    }
    for (const [id, rec] of map) if (!seen.has(id) && Math.hypot(rec.it.x - cam.x, rec.it.z - cam.z) > range * 1.1) { this.drop(rec); map.delete(id); }
  }
  drop(rec) { this.scene.remove(rec.group); rec.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  update() {
    const W = this.world, cam = this.ctx.camera.position, s = U.uSeason.value;
    if ((this.tick++ % 30) === 0) {
      this.sync(this.trees, VOLC_CELL, 42000, (i, j) => W.volcanoAt(i, j), (v) => this.buildTree(v));
      this.sync(this.marks, MARK_CELL, 7000, (i, j) => W.markAt(i, j), (m) => this.buildMark(m));
    }
    for (const rec of this.marks.values()) if (rec.petals) rec.petals.visible = s.y + s.z * 0.6 > 0.45;
    // the four nearest crowns throw their shade over the lawn
    const list = [...this.trees.values()].sort((a, b) => Math.hypot(a.it.x - cam.x, a.it.z - cam.z) - Math.hypot(b.it.x - cam.x, b.it.z - cam.z));
    const leafy = s.w < 0.5 ? 1 : 0.35;
    for (let k = 0; k < 4; k++) {
      const u = U.uShade.value[k], rec = list[k];
      if (rec) u.set(rec.it.x, rec.it.z, rec.it.L * (rec.it.kind === 0 ? 1.05 : 0.7) * leafy, rec.crownH * 0.85); else u.set(0, 0, 0, 0);
    }
  }
  clear() { for (const m of [this.trees, this.marks]) { for (const r of m.values()) this.drop(r); m.clear(); } this.tick = 0; }
  rebase(sx, sz) {
    for (const m of [this.trees, this.marks]) for (const r of m.values()) {
      r.it.x -= sx; r.it.z -= sz;
      r.group.position.x -= sx; r.group.position.z -= sz; r.group.updateMatrix(); r.group.updateMatrixWorld(true);
    }
    this.tick = 0;
  }
}
