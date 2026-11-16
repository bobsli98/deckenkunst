// Vegetation: procedural foliage textures, tree geometry (3 LODs each), instanced placement, grass.
import * as THREE from 'three';
import { U, patch } from './shaders.js';
import { mulberry32, clamp, lerp } from './noise.js';
import { SP, VEG_CELL, GRASS_CELL } from './world.js';

const V3 = THREE.Vector3;
const TW = 512, TH = 640, LEAF_V0 = 128 / 640; // bark strip occupies v in [0, LEAF_V0)

// ------------------------------------------------------------------ textures
function foliageTexture(base, drawLeaves, drawBark) {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  for (let t = 0; t < 4; t++) {
    g.save(); g.translate((t % 2) * 256, (t >> 1) * 256);
    g.beginPath(); g.rect(3, 3, 250, 250); g.clip();
    drawLeaves(g, mulberry32(1000 + t * 77), t);
    g.restore();
  }
  g.save(); g.translate(0, 512); drawBark(g, mulberry32(4242)); g.restore();
  const img = g.getImageData(0, 0, TW, TH).data;
  const out = new Uint8Array(TW * TH * 4);
  for (let y = 0; y < TH; y++) {
    const sy = TH - 1 - y;
    for (let x = 0; x < TW; x++) {
      const s = (sy * TW + x) * 4, d = (y * TW + x) * 4;
      let a = img[s + 3];
      if (sy >= 512) a = 255;
      if (a < 8) { out[d] = base[0]; out[d + 1] = base[1]; out[d + 2] = base[2]; out[d + 3] = 0; }
      else { out[d] = img[s]; out[d + 1] = img[s + 1]; out[d + 2] = img[s + 2]; out[d + 3] = a; }
    }
  }
  const tex = new THREE.DataTexture(out, TW, TH, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}
const pick = (r, arr) => arr[(r() * arr.length) | 0];
function scatter(r, n, rad, fn) { // points denser toward the tile centre, irregular outline
  const lobes = [r() * 6.28, r() * 6.28, r() * 6.28];
  for (let i = 0; i < n; i++) {
    const a = r() * 6.2832, q = Math.pow(r(), 0.62);
    const lob = 0.78 + 0.22 * Math.sin(a * 3 + lobes[0]) * Math.sin(a * 2 + lobes[1]);
    const d = q * rad * lob;
    fn(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, q);
  }
}
function barkStrip(g, r, colors, kind) {
  g.fillStyle = colors[0]; g.fillRect(0, 0, 512, 128);
  if (kind === 'fiber') {
    for (let i = 0; i < 520; i++) { g.strokeStyle = pick(r, colors); g.globalAlpha = 0.5 + r() * 0.5; g.lineWidth = 1 + r() * 2.5; const y = r() * 128, x = r() * 512, l = 30 + r() * 160; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 5); g.stroke(); }
  } else if (kind === 'plates') {
    for (let i = 0; i < 260; i++) { g.fillStyle = pick(r, colors); g.globalAlpha = 0.85; const x = r() * 512, y = r() * 128, w = 18 + r() * 40, h = 8 + r() * 16; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(20,14,10,0.8)'; g.lineWidth = 1.6; g.stroke(); }
  } else if (kind === 'lenticel') {
    for (let i = 0; i < 300; i++) { g.fillStyle = pick(r, colors); g.globalAlpha = 0.35; g.fillRect(r() * 512, r() * 128, 20 + r() * 60, 3 + r() * 8); }
    g.globalAlpha = 0.75;
    for (let i = 0; i < 150; i++) { g.fillStyle = r() < 0.5 ? '#7d6a5c' : '#2a211c'; g.fillRect(r() * 512, r() * 128, 1.5 + r() * 2, 6 + r() * 16); }
  } else if (kind === 'bamboo') {
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#56782f'); grd.addColorStop(0.5, '#85a44a'); grd.addColorStop(1, '#56782f');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 200; i++) { g.fillStyle = pick(r, colors); g.globalAlpha = 0.12; g.fillRect(r() * 512, r() * 128, 40 + r() * 100, 2 + r() * 5); }
    g.globalAlpha = 1;
    for (let x = 0; x < 512; x += 64) { g.fillStyle = 'rgba(190,200,150,0.75)'; g.fillRect(x + 1, 0, 2, 128); g.fillStyle = 'rgba(52,80,32,0.85)'; g.fillRect(x + 3, 0, 2, 128); g.fillStyle = 'rgba(215,222,185,0.2)'; g.fillRect(x + 5, 0, 9, 128); }
  }
  g.globalAlpha = 1;
}
function blossom(g, x, y, rad, colors, r, centre) {
  const rot = r() * 6.28;
  g.fillStyle = pick(r, colors);
  for (let k = 0; k < 5; k++) {
    const a = rot + k * 1.2566;
    g.beginPath(); g.ellipse(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.58, rad * 0.42, a, 0, 6.3); g.fill();
  }
  g.fillStyle = centre; g.beginPath(); g.arc(x, y, rad * 0.24, 0, 6.3); g.fill();
}
function twigs(g, r, n, col, w) {
  g.strokeStyle = col; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, l = 50 + r() * 60;
    g.lineWidth = w * (0.6 + r());
    g.beginPath(); g.moveTo(128, 128);
    g.quadraticCurveTo(128 + Math.cos(a + 0.4) * l * 0.5, 128 + Math.sin(a + 0.4) * l * 0.5, 128 + Math.cos(a) * l, 128 + Math.sin(a) * l); g.stroke();
  }
}
function makeTextures() {
  const T = {};
  T[SP.SAKURA] = foliageTexture([246, 205, 222], (g, r) => {
    twigs(g, r, 7, '#3a2a26', 2.4);
    scatter(r, 1000, 120, (x, y) => blossom(g, x, y, 2.5 + r() * 1.3, ['#e3a0ba', '#eaaec5', '#efb9cd'], r, '#cf7b9c'));
    scatter(r, 1250, 116, (x, y) => blossom(g, x, y, 2.5 + r() * 1.5, ['#f6c8d8', '#fad7e3', '#fde6ee', '#fff3f7'], r, '#e39bb5'));
  }, (g, r) => barkStrip(g, r, ['#4a3b35', '#5a4840', '#3a2d28', '#6a564c'], 'lenticel'));

  T[SP.MOMIJI] = foliageTexture([225, 225, 215], (g, r) => {
    twigs(g, r, 6, '#4a3a30', 1.8);
    const leaf = (x, y, s, col) => {
      const rot = r() * 6.28; g.fillStyle = col; g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = rot + (k - 3) * 0.52, l = s * (1 - Math.abs(k - 3) * 0.14);
        g.moveTo(x, y); g.lineTo(x + Math.cos(a - 0.2) * l * 0.5, y + Math.sin(a - 0.2) * l * 0.5); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.lineTo(x + Math.cos(a + 0.2) * l * 0.5, y + Math.sin(a + 0.2) * l * 0.5);
      }
      g.closePath(); g.fill();
    };
    scatter(r, 620, 120, (x, y) => leaf(x, y, 6.5 + r() * 3, pick(r, ['#9d9d92', '#aaaa9e', '#b6b6aa'])));
    scatter(r, 700, 116, (x, y) => leaf(x, y, 6.5 + r() * 3.5, pick(r, ['#d2d2c6', '#e4e4d8', '#f2f2e8', '#c4c4b8'])));
  }, (g, r) => barkStrip(g, r, ['#5b5148', '#6a6056', '#4a423b'], 'lenticel'));

  const needles = (g, r, cols, tuft) => {
    // a drooping spray: main twig from bottom centre to top, side twigs, needle strokes
    g.lineCap = 'round';
    const branch = (x0, y0, x1, y1, w, depth) => {
      g.strokeStyle = '#3a2c20'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const n = depth === 0 ? 11 : 6;
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 0.5), x = lerp(x0, x1, t), y = lerp(y0, y1, t);
        const ang = Math.atan2(y1 - y0, x1 - x0);
        if (depth < 1) for (const s of [-1, 1]) {
          const a = ang + s * (0.75 + r() * 0.3), l = (1 - t * 0.6) * 78 * (0.7 + r() * 0.5);
          branch(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1.6, depth + 1);
        }
        const cnt = tuft ? 16 : 9;
        for (let k = 0; k < cnt; k++) {
          g.strokeStyle = pick(r, cols); g.lineWidth = tuft ? 1.5 : 2.4;
          const a = tuft ? r() * 6.28 : ang + (r() - 0.5) * 2.4, l = tuft ? 9 + r() * 9 : 6 + r() * 8;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
      }
    };
    branch(128, 250, 128 + (r() - 0.5) * 30, 14, 3, 0);
  };
  // tile 3 of the cedar texture is a whole-crown silhouette: tiers of drooping boughs, lit from above
  const coniferSilhouette = (g, r) => {
    g.lineCap = 'round';
    // dark core so the crown is not see-through at the trunk
    g.fillStyle = '#17290f'; g.beginPath(); g.moveTo(128, 30); g.lineTo(128 + 44, 222); g.lineTo(128 - 44, 222); g.closePath(); g.fill();
    g.strokeStyle = '#3a2c20'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 254); g.lineTo(128, 36); g.stroke();
    const dark = ['#162a13', '#1c3519', '#22401d'], mid = ['#294a23', '#2f5628', '#386430'], lite = ['#3f6d35', '#4b7d3b', '#588a44'];
    const L = 12;
    for (let l = 0; l < L; l++) { // separate tiers of drooping boughs, sky showing between their tips
      const t = l / (L - 1), yb = 218 - t * 188, hw = 116 * Math.pow(1 - t, 0.8) + 7;
      for (const sg of [-1, 1]) {
        const n = Math.max(3, Math.round(hw / 4.5));
        const wob = r() * 6.28;
        for (let i = 0; i <= n; i++) {
          const f = i / n, x = 128 + sg * hw * f, y = yb + 17 * f * f + 2 * f + Math.sin(f * 7 + wob) * 2.5;
          for (let k = 0; k < 8; k++) {
            const b = (0.1 + 0.8 * f) * (0.3 + r() * 0.9), len = (6 + r() * 9) * (1 - 0.35 * f);
            g.strokeStyle = pick(r, k < 4 ? dark : mid); g.lineWidth = 1.2 + r() * 1.3;
            const sx = x + (r() - 0.5) * 6, sy = y + (r() - 0.5) * 3;
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sg * Math.sin(b) * len, sy + Math.cos(b) * len); g.stroke();
          }
          for (let k = 0; k < 3; k++) {
            const len = 3 + r() * 5, a = (r() - 0.5) * 1.6;
            g.strokeStyle = pick(r, r() < 0.3 ? lite : mid); g.lineWidth = 1.1 + r();
            const sx = x + (r() - 0.5) * 6, sy = y - 1 + (r() - 0.5) * 2;
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.sin(a) * len + sg * 2, sy - Math.cos(a) * len * 0.6); g.stroke();
          }
        }
      }
    }
    for (let k = 0; k < 40; k++) { g.strokeStyle = pick(r, k % 3 ? mid : lite); g.lineWidth = 1.2; const y = 14 + r() * 26, a = (r() - 0.5) * 1.2; g.beginPath(); g.moveTo(128, y); g.lineTo(128 + Math.sin(a) * 9, y + 4 + r() * 8); g.stroke(); }
  };
  T[SP.SUGI] = foliageTexture([40, 68, 34], (g, r, t) => (t === 3 ? coniferSilhouette(g, r) : needles(g, r, ['#24421f', '#2f5628', '#3c6a31', '#4b7d3b', '#294a23'], false)),
    (g, r) => barkStrip(g, r, ['#4a2f22', '#5c3a29', '#3a241a', '#6b4632'], 'fiber'));
  T[SP.MATSU] = foliageTexture([48, 78, 40], (g, r) => needles(g, r, ['#223e1c', '#2f5226', '#3d6630', '#4b7a3a', '#294823'], true),
    (g, r) => barkStrip(g, r, ['#4b4038', '#5d5046', '#3a312b', '#6e6156'], 'plates'));

  T[SP.BAMBOO] = foliageTexture([120, 160, 60], (g, r) => {
    const leaf = (x, y, a, l, col) => {
      const w = l * 0.13, cx = Math.cos(a), sx = Math.sin(a);
      g.fillStyle = col; g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + cx * l * 0.5 - sx * w, y + sx * l * 0.5 + cx * w, x + cx * l, y + sx * l);
      g.quadraticCurveTo(x + cx * l * 0.5 + sx * w, y + sx * l * 0.5 - cx * w, x, y); g.fill();
    };
    for (let s = 0; s < 9; s++) {
      const a0 = -Math.PI / 2 + (r() - 0.5) * 1.6, x0 = 128 + (r() - 0.5) * 70, y0 = 246;
      const len = 120 + r() * 100;
      g.strokeStyle = '#6d8a3a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a0) * len, y0 + Math.sin(a0) * len); g.stroke();
      for (let i = 2; i < 12; i++) {
        const t = i / 12, x = x0 + Math.cos(a0) * len * t, y = y0 + Math.sin(a0) * len * t;
        for (let k = 0; k < 3; k++) leaf(x, y, a0 + (r() - 0.5) * 2.6 + 0.5, 30 + r() * 26, pick(r, ['#5f8a2a', '#77a336', '#8fb845', '#a5c95a', '#557d26', '#b4d46a']));
      }
    }
  }, (g, r) => barkStrip(g, r, ['#3f6a22', '#8fb04a', '#5f8a30'], 'bamboo'));

  T[SP.AZALEA] = foliageTexture([60, 90, 45], (g, r) => {
    scatter(r, 520, 122, (x, y) => { g.fillStyle = pick(r, ['#2c4a22', '#38592a', '#456a33', '#274220', '#52793b']); const a = r() * 6.28; g.beginPath(); g.ellipse(x, y, 7 + r() * 3, 3.5 + r() * 1.5, a, 0, 6.3); g.fill(); });
    scatter(r, 85, 112, (x, y) => blossom(g, x, y, 6.5 + r() * 3.5, r() < 0.8 ? ['#d6347f', '#e24e93', '#ee6fa9', '#c92a72'] : ['#ffffff', '#fbe6ef'], r, '#8a1a4c'));
  }, (g, r) => barkStrip(g, r, ['#4a3d33', '#5b4c40'], 'lenticel'));
  T[SP.ROCK] = foliageTexture([150, 150, 150], () => {}, (g, r) => barkStrip(g, r, ['#9a968f', '#8a867f', '#a8a49c', '#7c7872', '#b2aea6'], 'plates'));
  return T;
}

// ------------------------------------------------------------------ geometry builder
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.idx = []; this.cardSeed = 12345; }
  vert(x, y, z, nx, ny, nz, u, v, r, g, b, w) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(r, g, b); this.w.push(w);
    return this.p.length / 3 - 1;
  }
  // path: [{p: V3, r}], bark uv
  tube(path, radial, col, uScale = 0.25, dark = 1) {
    const t = new V3(), nrm = new V3(), bin = new V3(), tmp = new V3();
    let len = 0, first = -1;
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)].p, b = path[Math.min(path.length - 1, i + 1)].p;
      t.subVectors(b, a).normalize();
      if (i === 0) { tmp.set(Math.abs(t.y) > 0.9 ? 1 : 0, Math.abs(t.y) > 0.9 ? 0 : 1, 0); nrm.crossVectors(t, tmp).normalize(); }
      else { nrm.addScaledVector(t, -nrm.dot(t)).normalize(); len += path[i].p.distanceTo(path[i - 1].p); }
      bin.crossVectors(t, nrm);
      const base = this.p.length / 3;
      if (i === 0) first = base;
      const sh = dark * (0.75 + 0.25 * Math.min(1, path[i].p.y / 3));
      for (let k = 0; k <= radial; k++) {
        const an = k / radial * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an);
        const dx = nrm.x * cs + bin.x * sn, dy = nrm.y * cs + bin.y * sn, dz = nrm.z * cs + bin.z * sn;
        const p = path[i].p, r = path[i].r;
        this.vert(p.x + dx * r, p.y + dy * r, p.z + dz * r, dx, dy, dz, len * uScale, 0.015 + (LEAF_V0 - 0.03) * (k / radial), col[0] * sh, col[1] * sh, col[2] * sh, 0);
      }
      if (i > 0) {
        const a0 = base - (radial + 1);
        for (let k = 0; k < radial; k++) this.idx.push(a0 + k, a0 + k + 1, base + k, a0 + k + 1, base + k + 1, base + k);
      }
    }
  }
  // textured quad. c: centre, ax/ay: half extents, tile 0..3, n: shading normal function(pos)->V3
  card(c, ax, ay, tile, nfn, col, wind, anchor = 0) {
    const u0 = (tile % 2) * 0.5 + 0.012, u1 = u0 + 0.476;
    const vt = 1 - (tile >> 1) * (1 - LEAF_V0) * 0.5, v1 = vt - 0.01, v0 = vt - (1 - LEAF_V0) * 0.5 + 0.01;
    const corners = [[-1, -1 + anchor, u0, v0], [1, -1 + anchor, u1, v0], [1, 1 + anchor, u1, v1], [-1, 1 + anchor, u0, v1]];
    const ids = [];
    const p = new V3();
    const wr = wind > 0 ? 0.5 + 0.5 * ((this.cardSeed = (this.cardSeed * 16807 + 11) % 2147483647) / 2147483647) : 0;
    for (const q of corners) {
      p.copy(c).addScaledVector(ax, q[0]).addScaledVector(ay, q[1]);
      const n = nfn(p);
      const cc = typeof col === 'function' ? col(p) : col;
      ids.push(this.vert(p.x, p.y, p.z, n.x, n.y, n.z, q[2], q[3], cc[0], cc[1], cc[2], wr));
    }
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 1));
    g.setIndex(this.idx.length > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
function branchPath(r, start, dir, len, r0, r1, segs, bend, up) {
  const pts = [{ p: start.clone(), r: r0 }];
  const d = dir.clone().normalize(), p = start.clone();
  for (let i = 1; i <= segs; i++) {
    d.x += (r() - 0.5) * bend; d.z += (r() - 0.5) * bend; d.y += (r() - 0.5) * bend * 0.5 + up / segs;
    d.normalize(); p.addScaledVector(d, len / segs);
    pts.push({ p: p.clone(), r: lerp(r0, r1, Math.pow(i / segs, 0.8)) });
  }
  pts.dir = d.clone();
  return pts;
}
function pathAt(path, t, outDir) {
  const f = clamp(t, 0, 0.9999) * (path.length - 1), i = Math.floor(f), a = path[i].p, b = path[i + 1].p;
  if (outDir) outDir.subVectors(b, a).normalize();
  return new V3().lerpVectors(a, b, f - i);
}
function randDir(r, yMin = -1, yMax = 1) {
  const y = lerp(yMin, yMax, r()), a = r() * 6.2832, s = Math.sqrt(Math.max(0, 1 - y * y));
  return new V3(Math.cos(a) * s, y, Math.sin(a) * s);
}
const crownNormal = (centre, upBias, flat = 0.75) => (p) => {
  const n = new V3().subVectors(p, centre); n.y *= flat; n.normalize(); n.y += upBias; return n.normalize();
};

// broadleaf (sakura / momiji)
function buildBroadleaf(lod, seed, o) {
  const r = mulberry32(seed), G = new Geo();
  const S = o.size, bark = o.bark;
  const crownC = new V3(0, S * 0.66, 0), crownR = S * 0.62;
  const nfn = crownNormal(crownC, o.upBias);
  const shade = (p) => {
    const d = clamp(p.distanceTo(crownC) / crownR, 0, 1.2), hy = clamp((p.y - S * 0.3) / (S * 0.8), 0, 1);
    const s = (0.66 + 0.34 * d * d) * (0.8 + 0.2 * hy);
    return [s, s, s];
  };
  const radial = [7, 5, 3][lod];
  const trunk = branchPath(r, new V3(0, -0.4, 0), new V3((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25), S * 0.34 + 0.4, S * 0.045, S * 0.034, lod === 2 ? 2 : 4, 0.16, 0);
  G.tube(trunk, radial, bark, 0.3);
  const top = trunk[trunk.length - 1].p;
  const nPrim = lod === 2 ? 3 : o.prim;
  const cluster = (c, s, n) => {
    for (let k = 0; k < n; k++) {
      const nn = randDir(r, -0.2, 1).lerp(new V3().subVectors(c, crownC).normalize(), o.outward).normalize();
      if (o.flatten) { nn.y += o.flatten; nn.normalize(); }
      const ax = new V3().crossVectors(nn, randDir(r)).normalize(), ay = new V3().crossVectors(ax, nn).normalize();
      const sz = s * (0.8 + 0.4 * r());
      const cc = c.clone().addScaledVector(randDir(r), s * 0.25);
      G.card(cc, ax.multiplyScalar(sz), ay.multiplyScalar(sz * (o.flatten ? 0.85 : 1)), (r() * 4) | 0, nfn, shade, 1);
    }
  };
  for (let i = 0; i < nPrim; i++) {
    const az = (i + r() * 0.7) / nPrim * 6.2832, el = lerp(o.elev[0], o.elev[1], r());
    const dir = new V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const st = pathAt(trunk, 0.62 + 0.38 * r());
    const prim = branchPath(r, st, dir, S * (0.42 + 0.14 * r()), S * 0.026, S * 0.009, lod === 0 ? 5 : lod === 1 ? 3 : 2, 0.3, o.droop);
    G.tube(prim, [6, 4, 3][lod], bark, 0.3);
    if (lod === 2) {
      cluster(pathAt(prim, 0.75), S * 0.34, 2);
      cluster(prim[prim.length - 1].p, S * 0.3, 1);
      continue;
    }
    const nSec = lod === 0 ? o.sec : 3;
    for (let j = 0; j < nSec; j++) {
      const t = 0.3 + 0.62 * (j + r() * 0.8) / nSec, d0 = new V3();
      const sp = pathAt(prim, t, d0);
      const sd = d0.clone().add(randDir(r, -0.3, 0.8).multiplyScalar(0.9)).normalize();
      const sec = branchPath(r, sp, sd, S * (0.2 + 0.1 * r()), S * 0.0085, S * 0.003, lod === 0 ? 3 : 2, 0.35, o.droop * 0.6);
      G.tube(sec, lod === 0 ? 4 : 3, bark, 0.3);
      if (lod === 0) {
        cluster(pathAt(sec, 0.5), S * 0.105, 2);
        cluster(sec[sec.length - 1].p, S * 0.11, 3);
        for (let k = 0; k < 3; k++) {
          const d1 = new V3(), tp = pathAt(sec, 0.25 + 0.6 * r(), d1);
          const td = d1.add(randDir(r, -0.4, 0.7)).normalize();
          const ter = branchPath(r, tp, td, S * (0.1 + 0.07 * r()), S * 0.0035, S * 0.0015, 2, 0.4, o.droop * 0.4);
          G.tube(ter, 3, bark, 0.3);
          cluster(ter[ter.length - 1].p, S * 0.1, 2);
          cluster(pathAt(ter, 0.5), S * 0.09, 1);
        }
      } else {
        cluster(pathAt(sec, 0.5), S * 0.15, 2);
        cluster(sec[sec.length - 1].p, S * 0.16, 2);
      }
    }
    cluster(prim[prim.length - 1].p, S * (lod === 0 ? 0.11 : 0.16), lod === 0 ? 3 : 2);
    if (lod === 0) cluster(pathAt(prim, 0.6), S * 0.1, 2);
  }
  cluster(new V3(top.x, S * 0.9, top.z), S * (lod === 2 ? 0.36 : lod === 1 ? 0.18 : 0.12), lod === 0 ? 5 : 3);
  return G.build();
}

function buildSugi(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const Ht = 21, bark = [1.0, 0.88, 0.8];
  const trunk = [];
  const ts = lod === 2 ? 2 : 6;
  for (let i = 0; i <= ts; i++) { const t = i / ts; trunk.push({ p: new V3(Math.sin(t * 2) * 0.15, -0.5 + t * (Ht + 0.3), Math.cos(t * 1.7) * 0.12), r: lerp(0.36, 0.04, Math.pow(t, 0.85)) }); }
  G.tube(trunk, [8, 5, 3][lod], bark, 0.22);
  const y0 = Ht * 0.24, levels = [10, 6, 3][lod], per = [5, 4, 3][lod];
  const up = new V3(0, 1, 0);
  for (let l = 0; l < levels; l++) {
    const t = (l + 0.3) / levels, y = lerp(y0, Ht * 0.98, t);
    const R = (1 - Math.pow(t, 1.15)) * 3.5 + 0.55;
    const rot = l * 2.39996 + r();
    const sh = 0.5 + 0.5 * t;
    for (let k = 0; k < per; k++) {
      const a = rot + k / per * 6.2832 + (r() - 0.5) * 0.4;
      const out = new V3(Math.cos(a), -0.42 - 0.2 * r() + t * 0.25, Math.sin(a)).normalize();
      const side = new V3().crossVectors(out, up).normalize();
      const len = R * (0.85 + 0.3 * r()) * (lod === 2 ? 1.25 : 1);
      const c = new V3(0, y, 0).addScaledVector(out, len * 0.5);
      const nf = () => new V3(out.x * 0.55, 0.85, out.z * 0.55).normalize();
      const col = (p) => { const d = clamp(Math.hypot(p.x, p.z) / (R + 0.5), 0, 1); const s = sh * (0.45 + 0.55 * d); return [s, s, s]; };
      // drooping flat spray
      G.card(c, side.clone().multiplyScalar(len * (lod === 2 ? 0.62 : 0.5)), out.clone().multiplyScalar(len * 0.5), (r() * 3) | 0, nf, col, 1);
      // vertical blade so the tree reads from the side too
      if (lod < 2 || k % 2 === 0) {
        const hang = new V3().crossVectors(side, out).normalize();
        G.card(c, hang.multiplyScalar(len * 0.34), out.clone().multiplyScalar(len * 0.5), (r() * 3) | 0, () => new V3(side.x * 0.5 + out.x * 0.4, 0.7, side.z * 0.5 + out.z * 0.4).normalize(), col, 1);
      }
    }
  }
  // full-height silhouette blades give the tree its conical shape from every side
  const nb = lod === 0 ? 4 : 3, hh = (Ht - y0) / 2 + 1.4;
  for (let k = 0; k < nb; k++) {
    const a = k / nb * Math.PI + 0.3;
    G.card(new V3(0, y0 - 1.6 + hh, 0), new V3(Math.cos(a) * 4.3, 0, Math.sin(a) * 4.3), new V3(0, hh, 0), 3,
      (p) => new V3(p.x, 2.2, p.z).normalize(), (p) => { const q = (0.55 + 0.35 * clamp((p.y - y0) / (Ht - y0), 0, 1)) * (0.8 + 0.2 * clamp(Math.hypot(p.x, p.z) / 3.5, 0, 1)); return [q, q, q]; }, 1);
  }
  return G.build();
}

function buildMatsu(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const bark = [1.0, 0.95, 0.9];
  const trunk = branchPath(r, new V3(0, -0.5, 0), new V3(0.35, 1, 0.1), 9.5, 0.34, 0.11, lod === 2 ? 3 : 6, 0.42, 0.25);
  G.tube(trunk, [7, 5, 3][lod], bark, 0.28);
  const pad = (c, R) => {
    const n = [7, 4, 2][lod];
    const col = (p) => { const s = 0.62 + 0.38 * clamp((p.y - c.y + 0.4) / 0.9, 0, 1); return [s, s, s]; };
    for (let k = 0; k < n; k++) {
      const a = r() * 6.2832, d = Math.sqrt(r()) * R * 0.6;
      const cc = new V3(c.x + Math.cos(a) * d, c.y + (r() - 0.3) * 0.5, c.z + Math.sin(a) * d);
      const nn = new V3((r() - 0.5) * 0.7, 1, (r() - 0.5) * 0.7).normalize();
      const ax = new V3().crossVectors(nn, randDir(r)).normalize(), ay = new V3().crossVectors(ax, nn);
      const s = R * (lod === 2 ? 0.95 : 0.62) * (0.8 + 0.4 * r());
      G.card(cc, ax.multiplyScalar(s), ay.multiplyScalar(s), (r() * 4) | 0, () => new V3(nn.x * 0.5, 1, nn.z * 0.5).normalize(), col, 1);
    }
    const nv = lod === 2 ? 1 : 3;
    for (let k = 0; k < nv; k++) { // side profile
      const a = r() * 3.1416, ax = new V3(Math.cos(a), 0, Math.sin(a));
      G.card(new V3(c.x, c.y - 0.1, c.z), ax.clone().multiplyScalar(R * 0.95), new V3(0, R * 0.42, 0), (r() * 4) | 0, crownNormal(new V3(c.x, c.y - 1.5, c.z), 0.5), col, 1);
    }
  };
  const nL = lod === 2 ? 3 : 5;
  for (let i = 0; i < nL; i++) {
    const t = 0.42 + 0.5 * i / nL + r() * 0.06, st = pathAt(trunk, t);
    const az = i * 2.2 + r() * 1.2, el = 0.12 + r() * 0.4;
    const dir = new V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const limb = branchPath(r, st, dir, 2.4 + r() * 2.2, 0.1, 0.04, lod === 0 ? 4 : 2, 0.4, 0.15);
    G.tube(limb, [5, 4, 3][lod], bark, 0.28);
    pad(limb[limb.length - 1].p, 1.7 + r() * 0.9);
  }
  pad(trunk[trunk.length - 1].p.clone().add(new V3(0, 0.3, 0)), 2.3);
  return G.build();
}

function buildBamboo(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const nC = [3, 2, 1][lod];
  for (let c = 0; c < nC; c++) {
    const ox = c === 0 ? 0 : (r() - 0.5) * 2.2, oz = c === 0 ? 0 : (r() - 0.5) * 2.2;
    const Ht = 11 + r() * 4, lean = randDir(r, 0, 0).multiplyScalar(0.05 + r() * 0.1);
    const segs = [7, 4, 3][lod];
    const path = [];
    const d = new V3(lean.x, 1, lean.z).normalize(), p = new V3(ox, -0.3, oz);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      path.push({ p: p.clone(), r: lerp(0.055, 0.016, t) });
      d.x += lean.x * 2.4 * t * t; d.z += lean.z * 2.4 * t * t; d.y -= 0.22 * t * t; d.normalize();
      p.addScaledVector(d, Ht / segs);
    }
    G.tube(path, [6, 4, 3][lod], [1, 1, 1], 1 / 2.6, 1);
    const nLeaf = [9, 5, 3][lod];
    for (let k = 0; k < nLeaf; k++) {
      const t = 0.42 + 0.56 * (k + r() * 0.6) / nLeaf, dd = new V3();
      const bp = pathAt(path, t, dd);
      const az = r() * 6.2832;
      const out = new V3(Math.cos(az), -0.25 - 0.35 * r(), Math.sin(az)).normalize();
      const side = new V3().crossVectors(out, new V3(0, 1, 0)).normalize();
      const len = (lod === 2 ? 2.6 : lod === 1 ? 1.9 : 1.45) * (0.8 + 0.4 * r());
      const s = 0.62 + 0.38 * t;
      G.card(bp.clone().addScaledVector(out, len * 0.5), side.multiplyScalar(len * 0.48), out.clone().multiplyScalar(len * 0.5), (r() * 4) | 0, () => new V3(out.x * 0.5, 0.9, out.z * 0.5).normalize(), [s, s, s], 1);
    }
  }
  return G.build();
}

function buildAzalea(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const n = [11, 6, 4][lod], R = 0.85;
  const c = new V3(0, 0.25, 0);
  for (let k = 0; k < n; k++) {
    const nn = randDir(r, 0.1, 1);
    const cc = new V3(nn.x * R * 0.55, 0.3 + nn.y * R * 0.55, nn.z * R * 0.55);
    const ax = new V3().crossVectors(nn, randDir(r)).normalize(), ay = new V3().crossVectors(ax, nn);
    const s = (lod === 2 ? 0.9 : 0.62) * (0.8 + 0.4 * r());
    G.card(cc, ax.multiplyScalar(s), ay.multiplyScalar(s), (r() * 4) | 0, crownNormal(c, 0.3, 1), (p) => { const q = 0.55 + 0.45 * clamp(p.y / 1.1, 0, 1); return [q, q, q]; }, 0.4);
  }
  return G.build();
}

function buildRock(lod, seed) {
  const r = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, [2, 1, 0][lod]);
  const merged = mergeByPosition(g);
  const pos = merged.attributes.position, col = [], wnd = [], uv = [];
  const offs = [];
  for (let k = 0; k < 6; k++) offs.push([randDir(r), 0.25 + r() * 0.3]);
  const v = new V3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let d = 1;
    for (const [dir, amt] of offs) d -= Math.max(0, v.dot(dir) - 0.45) * amt * 1.6; // chiselled facets
    d += (Math.sin(v.x * 7.1 + v.y * 3.3) * Math.sin(v.z * 6.3 + v.x * 2.1)) * 0.06;
    v.multiplyScalar(d); v.y *= 0.62; v.y += 0.18;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  merged.computeVertexNormals();
  const nor = merged.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i), s = 0.75 + 0.25 * Math.sin(pos.getX(i) * 9 + pos.getZ(i) * 7);
    const moss = clamp((ny - 0.45) * 2.2, 0, 1) * 0.75;
    col.push(lerp(0.98 * s, 0.34, moss), lerp(0.96 * s, 0.50, moss), lerp(0.93 * s, 0.20, moss));
    wnd.push(0); uv.push((pos.getX(i) + pos.getZ(i)) * 0.35, 0.03 + 0.14 * (0.5 + 0.5 * Math.sin(pos.getY(i) * 3.0 + pos.getX(i))));
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  merged.setAttribute('aWind', new THREE.Float32BufferAttribute(wnd, 1));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.computeBoundingSphere();
  return merged;
}
function mergeByPosition(g) {
  const pos = g.attributes.position, map = new Map(), verts = [], idx = [];
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(pos.getX(i) * 1e4) + '_' + Math.round(pos.getY(i) * 1e4) + '_' + Math.round(pos.getZ(i) * 1e4);
    let id = map.get(k);
    if (id === undefined) { id = verts.length / 3; map.set(k, id); verts.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    idx.push(id);
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  o.setIndex(idx);
  return o;
}

// ------------------------------------------------------------------ materials
const LEAF_VERT_PARS = '#include <common>\nattribute float aWind;\nuniform float uTime; uniform float uBend; uniform vec3 uWind; uniform float uTreeFar;\nuniform vec3 uTintA; uniform vec3 uTintB;\nvarying float vLeaf;';
const leafVertMove = (fade) => /* glsl */`
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
        #else
          vec3 iPos = modelMatrix[3].xyz;
        #endif
        float ph = iPos.x * 0.13 + iPos.z * 0.17;
        float hgt = max(position.y, 0.0);
        float sway = sin(uTime * 0.9 + ph) + 0.5 * sin(uTime * 2.1 + ph * 1.7 + position.y * 0.2);
        transformed.xz += uWind.xz * (sway * hgt * hgt * 0.0011 * uBend);
        transformed += aWind * 0.05 * vec3(sin(uTime * 3.1 + position.x * 2.7 + ph), 0.6 * sin(uTime * 2.3 + position.z * 3.1 + ph), sin(uTime * 2.7 + position.y * 2.9 + ph));
        ${fade ? 'float tf = 1.0 - smoothstep(uTreeFar * 0.86, uTreeFar, distance(iPos.xz, cameraPosition.xz)); transformed *= tf;' : ''}
        vLeaf = aWind;`;
function foliageMaterial(tex, key, bend, trans, alphaTest = 0.42) {
  const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, alphaTest, alphaToCoverage: true });
  const un = { uBend: { value: bend }, uTrans: { value: trans }, uTintA: { value: new THREE.Color(1, 1, 1) }, uTintB: { value: new THREE.Color(1, 1, 1) }, uDesat: { value: 0 }, uDrop: { value: 0 } };
  m.userData.un = un;
  patch(m, 'foliage', (s) => {
    Object.assign(s.uniforms, un);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', LEAF_VERT_PARS)
      .replace('#include <color_vertex>', /* glsl */`
        vColor = vec4(color, 1.0);
        #ifdef USE_INSTANCING_COLOR
          if (aWind > 0.001) vColor.rgb *= mix(uTintA, uTintB, instanceColor.r) * (0.88 + 0.24 * instanceColor.g);
          else vColor.rgb *= 0.9 + 0.2 * instanceColor.b;
        #endif`)
      .replace('#include <begin_vertex>', leafVertMove(true));
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTrans; uniform float uDesat; uniform float uDrop;\nvarying float vLeaf;')
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        if (vLeaf > 0.001) {
          if ((vLeaf - 0.5) * 2.0 < uDrop) discard;
          float lumL = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumL), uDesat);
        }`)
      .replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif
        {
          vec3 wnF = inverseTransformDirection(normal, viewMatrix);
          float snF = uSnow * smoothstep(0.25, 0.75, wnF.y + (texture2D(uNoiseTex, vWPos.xz * 0.35).r - 0.5) * 0.5) * 0.85;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.93, 0.97), snF);
        }`)
      .replace('#include <lights_fragment_begin>', /* glsl */`#include <lights_fragment_begin>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 Lf = directionalLights[0].direction;
          float nl = dot(normal, Lf);
          float wrap = clamp((nl + 0.7) / 1.7, 0.0, 1.0) - clamp(nl, 0.0, 1.0);
          float back = pow(clamp(dot(-geometryViewDir, Lf), 0.0, 1.0), 3.0);
          reflectedLight.directDiffuse += gDirectCol * diffuseColor.rgb * RECIPROCAL_PI * (wrap * 0.6 + back * uTrans) * step(0.001, vLeaf);
        }
        #endif`);
  });
  // matching depth material so dropped leaves stop casting shadows
  const dm = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  dm.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, un); s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind; s.uniforms.uTreeFar = U.uTreeFar;
    s.vertexShader = s.vertexShader.replace('#include <common>', LEAF_VERT_PARS).replace('#include <begin_vertex>', leafVertMove(false));
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDrop;\nvarying float vLeaf;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nif (vLeaf > 0.001 && (vLeaf - 0.5) * 2.0 < uDrop) discard;');
  };
  dm.customProgramCacheKey = () => 'foliageDepth';
  m.userData.depth = dm;
  return m;
}

// per-season look: [desat, tintA, tintB, drop] for spring, summer, autumn, winter
const SEASON_LOOK = {
  [SP.SAKURA]: [[0, [1, 1, 1], [1.0, 0.80, 0.88], 0], [1, [0.30, 0.50, 0.13], [0.42, 0.62, 0.20], 0], [1, [1.0, 0.56, 0.10], [0.82, 0.22, 0.07], 0.22], [1, [0.5, 0.42, 0.3], [0.5, 0.4, 0.3], 1.05]],
  [SP.MOMIJI]: [[1, [0.44, 0.70, 0.18], [0.60, 0.76, 0.20], 0], [1, [0.25, 0.50, 0.12], [0.36, 0.58, 0.14], 0], [1, [1.0, 0.36, 0.05], [0.80, 0.06, 0.04], 0.08], [1, [0.5, 0.3, 0.2], [0.5, 0.3, 0.2], 1.05]],
  [SP.SUGI]: [[0, [0.86, 0.9, 0.84], [1.1, 1.1, 1.0], 0], [0, [0.82, 0.9, 0.8], [1.05, 1.1, 0.95], 0], [0, [0.9, 0.88, 0.78], [1.1, 1.05, 0.9], 0], [0, [0.8, 0.85, 0.82], [1.0, 1.0, 0.95], 0]],
  [SP.MATSU]: [[0, [0.86, 0.9, 0.84], [1.1, 1.1, 1.0], 0], [0, [0.82, 0.9, 0.8], [1.05, 1.1, 0.95], 0], [0, [0.9, 0.88, 0.78], [1.1, 1.05, 0.9], 0], [0, [0.8, 0.85, 0.82], [1.0, 1.0, 0.95], 0]],
  [SP.BAMBOO]: [[0, [0.92, 0.96, 0.85], [1.12, 1.08, 0.95], 0], [0, [0.85, 0.95, 0.8], [1.05, 1.08, 0.9], 0], [0, [1.0, 0.95, 0.75], [1.15, 1.05, 0.8], 0], [0, [0.9, 0.9, 0.78], [1.05, 1.0, 0.85], 0]],
  [SP.AZALEA]: [[0, [1, 1, 1], [1, 1.25, 1.2], 0], [0.75, [0.45, 0.6, 0.3], [0.55, 0.68, 0.34], 0], [1, [0.5, 0.5, 0.2], [0.7, 0.4, 0.14], 0.1], [1, [0.36, 0.38, 0.22], [0.4, 0.36, 0.2], 0.45]],
  [SP.ROCK]: [[0, [1, 1, 1], [1, 1, 1], 0], [0, [1, 1, 1], [1, 1, 1], 0], [0, [1, 1, 1], [1, 1, 1], 0], [0, [1, 1, 1], [1, 1, 1], 0]],
};

const SPEC = {
  [SP.SAKURA]: { lod: [42, 170], cap: [300, 3000, 9000], bend: 1.0, trans: 0.9, build: (l, v) => buildBroadleaf(l, 11 + v * 5, { size: 8.6, bark: [1.0, 0.9, 0.86], prim: 5, sec: 4, elev: [0.45, 1.0], droop: 0.12, upBias: 0.35, outward: 0.55 }) },
  [SP.SUGI]: { lod: [40, 160], cap: [300, 3000, 12000], bend: 0.5, trans: 0.35, build: (l, v) => buildSugi(l, 21 + v) },
  [SP.MATSU]: { lod: [40, 160], cap: [300, 3000, 9000], bend: 0.7, trans: 0.4, build: (l, v) => buildMatsu(l, 31 + v) },
  [SP.MOMIJI]: { lod: [40, 160], cap: [300, 2500, 8000], bend: 1.0, trans: 1.1, build: (l, v) => buildBroadleaf(l, 41 + v, { size: 6.6, bark: [1.0, 0.97, 0.92], prim: 5, sec: 4, elev: [0.25, 0.75], droop: -0.05, upBias: 0.55, outward: 0.35, flatten: 0.9 }) },
  [SP.BAMBOO]: { lod: [26, 85], cap: [1200, 9000, 30000], bend: 5.0, trans: 1.0, build: (l, v) => buildBamboo(l, 51 + v) },
  [SP.AZALEA]: { lod: [30, 90], cap: [400, 2500, 5000], bend: 0.0, trans: 0.4, build: (l, v) => buildAzalea(l, 61 + v) },
  [SP.ROCK]: { lod: [30, 110], cap: [300, 2000, 5000], bend: 0.0, trans: 0.0, build: (l, v) => buildRock(l, 71 + v) },
};

function instanceTint(sp, t, out, i) {
  out[i] = t; out[i + 1] = (t * 7.13) % 1; out[i + 2] = (t * 13.7) % 1;
}

export class Flora {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.jobs = ctx.jobs;
    const T = makeTextures();
    this.species = [];
    const rockMat = foliageMaterial(T[SP.ROCK], 'rock', 0, 0, 0);
    rockMat.side = THREE.FrontSide; rockMat.alphaToCoverage = false;
    for (let sp = 0; sp < SP.COUNT; sp++) {
      const s = SPEC[sp];
      const mat = sp === SP.ROCK ? rockMat : foliageMaterial(T[sp], 'f' + sp, s.bend, s.trans);
      const geo = [0, 1, 2].map((l) => s.build(l, 0));
      const near = geo.map((g, l) => {
        const m = new THREE.InstancedMesh(g, mat, s.cap[l]);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(s.cap[l] * 3), 3);
        m.count = 0; m.frustumCulled = false; m.castShadow = l < 2; m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        if (l < 2) m.customDepthMaterial = mat.userData.depth;
        this.scene.add(m);
        return m;
      });
      this.species.push({ spec: s, mat, geo, near });
    }
    this.cells = new Map();
    this.lastRebuild = new V3(1e9, 0, 0);
    this.dirty = true;
    this.instances = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new V3(); this._p = new V3(); this._e = new THREE.Euler();
  }
  key(i, j) { return i + ':' + j; }
  addCell(i, j, lists) {
    const cell = this.cells.get(this.key(i, j));
    if (!cell || cell.dead) return;
    cell.sp = [];
    const cx = (i + 0.5) * VEG_CELL, cz = (j + 0.5) * VEG_CELL;
    for (let sp = 0; sp < SP.COUNT; sp++) {
      const d = lists[sp], n = d.length / 6;
      if (!n) { cell.sp.push(null); continue; }
      const mats = new Float32Array(n * 16), cols = new Float32Array(n * 3);
      let ymin = 1e9, ymax = -1e9;
      for (let k = 0; k < n; k++) {
        const x = d[k * 6], y = d[k * 6 + 1], z = d[k * 6 + 2], sc = d[k * 6 + 3], rot = d[k * 6 + 4], t = d[k * 6 + 5];
        this._p.set(x, y, z);
        this._e.set(sp === SP.ROCK ? (t - 0.5) * 0.8 : (t - 0.5) * 0.06, rot, sp === SP.ROCK ? (t * 7 % 1 - 0.5) * 0.8 : ((t * 13) % 1 - 0.5) * 0.06);
        this._q.setFromEuler(this._e);
        const ys = sc * (0.9 + 0.25 * ((t * 31) % 1));
        this._s.set(sc, sp === SP.ROCK ? sc * (0.7 + 0.6 * ((t * 17) % 1)) : ys, sc);
        this._m.compose(this._p, this._q, this._s);
        this._m.toArray(mats, k * 16);
        instanceTint(sp, t, cols, k * 3);
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
      const far = new THREE.InstancedMesh(this.species[sp].geo[2], this.species[sp].mat, n);
      far.instanceMatrix.array.set(mats); far.instanceMatrix.needsUpdate = true;
      far.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
      far.boundingSphere = new THREE.Sphere(new V3(cx, (ymin + ymax) / 2 + 8, cz), VEG_CELL * 0.75 + (ymax - ymin) / 2 + 16);
      far.matrixAutoUpdate = false; far.receiveShadow = false; far.castShadow = false; far.visible = !cell.near;
      this.scene.add(far);
      cell.sp.push({ n, mats, cols, far });
      this.instances += n;
    }
    cell.ready = true;
    this.dirty = true;
  }
  clear() {
    for (const cell of this.cells.values()) this.dropCell(cell);
    this.cells.clear(); this.dirty = true;
  }
  rebase(sx, sz) {
    const di = Math.round(sx / VEG_CELL), dj = Math.round(sz / VEG_CELL), nc = new Map();
    for (const cell of this.cells.values()) {
      if (!cell.ready) { cell.dead = true; if (cell.job) cell.job.cancelled = true; continue; }
      cell.i -= di; cell.j -= dj;
      for (const s of cell.sp) {
        if (!s) continue;
        const m = s.mats;
        for (let k = 0; k < s.n; k++) { m[k * 16 + 12] -= sx; m[k * 16 + 14] -= sz; }
        s.far.instanceMatrix.array.set(m); s.far.instanceMatrix.needsUpdate = true;
        s.far.boundingSphere.center.x -= sx; s.far.boundingSphere.center.z -= sz;
      }
      nc.set(this.key(cell.i, cell.j), cell);
    }
    this.cells = nc; this.dirty = true;
  }
  dropCell(cell) {
    cell.dead = true;
    if (cell.job) cell.job.cancelled = true;
    if (cell.sp) for (const s of cell.sp) if (s) { this.scene.remove(s.far); s.far.dispose(); this.instances -= s.n; }
    this.dirty = true;
  }
  update() {
    const cam = this.ctx.camera.position, Q = this.ctx.Q();
    const R = Q.treeR;
    U.uTreeFar.value = R;
    const sw = U.uSeason.value, ws = [sw.x, sw.y, sw.z, sw.w];
    for (let sp = 0; sp < SP.COUNT; sp++) {
      const un = this.species[sp].mat.userData.un, L = SEASON_LOOK[sp];
      let de = 0, dr = 0; const a = [0, 0, 0], b = [0, 0, 0];
      for (let q = 0; q < 4; q++) { const w = ws[q]; de += L[q][0] * w; dr += L[q][3] * w; for (let c = 0; c < 3; c++) { a[c] += L[q][1][c] * w; b[c] += L[q][2][c] * w; } }
      un.uDesat.value = de; un.uDrop.value = dr; un.uTintA.value.setRGB(a[0], a[1], a[2]); un.uTintB.value.setRGB(b[0], b[1], b[2]);
    }
    const ci = Math.floor(cam.x / VEG_CELL), cj = Math.floor(cam.z / VEG_CELL), n = Math.ceil(R / VEG_CELL);
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const dx = Math.max(i * VEG_CELL - cam.x, 0, cam.x - (i + 1) * VEG_CELL), dz = Math.max(j * VEG_CELL - cam.z, 0, cam.z - (j + 1) * VEG_CELL);
      if (dx * dx + dz * dz > R * R) continue;
      const k = this.key(i, j);
      if (this.cells.has(k)) continue;
      const cell = { i, j, ready: false, near: false, sp: null, dead: false };
      const cx = (i + 0.5) * VEG_CELL, cz = (j + 0.5) * VEG_CELL;
      cell.job = this.jobs.run('veg', [i, j], () => Math.hypot(cx - cam.x, cz - cam.z) * 0.6 + 40);
      cell.job.promise.then((l) => this.addCell(i, j, l));
      this.cells.set(k, cell);
    }
    let nearChanged = false;
    const maxNear = 172;
    for (const [k, cell] of this.cells) {
      const dx = Math.max(cell.i * VEG_CELL - cam.x, 0, cam.x - (cell.i + 1) * VEG_CELL), dz = Math.max(cell.j * VEG_CELL - cam.z, 0, cam.z - (cell.j + 1) * VEG_CELL);
      const d = Math.hypot(dx, dz);
      if (d > R + 160) { this.dropCell(cell); this.cells.delete(k); continue; }
      const near = d < maxNear + (cell.near ? 14 : 0);
      if (near !== cell.near) {
        cell.near = near; nearChanged = true;
        if (cell.sp) for (const s of cell.sp) if (s) s.far.visible = !near;
      }
    }
    if (nearChanged || this.dirty || this.lastRebuild.distanceToSquared(cam) > 36) this.rebuild(cam);
  }
  rebuild(cam) {
    this.dirty = false; this.lastRebuild.copy(cam);
    const counts = [];
    for (let sp = 0; sp < SP.COUNT; sp++) counts.push([0, 0, 0]);
    for (const cell of this.cells.values()) {
      if (!cell.near || !cell.ready) continue;
      for (let sp = 0; sp < SP.COUNT; sp++) {
        const s = cell.sp[sp];
        if (!s) continue;
        const S = this.species[sp], d0 = S.spec.lod[0], d1 = S.spec.lod[1], d0s = d0 * d0, d1s = d1 * d1;
        const m = s.mats, c = s.cols, cnt = counts[sp];
        for (let k = 0; k < s.n; k++) {
          const dx = m[k * 16 + 12] - cam.x, dy = m[k * 16 + 13] - cam.y, dz = m[k * 16 + 14] - cam.z;
          const dd = dx * dx + dy * dy * 0.25 + dz * dz;
          const l = dd < d0s ? 0 : dd < d1s ? 1 : 2;
          const mesh = S.near[l];
          const at = cnt[l];
          if (at >= S.spec.cap[l]) continue;
          const dst = mesh.instanceMatrix.array, o = at * 16, q = k * 16;
          for (let e = 0; e < 16; e++) dst[o + e] = m[q + e];
          const dc = mesh.instanceColor.array;
          dc[at * 3] = c[k * 3]; dc[at * 3 + 1] = c[k * 3 + 1]; dc[at * 3 + 2] = c[k * 3 + 2];
          cnt[l] = at + 1;
        }
      }
    }
    for (let sp = 0; sp < SP.COUNT; sp++) for (let l = 0; l < 3; l++) {
      const mesh = this.species[sp].near[l];
      mesh.count = counts[sp][l];
      mesh.visible = mesh.count > 0;
      if (mesh.count) {
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16); mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, mesh.count * 3); mesh.instanceColor.needsUpdate = true;
      }
    }
    this.nearCounts = counts;
  }
}

// ------------------------------------------------------------------ grass
function grassTexture() {
  // two tiles: grass tuft, and tuft with flower heads. R = brightness, G = flower mask, A = coverage
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (let tile = 0; tile < 2; tile++) {
    const r = mulberry32(300 + tile * 17);
    g.save(); g.translate(tile * 256, 0); g.beginPath(); g.rect(3, 0, 250, 256); g.clip();
    const blades = [];
    for (let i = 0; i < 46; i++) blades.push({ x: 16 + r() * 224, h: 60 + Math.pow(r(), 0.7) * 185, lean: (r() - 0.5) * 70, w: 5 + r() * 6, l: 0.75 + r() * 0.25 });
    blades.sort((p, q) => q.h - p.h);
    for (const bl of blades) {
      const tx = bl.x + bl.lean, ty = 256 - bl.h, cx = bl.x + bl.lean * 0.25, cy = 256 - bl.h * 0.6;
      const gr = g.createLinearGradient(0, 256, 0, ty);
      gr.addColorStop(0, `rgb(${Math.round(70 * bl.l)},0,0)`); gr.addColorStop(0.5, `rgb(${Math.round(165 * bl.l)},0,0)`); gr.addColorStop(1, `rgb(${Math.round(255 * bl.l)},0,0)`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(bl.x - bl.w / 2, 256); g.quadraticCurveTo(cx - bl.w * 0.3, cy, tx, ty); g.quadraticCurveTo(cx + bl.w * 0.3, cy, bl.x + bl.w / 2, 256); g.fill();
    }
    if (tile === 1) {
      for (let i = 0; i < 6; i++) {
        const x = 30 + r() * 196, y = 30 + r() * 110, rad = 7 + r() * 4;
        g.strokeStyle = 'rgb(150,0,0)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + (r() - 0.5) * 20, 256); g.quadraticCurveTo(x, 180, x, y); g.stroke();
        g.fillStyle = 'rgb(255,255,0)';
        for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; g.beginPath(); g.ellipse(x + Math.cos(a) * rad * 0.55, y + Math.sin(a) * rad * 0.55, rad * 0.55, rad * 0.36, a, 0, 6.3); g.fill(); }
        g.fillStyle = 'rgb(190,130,0)'; g.beginPath(); g.arc(x, y, rad * 0.3, 0, 6.3); g.fill();
      }
    }
    g.restore();
  }
  const img = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sI = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
    if (img[sI + 3] < 8) { out[d] = 150; out[d + 1] = 0; out[d + 2] = 0; out[d + 3] = 0; }
    else { out[d] = img[sI]; out[d + 1] = img[sI + 1]; out[d + 2] = 0; out[d + 3] = img[sI + 3]; }
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export class Grass {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.jobs = ctx.jobs;
    // tuft card: 2 columns x 3 rows so it can bend in the wind
    const p = [-0.5, 0, 0, 0.5, 0, 0, -0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, 1, 0, 0.5, 1, 0];
    this.blade = { pos: new THREE.Float32BufferAttribute(p, 3), idx: [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4] };
    this.uGrassR = { value: 60 };
    const uGrassTex = { value: grassTexture() };
    const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, alphaTest: 0.3, alphaToCoverage: true });
    patch(m, 'grass', (s) => {
      s.uniforms.uGrassR = this.uGrassR; s.uniforms.uWind = U.uWind; s.uniforms.uGrassTex = uGrassTex;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', /* glsl */`#include <common>
          attribute vec4 aG0; attribute vec4 aG1;
          uniform sampler2D uNoiseTex; uniform float uTime; uniform float uGrassR; uniform vec3 uWind; uniform vec4 uSeason; uniform float uSnow;
          varying vec3 vGCol; varying vec3 vFlCol; varying vec2 vGUv;`)
        .replace('#include <beginnormal_vertex>', /* glsl */`
          float gt = position.y;
          vec3 gBase = aG0.xyz;
          float dCam = distance(gBase, cameraPosition);
          float gFade = 1.0 - smoothstep(uGrassR * 0.72, uGrassR, dCam);
          float isFl = step(0.5, aG1.z) * step(0.5, uSeason.x + uSeason.y);
          float gH = (0.24 + 0.40 * aG1.x) * gFade * (1.0 + isFl * 0.2) * (1.0 - 0.5 * uSnow) * (1.0 + 0.25 * uSeason.y);
          float gW = 0.52 * (0.7 + 0.6 * aG1.y);
          vec2 gDir = vec2(cos(aG0.w), sin(aG0.w));
          vec2 gPerp = vec2(-gDir.y, gDir.x);
          float gust = texture2D(uNoiseTex, gBase.xz * 0.006 + uTime * vec2(0.035, 0.022)).r;
          float gSway = sin(uTime * 2.3 + gBase.x * 0.35 + gBase.z * 0.28) * 0.3 + (gust - 0.45) * 1.7;
          float gLean = (0.1 + 0.3 * aG1.y) + gSway * 0.3;
          float gtt = gt * gt;
          vec3 gPos = gBase + vec3(gDir.x, 0.0, gDir.y) * (position.x * gW) + vec3(gPerp.x, 0.0, gPerp.y) * (gLean * gtt * gH) + vec3(0.0, gt * gH * (1.0 - 0.25 * gLean * gLean * gt), 0.0);
          gPos.xz += uWind.xz * ((gust - 0.35) * gtt * gH * 0.45);
          vec3 objectNormal = normalize(vec3(gPerp.x * 0.3, 1.0, gPerp.y * 0.3));
          vec4 gn1 = texture2D(uNoiseTex, gBase.xz * 0.0031);
          vec3 gc = mix(vec3(0.080, 0.160, 0.030), vec3(0.150, 0.235, 0.045), gn1.r);
          gc = mix(gc, vec3(0.22, 0.235, 0.075), smoothstep(0.5, 0.95, gn1.g) * 0.5);
          gc = mix(gc, gc * vec3(1.25, 0.95, 1.0), aG1.w * 0.3 * uSeason.x);
          gc = mix(gc, gc * vec3(0.8, 1.05, 0.7), uSeason.y * 0.6);
          gc = mix(gc, vec3(0.30, 0.235, 0.07) * (0.7 + 0.6 * gn1.b), uSeason.z * 0.75);
          gc = mix(gc, vec3(0.26, 0.23, 0.13), uSeason.w * 0.8);
          vGCol = mix(gc * 0.85, gc * 1.3 + vec3(0.01, 0.02, 0.0), gt) * (0.85 + 0.3 * aG1.y);
          vGCol = mix(vGCol, vec3(0.86, 0.90, 0.96), uSnow * smoothstep(0.15, 0.7, gt) * 0.85);
          vFlCol = aG1.z < 1.5 ? vec3(0.95, 0.93, 0.86) : aG1.z < 2.5 ? vec3(0.98, 0.74, 0.08) : vec3(0.62, 0.42, 0.92);
          vGUv = vec2((position.x + 0.5) * 0.5 + 0.5 * isFl, position.y);`)
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uGrassTex;\nvarying vec3 vGCol; varying vec3 vFlCol; varying vec2 vGUv;')
        .replace('#include <map_fragment>', /* glsl */`
          vec4 gtx = texture2D(uGrassTex, vGUv, -0.8);
          diffuseColor.rgb = mix(vGCol * (0.52 + 0.62 * gtx.r), vFlCol * (0.55 + 0.5 * gtx.r), gtx.g);
          diffuseColor.a = min(1.0, gtx.a * 1.5);`)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n normal *= faceDirection;\n#endif')
        .replace('#include <lights_fragment_begin>', /* glsl */`#include <lights_fragment_begin>
          #if NUM_DIR_LIGHTS > 0
          {
            float back = pow(clamp(dot(-geometryViewDir, directionalLights[0].direction), 0.0, 1.0), 3.0);
            reflectedLight.directDiffuse += gDirectCol * diffuseColor.rgb * RECIPROCAL_PI * back * 0.9;
          }
          #endif`);
    });
    this.material = m;
    this.cells = new Map();
  }
  clear() {
    for (const cell of this.cells.values()) { cell.dead = true; if (cell.job) cell.job.cancelled = true; if (cell.mesh) { this.scene.remove(cell.mesh); cell.mesh.geometry.dispose(); } }
    this.cells.clear();
  }
  rebase(sx, sz) {
    const di = Math.round(sx / GRASS_CELL), dj = Math.round(sz / GRASS_CELL), nc = new Map();
    for (const cell of this.cells.values()) {
      if (!cell.mesh) { cell.dead = true; if (cell.job) cell.job.cancelled = true; continue; }
      cell.i -= di; cell.j -= dj;
      const g = cell.mesh.geometry, ib = g.attributes.aG0.data, a = ib.array;
      for (let q = 0; q < a.length; q += 8) { a[q] -= sx; a[q + 2] -= sz; }
      ib.needsUpdate = true;
      g.boundingSphere.center.x -= sx; g.boundingSphere.center.z -= sz;
      nc.set(cell.i + ':' + cell.j, cell);
    }
    this.cells = nc;
  }
  update() {
    const cam = this.ctx.camera.position, Q = this.ctx.Q(), R = Q.grassR;
    this.uGrassR.value = R;
    const active = this.ctx.player.agl < 75;
    const ci = Math.floor(cam.x / GRASS_CELL), cj = Math.floor(cam.z / GRASS_CELL), n = Math.ceil(R / GRASS_CELL);
    if (active) for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const cx = (i + 0.5) * GRASS_CELL, cz = (j + 0.5) * GRASS_CELL;
      if (Math.hypot(cx - cam.x, cz - cam.z) > R + GRASS_CELL * 0.7) continue;
      const k = i + ':' + j;
      if (this.cells.has(k)) continue;
      const cell = { i, j, mesh: null, dead: false };
      cell.job = this.jobs.run('grass', [i, j, Math.round(3000 * Q.grassD)], () => Math.hypot(cx - cam.x, cz - cam.z) * 0.5);
      cell.job.promise.then((r) => {
        if (cell.dead || r.n === 0) return;
        const g = new THREE.InstancedBufferGeometry();
        g.setAttribute('position', this.blade.pos); g.setIndex(this.blade.idx);
        const ib = new THREE.InstancedInterleavedBuffer(r.data, 8, 1);
        g.setAttribute('aG0', new THREE.InterleavedBufferAttribute(ib, 4, 0));
        g.setAttribute('aG1', new THREE.InterleavedBufferAttribute(ib, 4, 4));
        g.instanceCount = r.n;
        let ymin = 1e9, ymax = -1e9;
        for (let q = 0; q < r.n; q += 37) { const y = r.data[q * 8 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
        g.boundingSphere = new THREE.Sphere(new V3(cx, (ymin + ymax) / 2, cz), GRASS_CELL * 0.75 + (ymax - ymin) / 2 + 2);
        const mesh = new THREE.Mesh(g, this.material);
        mesh.matrixAutoUpdate = false; mesh.receiveShadow = true; mesh.castShadow = false; mesh.layers.set(1);
        cell.mesh = mesh; cell.n = r.n;
        this.scene.add(mesh);
      });
      this.cells.set(k, cell);
    }
    for (const [k, cell] of this.cells) {
      const cx = (cell.i + 0.5) * GRASS_CELL, cz = (cell.j + 0.5) * GRASS_CELL;
      const d = Math.hypot(cx - cam.x, cz - cam.z);
      if (d > R + GRASS_CELL * 2 || !active) {
        cell.dead = true; if (cell.job) cell.job.cancelled = true;
        if (cell.mesh) { this.scene.remove(cell.mesh); cell.mesh.geometry.dispose(); }
        this.cells.delete(k);
      } else if (cell.mesh) {
        // thin out distant patches
        cell.mesh.geometry.instanceCount = Math.max(1, Math.round(cell.n * clamp(1.25 - d / R * 0.7, 0.45, 1)));
      }
    }
  }
}
