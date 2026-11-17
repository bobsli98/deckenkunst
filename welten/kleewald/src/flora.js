// Vegetation of the lawn, at the scale of a beetle: grass tufts taller than houses, clover forests,
// dandelions and daisies, mushrooms, fallen leaves, pebbles and twigs. Procedural textures, 3 LODs each.
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
function barkStrip(g, r, colors, kind) {
  g.fillStyle = colors[0]; g.fillRect(0, 0, 512, 128);
  if (kind === 'plates') {
    for (let i = 0; i < 260; i++) { g.fillStyle = pick(r, colors); g.globalAlpha = 0.85; const x = r() * 512, y = r() * 128, w = 18 + r() * 40, h = 8 + r() * 16; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(40,36,32,0.45)'; g.lineWidth = 1.3; g.stroke(); }
  } else if (kind === 'bark') {
    for (let i = 0; i < 520; i++) { g.strokeStyle = pick(r, colors); g.globalAlpha = 0.5 + r() * 0.5; g.lineWidth = 1 + r() * 2.5; const y = r() * 128, x = r() * 512, l = 30 + r() * 160; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 5); g.stroke(); }
    g.globalAlpha = 0.7;
    for (let i = 0; i < 120; i++) { g.fillStyle = r() < 0.5 ? '#8a7a62' : '#2a2018'; g.fillRect(r() * 512, r() * 128, 6 + r() * 10, 1.5 + r() * 2); }
  } else { // smooth stems with fine lengthwise streaks
    for (let i = 0; i < 420; i++) { g.strokeStyle = pick(r, colors); g.globalAlpha = 0.25 + r() * 0.4; g.lineWidth = 1 + r() * 3; const y = r() * 128, x = r() * 512, l = 40 + r() * 200; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 4); g.stroke(); }
    if (kind === 'hairy') { g.globalAlpha = 0.5; g.strokeStyle = '#e8f0d8'; g.lineWidth = 0.8; for (let i = 0; i < 300; i++) { const x = r() * 512, y = r() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3 + r() * 4, y - 2 - r() * 3); g.stroke(); } }
  }
  g.globalAlpha = 1;
}
// a grass blade surface: the whole tile is the blade, from base (bottom) to tip (top)
function bladeTile(g, r, cols) {
  const gr = g.createLinearGradient(0, 256, 0, 0);
  gr.addColorStop(0, cols[0]); gr.addColorStop(0.45, cols[1]); gr.addColorStop(0.9, cols[2]); gr.addColorStop(1, cols[3]);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let x = 6; x < 256; x += 9 + r() * 7) { g.globalAlpha = 0.18 + r() * 0.14; g.fillStyle = r() < 0.5 ? '#f4ffd8' : '#163808'; g.fillRect(x, 0, 1.6 + r() * 1.4, 256); }
  g.globalAlpha = 0.55; g.fillStyle = '#e6f5b8'; g.fillRect(124, 0, 8, 256); // midrib
  g.globalAlpha = 0.35; g.fillStyle = '#123406'; g.fillRect(120, 0, 3, 256); g.fillRect(133, 0, 3, 256);
  g.globalAlpha = 0.2;
  for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.6 ? '#0d2a04' : '#f0ffc8'; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 8); }
  g.globalAlpha = 1;
}
function heart(g, r, base, mark) { // clover leaflet: point at the bottom of the tile (towards the stem)
  g.fillStyle = base;
  g.beginPath(); g.moveTo(128, 252);
  g.bezierCurveTo(30, 200, -10, 90, 50, 30); g.bezierCurveTo(90, -5, 122, 30, 128, 58);
  g.bezierCurveTo(134, 30, 166, -5, 206, 30); g.bezierCurveTo(266, 90, 226, 200, 128, 252); g.closePath(); g.fill();
  g.save(); g.clip();
  g.globalAlpha = 0.5; g.strokeStyle = mark; g.lineWidth = 9;
  g.beginPath(); g.moveTo(58, 120); g.quadraticCurveTo(128, 175, 198, 120); g.stroke(); // the pale chevron
  g.globalAlpha = 0.4; g.strokeStyle = '#1d4410'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 252); g.lineTo(128, 70); g.stroke();
  g.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) { const y = 220 - i * 18; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128, y); g.quadraticCurveTo(128 + s * 40, y - 25, 128 + s * (60 + i * 6), y - 45); g.stroke(); } }
  g.globalAlpha = 0.18; for (let i = 0; i < 200; i++) { g.fillStyle = r() < 0.5 ? '#0b2404' : '#eaffd0'; g.fillRect(r() * 256, r() * 256, 2, 2); }
  g.restore(); g.globalAlpha = 1;
}
function radialHead(g, r, o) { // flower heads seen from above, mapped onto a disc
  const n = o.n;
  for (let ring = 0; ring < (o.rings || 1); ring++) for (let i = 0; i < n; i++) {
    const a = (i + ring * 0.5 + r() * 0.2) / n * 6.2832, L = o.len * (1 - ring * 0.18) * (0.9 + r() * 0.15);
    g.fillStyle = pick(r, o.cols);
    g.save(); g.translate(128, 128); g.rotate(a);
    g.beginPath(); g.ellipse(L * 0.55, 0, L * 0.5, o.w * (0.85 + r() * 0.3), 0, 0, 6.3); g.fill();
    if (o.tip) { g.fillStyle = o.tip; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(L * 0.95, 0, L * 0.1, o.w * 0.8, 0, 0, 6.3); g.fill(); g.globalAlpha = 1; }
    g.restore();
  }
  if (o.centre) {
    const gr = g.createRadialGradient(128, 128, 2, 128, 128, o.centreR);
    gr.addColorStop(0, o.centre[0]); gr.addColorStop(1, o.centre[1]);
    g.fillStyle = gr; g.beginPath(); g.arc(128, 128, o.centreR, 0, 6.3); g.fill();
    for (let i = 0; i < 160; i++) { const a = i * 2.39996, d = Math.sqrt(i / 160) * o.centreR * 0.95; g.fillStyle = i % 3 ? o.centre[2] : o.centre[0]; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2.2, 0, 6.3); g.fill(); }
  }
}
function puff(g, r) { // dandelion clock: a soft sphere of seeds on fine stalks
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 122);
  gr.addColorStop(0, 'rgba(225,222,205,0.95)'); gr.addColorStop(0.55, 'rgba(240,240,232,0.75)'); gr.addColorStop(0.85, 'rgba(250,250,245,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 122, 0, 6.3); g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < 110; i++) {
    const a = r() * 6.2832, L = 92 + r() * 26, x = 128 + Math.cos(a) * L, y = 128 + Math.sin(a) * L;
    g.strokeStyle = 'rgba(255,255,250,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(128 + Math.cos(a) * 40, 128 + Math.sin(a) * 40); g.lineTo(x, y); g.stroke();
    for (let k = 0; k < 7; k++) { const b = a + (k - 3) * 0.26; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * 12, y + Math.sin(b) * 12); g.stroke(); }
  }
  g.fillStyle = '#b8a070'; g.beginPath(); g.arc(128, 128, 16, 0, 6.3); g.fill();
}
function toothLeaf(g, r, cols) { // the lion's tooth: long leaf with backward-pointing lobes
  g.fillStyle = pick(r, cols);
  g.beginPath(); g.moveTo(128, 254);
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, y = 250 - t * 240, w = (1 - Math.pow(t, 1.4)) * 52 + 6; pts.push([y, w]); }
  for (let i = 0; i < pts.length; i++) { const [y, w] = pts[i]; g.lineTo(128 - w * (i % 2 ? 1.25 : 0.55), y + (i % 2 ? 12 : 0)); }
  g.lineTo(128, 6);
  for (let i = pts.length - 1; i >= 0; i--) { const [y, w] = pts[i]; g.lineTo(128 + w * (i % 2 ? 0.55 : 1.25), y + (i % 2 ? 0 : 12)); }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(230,240,190,0.6)'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 254); g.lineTo(128, 14); g.stroke();
}
function treeLeaf(g, r, kind) { // fallen leaves: oak, beech, maple, birch
  g.save(); g.translate(128, 128);
  g.fillStyle = '#b39a4c'; g.beginPath();
  if (kind === 0) { // oak
    g.moveTo(0, 122);
    for (let i = 0; i <= 12; i++) { const t = i / 12, y = 110 - t * 225, w = (Math.sin(Math.PI * Math.pow(t, 0.8)) * 62 + 6) * (i % 2 ? 1 : 0.62); g.lineTo(-w, y); }
    for (let i = 12; i >= 0; i--) { const t = i / 12, y = 110 - t * 225, w = (Math.sin(Math.PI * Math.pow(t, 0.8)) * 62 + 6) * (i % 2 ? 1 : 0.62); g.lineTo(w, y); }
  } else if (kind === 1) { g.moveTo(0, 122); g.bezierCurveTo(-95, 60, -80, -80, 0, -118); g.bezierCurveTo(80, -80, 95, 60, 0, 122); } // beech
  else if (kind === 2) { // maple
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i - 5) * 0.55, rr = i % 2 ? 48 : 112; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + 18); }
    g.lineTo(0, 110);
  } else { g.moveTo(0, 118); g.bezierCurveTo(-80, 40, -70, -60, 0, -112); g.bezierCurveTo(70, -60, 80, 40, 0, 118); } // birch
  g.closePath(); g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,60,20,0.25)' : 'rgba(230,210,140,0.25)'; g.beginPath(); g.arc((r() - 0.5) * 220, (r() - 0.5) * 240, 4 + r() * 18, 0, 6.3); g.fill(); }
  g.strokeStyle = 'rgba(240,225,170,0.75)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 122); g.lineTo(0, -110); g.stroke();
  g.lineWidth = 1.8;
  if (kind === 2) for (let k = -2; k <= 2; k++) { const a = -Math.PI / 2 + k * 1.1; g.beginPath(); g.moveTo(0, 18); g.lineTo(Math.cos(a) * 100, Math.sin(a) * 100 + 18); g.stroke(); }
  else for (let i = 0; i < 9; i++) { const y = 95 - i * 23; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, y); g.lineTo(s * 80, y - 34); g.stroke(); } }
  g.restore(); g.restore();
}
function makeTextures() {
  const T = {};
  T[SP.GRAS] = foliageTexture([70, 120, 40], (g, r, t) => bladeTile(g, r, [['#2a4a12', '#4f8a24', '#77ad3a', '#a8b860'], ['#2c4f14', '#5a9228', '#86b844', '#b8c070'], ['#26450f', '#467f22', '#6ea436', '#9cae58'], ['#304e16', '#5f8c2c', '#8cb04a', '#c2b868']][t]),
    (g, r) => barkStrip(g, r, ['#4a7a24', '#5a8a2e', '#3c6a1c'], 'smooth'));
  T[SP.KLEE] = foliageTexture([60, 110, 40], (g, r, t) => {
    if (t === 2) radialHead(g, r, { n: 34, rings: 3, len: 105, w: 9, cols: ['#f6f0f0', '#efe4e6', '#fff8f8', '#e8d6dc'], tip: '#d8a8b8', centre: ['#e0d0b0', '#c8c098', '#f2ead8'], centreR: 22 });
    else heart(g, r, ['#3f7a24', '#4a8a2a', '#38701f', '#457f26'][t], '#c8e8a8');
  }, (g, r) => barkStrip(g, r, ['#7a9a4a', '#8aa458', '#a06a5a'], 'smooth'));
  T[SP.LOEWE] = foliageTexture([90, 130, 50], (g, r, t) => {
    if (t === 0) radialHead(g, r, { n: 48, rings: 5, len: 118, w: 6.5, cols: ['#ffd21a', '#ffc40c', '#ffdc3a', '#f5b800'], centre: ['#e8a400', '#d89400', '#f0b820'], centreR: 18 });
    else if (t === 1) puff(g, r);
    else toothLeaf(g, r, t === 2 ? ['#3e7a22', '#468428'] : ['#4a8a2a', '#3a6e1e']);
  }, (g, r) => barkStrip(g, r, ['#9ab868', '#a6c070', '#b89070'], 'smooth'));
  T[SP.BLUME] = foliageTexture([230, 230, 220], (g, r, t) => {
    if (t < 2) radialHead(g, r, { n: 30, rings: 2, len: 116, w: 8, cols: t === 0 ? ['#ffffff', '#f8f6f2', '#fffaf6'] : ['#fff4f6', '#fbe6ec', '#ffffff'], tip: t === 0 ? '#f0b8c8' : '#e88aa8', centre: ['#ffd030', '#f0b000', '#ffe060'], centreR: 34 });
    else { g.fillStyle = t === 2 ? '#4a8a2c' : '#3e7a24'; g.beginPath(); g.moveTo(128, 254); g.bezierCurveTo(70, 200, 60, 40, 128, 8); g.bezierCurveTo(196, 40, 186, 200, 128, 254); g.fill(); g.strokeStyle = 'rgba(220,240,190,0.5)'; g.lineWidth = 4; g.beginPath(); g.moveTo(128, 254); g.lineTo(128, 20); g.stroke(); }
  }, (g, r) => barkStrip(g, r, ['#6a9a3a', '#78a848', '#5a8a30'], 'hairy'));
  T[SP.PILZ] = foliageTexture([190, 90, 80], (g, r, t) => {
    const cap = (c, spots) => {
      const gr = g.createRadialGradient(128, 128, 5, 128, 128, 120);
      gr.addColorStop(0, c[0]); gr.addColorStop(0.7, c[1]); gr.addColorStop(1, c[2]);
      g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 120, 0, 6.3); g.fill();
      for (let i = 0; i < spots; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 108; g.fillStyle = '#f6f0e0'; g.beginPath(); g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4 + r() * 7, 3 + r() * 6, r() * 3, 0, 6.3); g.fill(); }
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.arc(128 + (r() - 0.5) * 230, 128 + (r() - 0.5) * 230, 5 + r() * 14, 0, 6.3); g.fill(); }
    };
    const gills = (c) => { g.fillStyle = c[0]; g.beginPath(); g.arc(128, 128, 120, 0, 6.3); g.fill(); g.strokeStyle = c[1]; g.lineWidth = 1.6; for (let i = 0; i < 90; i++) { const a = i / 90 * 6.2832; g.beginPath(); g.moveTo(128 + Math.cos(a) * 18, 128 + Math.sin(a) * 18); g.lineTo(128 + Math.cos(a) * 119, 128 + Math.sin(a) * 119); g.stroke(); } };
    if (t === 0) cap(['#e0402a', '#c82e20', '#8a1c14'], 50);
    else if (t === 2) cap(['#b88a5a', '#8e6238', '#5a3a20'], 0);
    else gills(t === 1 ? ['#f2ead8', '#c8bca0'] : ['#e8dcc0', '#b8a888']);
  }, (g, r) => barkStrip(g, r, ['#f0e8d6', '#e2d8c0', '#f8f2e4', '#d4c8ae'], 'smooth'));
  T[SP.BLATT] = foliageTexture([180, 150, 80], (g, r, t) => treeLeaf(g, r, t), (g, r) => barkStrip(g, r, ['#8a6a3a', '#7a5a30'], 'smooth'));
  T[SP.ROCK] = foliageTexture([160, 155, 150], () => {}, (g, r) => barkStrip(g, r, ['#a8a49c', '#968f86', '#bcb6aa', '#857e76', '#c8c0b2'], 'plates'));
  T[SP.ZWEIG] = foliageTexture([110, 90, 60], () => {}, (g, r) => barkStrip(g, r, ['#5a4632', '#6a5440', '#4a3828', '#7a6650'], 'bark'));
  return T;
}

// ------------------------------------------------------------------ geometry builder
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.gl = []; this.sw = []; this.idx = []; this.cardSeed = 12345; this.swap = 0; }
  vert(x, y, z, nx, ny, nz, u, v, r, g, b, w, gl = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(r, g, b); this.w.push(w); this.gl.push(gl); this.sw.push(this.swap);
    return this.p.length / 3 - 1;
  }
  rnd() { return (this.cardSeed = (this.cardSeed * 16807 + 11) % 2147483647) / 2147483647; }
  // path: [{p: V3, r}], bark uv. col and gl may be functions of (ring index, last index)
  tube(path, radial, col, uScale = 0.25, dark = 1, gl = 0) {
    const t = new V3(), nrm = new V3(), bin = new V3(), tmp = new V3();
    let len = 0;
    const last = path.length - 1;
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)].p, b = path[Math.min(last, i + 1)].p;
      t.subVectors(b, a).normalize();
      if (i === 0) { tmp.set(Math.abs(t.y) > 0.9 ? 1 : 0, Math.abs(t.y) > 0.9 ? 0 : 1, 0); nrm.crossVectors(t, tmp).normalize(); }
      else { nrm.addScaledVector(t, -nrm.dot(t)).normalize(); len += path[i].p.distanceTo(path[i - 1].p); }
      bin.crossVectors(t, nrm);
      const base = this.p.length / 3;
      const cc = typeof col === 'function' ? col(i, last) : col, gv = typeof gl === 'function' ? gl(i, last) : gl;
      const sh = dark * (0.75 + 0.25 * Math.min(1, path[i].p.y / 30));
      for (let k = 0; k <= radial; k++) {
        const an = k / radial * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an);
        const dx = nrm.x * cs + bin.x * sn, dy = nrm.y * cs + bin.y * sn, dz = nrm.z * cs + bin.z * sn;
        const p = path[i].p, r = path[i].r;
        this.vert(p.x + dx * r, p.y + dy * r, p.z + dz * r, dx, dy, dz, len * uScale, 0.015 + (LEAF_V0 - 0.03) * (k / radial), cc[0] * sh, cc[1] * sh, cc[2] * sh, 0, gv);
      }
      if (i > 0) {
        const a0 = base - (radial + 1);
        for (let k = 0; k < radial; k++) this.idx.push(a0 + k, a0 + k + 1, base + k, a0 + k + 1, base + k + 1, base + k);
      }
    }
  }
  // textured quad. c: centre, ax/ay: half extents, tile 0..3, n: shading normal function(pos)->V3
  card(c, ax, ay, tile, nfn, col, wind, anchor = 0, gl = 0) {
    const u0 = (tile % 2) * 0.5 + 0.012, u1 = u0 + 0.476;
    const vt = 1 - (tile >> 1) * (1 - LEAF_V0) * 0.5, v1 = vt - 0.01, v0 = vt - (1 - LEAF_V0) * 0.5 + 0.01;
    const corners = [[-1, -1 + anchor, u0, v0], [1, -1 + anchor, u1, v0], [1, 1 + anchor, u1, v1], [-1, 1 + anchor, u0, v1]];
    const ids = [];
    const p = new V3();
    const wr = wind > 0 ? 0.5 + 0.5 * this.rnd() : 0;
    for (const q of corners) {
      p.copy(c).addScaledVector(ax, q[0]).addScaledVector(ay, q[1]);
      const n = nfn(p);
      const cc = typeof col === 'function' ? col(p) : col;
      ids.push(this.vert(p.x, p.y, p.z, n.x, n.y, n.z, q[2], q[3], cc[0], cc[1], cc[2], wr, gl));
    }
    this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  // a ribbon through points (centre line), widths and side vectors; the tile is stretched along it
  strip(pts, wid, side, nrm, tile, col, wind, fold = 0) {
    const u0 = (tile % 2) * 0.5 + 0.012, u1 = u0 + 0.476, um = (u0 + u1) / 2;
    const vt = 1 - (tile >> 1) * (1 - LEAF_V0) * 0.5, v1 = vt - 0.01, v0 = vt - (1 - LEAF_V0) * 0.5 + 0.01;
    const wr = wind > 0 ? 0.5 + 0.5 * this.rnd() : 0, n = pts.length, cols = fold ? 3 : 2, base = this.p.length / 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), v = lerp(v0, v1, t), cc = typeof col === 'function' ? col(t) : col, N = nrm[i];
      for (let k = 0; k < cols; k++) {
        const f = cols === 2 ? k * 2 - 1 : k - 1, p = pts[i].clone().addScaledVector(side[i], f * wid[i]);
        if (fold && k === 1) p.addScaledVector(N, fold * wid[i]);
        const nn = fold ? N.clone().addScaledVector(side[i], -f * 0.45).normalize() : N;
        this.vert(p.x, p.y, p.z, nn.x, nn.y, nn.z, cols === 2 ? (k ? u1 : u0) : [u0, um, u1][k], v, cc[0], cc[1], cc[2], wr);
      }
      if (i > 0) { const a0 = base + (i - 1) * cols, b0 = base + i * cols; for (let k = 0; k < cols - 1; k++) this.idx.push(a0 + k, a0 + k + 1, b0 + k, a0 + k + 1, b0 + k + 1, b0 + k); }
    }
  }
  // round membrane mapped onto a circular tile: droop > 0 makes a dome, < 0 a bowl
  fan(c, R, droop, tile, segs, rings, nfn, col, wind, gl, wob = 0, pw = 2) {
    const tu = (tile % 2) * 0.5 + 0.25, vt = 1 - (tile >> 1) * (1 - LEAF_V0) * 0.5, tv = vt - (1 - LEAF_V0) * 0.25;
    const ru = 0.232, rv = (1 - LEAF_V0) * 0.25 - 0.014;
    const wr = wind > 0 ? 0.5 + 0.5 * this.rnd() : 0, ph = this.rnd() * 6.28;
    const p = new V3();
    const put = (x, y, z, u, v) => { p.set(x, y, z); const n = nfn(p), cc = typeof col === 'function' ? col(p) : col; return this.vert(x, y, z, n.x, n.y, n.z, u, v, cc[0], cc[1], cc[2], wr, gl); };
    const centre = put(c.x, c.y, c.z, tu, tv);
    const first = centre + 1;
    for (let ring = 1; ring <= rings; ring++) for (let k = 0; k <= segs; k++) {
      const f = ring / rings, a = k / segs * 6.2832;
      const rr = R * f * (1 + wob * Math.sin(a * 3 + ph) * f);
      put(c.x + Math.cos(a) * rr, c.y - droop * Math.pow(f, pw) + wob * R * 0.5 * Math.sin(a * 5 + ph * 2) * f * f, c.z + Math.sin(a) * rr, tu + Math.cos(a) * ru * f, tv + Math.sin(a) * rv * f);
    }
    for (let k = 0; k < segs; k++) this.idx.push(centre, first + k, first + k + 1);
    for (let ring = 1; ring < rings; ring++) {
      const a0 = first + (ring - 1) * (segs + 1), b0 = a0 + segs + 1;
      for (let k = 0; k < segs; k++) this.idx.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.gl, 1));
    g.setAttribute('aSwap', new THREE.Float32BufferAttribute(this.sw, 1));
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
const domeNormal = (c, R) => { const cc = new V3(c.x, c.y - R, c.z); return (p) => new V3().subVectors(p, cc).normalize(); };
const UP = new V3(0, 1, 0);

// one arching blade: rises, then bows over in the direction it leans
function blade(G, r, base, az, L, W, lean, segs, tile, fold) {
  const dir = new V3(Math.cos(az), 0, Math.sin(az)), side = new V3(-dir.z, 0, dir.x);
  const pts = [], wid = [], sides = [], nrm = [];
  const p = base.clone(), twist = (r() - 0.5) * 0.8;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, th = lean * Math.pow(t, 1.5);
    const tan = new V3().addScaledVector(UP, Math.cos(th)).addScaledVector(dir, Math.sin(th));
    if (i > 0) p.addScaledVector(tan, L / segs);
    const sd = side.clone().applyAxisAngle(tan, twist * t).normalize();
    pts.push(p.clone()); wid.push(W * Math.pow(1 - t, 0.55) * (0.65 + 0.35 * Math.min(1, t * 6)) + 0.05); sides.push(sd);
    nrm.push(new V3().crossVectors(sd, tan).normalize().multiplyScalar(-1).add(new V3(0, 0.25, 0)).normalize());
  }
  G.strip(pts, wid, sides, nrm, tile, (t) => { const s = 0.5 + 0.55 * t; return [s, s, s]; }, 1, fold);
}
function buildGras(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const n = [9, 6, 4][lod], segs = [7, 4, 2][lod];
  for (let k = 0; k < n; k++) {
    const az = k / n * 6.2832 + r() * 0.8, off = r() * 2.6;
    const base = new V3(Math.cos(az) * off, -1, Math.sin(az) * off);
    const L = (k < 2 ? 190 : 110 + 90 * r()) * (lod === 2 && k === 0 ? 1.05 : 1), W = (2.2 + 1.5 * r()) * (lod === 2 ? 1.35 : 1);
    blade(G, r, base, az + (r() - 0.5) * 0.6, L, W, 0.35 + 1.25 * r() * r(), segs, (r() * 4) | 0, lod === 0 ? 0.35 : 0);
  }
  return G.build();
}
function buildKlee(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const nLeaf = [5, 4, 2][lod], stemCol = (i, n) => { const t = i / n; return [lerp(0.86, 0.62, t), lerp(0.62, 0.86, t), lerp(0.52, 0.42, t)]; };
  for (let k = 0; k < nLeaf; k++) {
    const az = k / nLeaf * 6.2832 + r() * 0.9, Ht = 48 + 52 * r(), lean = new V3(Math.cos(az) * 0.35, 1, Math.sin(az) * 0.35);
    const stem = branchPath(r, new V3(Math.cos(az) * 3, -1, Math.sin(az) * 3), lean, Ht, 0.95, 0.7, lod === 2 ? 2 : 4, 0.2, 0.15);
    G.tube(stem, [5, 4, 3][lod], stemCol, 0.05);
    const top = stem[stem.length - 1].p, R = (9 + 4 * r()) * (lod === 2 ? 1.12 : 1), rot = r() * 6.28;
    for (let q = 0; q < 3; q++) {
      const a = rot + q * 2.0944, d = new V3(Math.cos(a), 0.12 + 0.18 * r(), Math.sin(a)).normalize(), sd = new V3(-Math.sin(a), 0, Math.cos(a));
      const c = top.clone().addScaledVector(d, R * 0.98);
      const n = new V3().crossVectors(d, sd).normalize(); if (n.y < 0) n.negate();
      G.card(c, sd.clone().multiplyScalar(R * 0.95), d.clone().multiplyScalar(R), r() < 0.5 ? 0 : (r() < 0.5 ? 1 : 3), () => n, (p) => { const s = 0.78 + 0.3 * clamp(p.distanceTo(top) / R, 0, 1); return [s, s, s]; }, 1);
    }
  }
  if (lod < 2 && r() < 0.45) { // a white clover flower on a taller stalk, in summer
    const az = r() * 6.28, stem = branchPath(r, new V3(0, -1, 0), new V3(Math.cos(az) * 0.2, 1, Math.sin(az) * 0.2), 105 + 30 * r(), 0.9, 0.7, lod === 0 ? 4 : 2, 0.15, 0.1);
    G.tube(stem, 4, stemCol, 0.05);
    const top = stem[stem.length - 1].p.clone().add(new V3(0, 7, 0));
    G.swap = 2;
    for (let q = 0; q < 2; q++) { const a = q * 1.5708 + 0.4, ax = new V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(9); G.card(top, ax, new V3(0, 9, 0), 2, (p) => new V3().subVectors(p, top).normalize(), [1, 1, 1], 0.6); }
    G.card(top, new V3(9, 0, 0), new V3(0, 0, 9), 2, () => UP, [1.05, 1.05, 1.05], 0.6);
    G.swap = 0;
  }
  return G.build();
}
function rosette(G, r, n, len, tiles, flat) {
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.2832 + r() * 0.5, d = new V3(Math.cos(a), flat + 0.15 * r(), Math.sin(a)).normalize(), sd = new V3(-Math.sin(a), 0, Math.cos(a));
    const L = len * (0.7 + 0.5 * r()), nrm = new V3().crossVectors(d, sd).normalize(); if (nrm.y < 0) nrm.negate();
    G.card(new V3(0, -0.5, 0), sd.multiplyScalar(L * 0.28), d.clone().multiplyScalar(L * 0.5), pick(r, tiles), () => nrm, (p) => { const s = 0.7 + 0.35 * clamp(Math.hypot(p.x, p.z) / L, 0, 1); return [s, s, s]; }, 0.6, 1);
  }
}
function buildLoewe(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  rosette(G, r, [7, 5, 3][lod], 95, [2, 3], 0.12);
  const stem = branchPath(r, new V3(0, -1, 0), new V3(0.15, 1, 0.05), 210 + 60 * r(), 1.9, 1.5, lod === 2 ? 3 : 6, 0.12, 0.1);
  G.tube(stem, [6, 5, 3][lod], (i, n) => { const t = i / n; return [lerp(0.95, 0.72, t), lerp(0.68, 0.92, t), lerp(0.55, 0.5, t)]; }, 0.02);
  const top = stem[stem.length - 1].p, d = stem.dir;
  G.swap = 1; // the golden head, early in the year
  const hc = top.clone().addScaledVector(d, 3);
  G.fan(hc, 19, -5, 0, [16, 10, 7][lod], [2, 1, 1][lod], (p) => new V3().subVectors(p, top).normalize().add(d).normalize(), [1, 1, 1], 0.5, 0);
  G.swap = 2; // the clock, later
  const pc = top.clone().addScaledVector(d, 18), R = 27;
  for (let q = 0; q < (lod === 2 ? 2 : 3); q++) { const a = q * 1.0472 + 0.3, ax = new V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(R); G.card(pc, ax, new V3(0, R, 0), 1, (p) => new V3().subVectors(p, pc).normalize(), [1, 1, 1], 0.5); }
  G.card(pc, new V3(R, 0, 0), new V3(0, 0, R), 1, () => UP, [1, 1, 1], 0.5);
  G.swap = 0;
  return G.build();
}
function buildBlume(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  rosette(G, r, [6, 4, 3][lod], 26, [2, 3], 0.08);
  const nF = lod === 2 ? 1 : 2;
  for (let f = 0; f < nF; f++) {
    const az = r() * 6.28, stem = branchPath(r, new V3(Math.cos(az) * 3, -1, Math.sin(az) * 3), new V3(Math.cos(az) * 0.25, 1, Math.sin(az) * 0.25), (f ? 42 : 62) + 22 * r(), 0.75, 0.6, lod === 2 ? 2 : 4, 0.25, 0.1);
    G.tube(stem, [5, 4, 3][lod], [0.8, 0.95, 0.65], 0.04);
    const top = stem[stem.length - 1].p, d = stem.dir.clone().add(new V3(0, 1.2, 0)).normalize();
    G.fan(top.clone().addScaledVector(d, 1.2), 10 + 2 * r(), -1.2, r() < 0.7 ? 0 : 1, [14, 10, 7][lod], lod === 0 ? 2 : 1, () => d, [1, 1, 1], 0.6, 0);
    G.fan(top, 3.4, 1.5, 2, 8, 1, () => d.clone().negate(), [0.6, 0.75, 0.5], 0); // green bracts underneath
  }
  return G.build();
}
function buildPilz(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const set = [[0, 0, 6.2, 2.9, 0], [2.3, 0.9, 3.1, 1.5, 0], [-1.3, 1.9, 1.7, 0.9, 2]];
  const first = r() < 0.4 ? 2 : 0;
  for (let m = 0; m < (lod === 2 ? 2 : 3); m++) {
    const [x, z, h, R] = set[m], tile = m === 0 ? first : set[m][4];
    const lean = new V3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3);
    const stem = branchPath(r, new V3(x, -0.3, z), lean, h, R * 0.17, R * 0.12, lod === 2 ? 2 : 4, 0.12, 0.05);
    G.tube(stem, [8, 6, 4][lod], [0.98, 0.95, 0.88], 0.3);
    const e = stem[stem.length - 1].p, top = new V3(e.x, e.y + R * 0.38, e.z);
    const shade = (p) => { const s = 0.72 + 0.38 * clamp((p.y - top.y + R * 0.6) / (R * 0.6), 0, 1); return [s, s, s]; };
    G.fan(top, R, R * 0.6, tile, [14, 9, 6][lod], [4, 2, 2][lod], domeNormal(top, R * 0.9), shade, 0.3, 0, 0.02, 2.4);
    G.fan(new V3(e.x, e.y - R * 0.1, e.z), R * 0.95, -R * 0.07, tile + 1, [14, 9, 6][lod], 1, () => new V3(0, -1, 0), [0.8, 0.8, 0.8], 0.3, 0);
  }
  return G.build();
}
// three fallen leaves lying in a little heap, curled at the edges
function buildBlatt(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const nx = [5, 3, 2][lod], nz = [7, 4, 2][lod];
  for (let q = 0; q < (lod === 2 ? 2 : 3); q++) {
    const L = 85 * (0.7 + 0.5 * r()), W = L * 0.42, a = q * 2.1 + r(), ox = Math.cos(a) * 25 * q, oz = Math.sin(a) * 25 * q;
    const ca = Math.cos(a + 1.2), sa = Math.sin(a + 1.2), tile = (r() * 4) | 0, curl = 4 + 9 * r(), lift = r() * 8;
    const u0 = (tile % 2) * 0.5 + 0.012, u1 = u0 + 0.476, vt = 1 - (tile >> 1) * (1 - LEAF_V0) * 0.5, v1 = vt - 0.01, v0 = vt - (1 - LEAF_V0) * 0.5 + 0.01;
    const wr = 0.5 + 0.5 * r(), base = G.p.length / 3;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const s = i / nx * 2 - 1, t = j / nz, lx = s * W, lz = (t - 0.5) * L * 2 * 0.5 * 2;
      const y = curl * s * s + lift * t * t + q * 0.6 + 0.5;
      const x = ox + lx * ca - lz * sa, z = oz + lx * sa + lz * ca;
      const nxv = -2 * curl * s / W, n = new V3(-nxv * ca, 1, -nxv * sa).normalize();
      const sh = 0.75 + 0.25 * (1 - Math.abs(s));
      G.vert(x, y, z, n.x, n.y, n.z, lerp(u0, u1, i / nx), lerp(v0, v1, t), sh, sh, sh, wr);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a0 = base + j * (nx + 1) + i, b0 = a0 + nx + 1; G.idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
  }
  return G.build();
}
function buildZweig(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const main = branchPath(r, new V3(-190, 5.5, 0), new V3(1, 0.02, 0.05), 380, 5.5, 2.4, lod === 2 ? 3 : 7, 0.18, 0);
  G.tube(main, [9, 6, 4][lod], [1, 1, 1], 0.012);
  if (lod < 2) for (let k = 0; k < 3; k++) {
    const st = pathAt(main, 0.25 + 0.6 * r()), s = r() < 0.5 ? 1 : -1;
    const tw = branchPath(r, st, new V3(0.6, 0.25 * r(), s), 90 + 80 * r(), 2.2, 0.9, 3, 0.3, 0.05);
    G.tube(tw, [6, 4, 3][lod], [1, 1, 1], 0.012);
  }
  return G.build();
}

function buildRock(lod, seed) {
  const r = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, [2, 1, 0][lod]);
  const merged = mergeByPosition(g);
  const pos = merged.attributes.position, col = [], wnd = [], uv = [], gl = [], sw = [];
  const offs = [];
  for (let k = 0; k < 6; k++) offs.push([randDir(r), 0.25 + r() * 0.3]);
  const v = new V3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let d = 1;
    for (const [dir, amt] of offs) d -= Math.max(0, v.dot(dir) - 0.45) * amt * 1.2; // worn, rounded facets
    d += (Math.sin(v.x * 7.1 + v.y * 3.3) * Math.sin(v.z * 6.3 + v.x * 2.1)) * 0.04;
    v.multiplyScalar(d); v.y *= 0.62; v.y += 0.18;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  merged.computeVertexNormals();
  const nor = merged.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i), s = 0.8 + 0.2 * Math.sin(pos.getX(i) * 9 + pos.getZ(i) * 7);
    const moss = clamp((ny - 0.6) * 2.2, 0, 1) * 0.35;
    col.push(lerp(0.98 * s, 0.4, moss), lerp(0.96 * s, 0.55, moss), lerp(0.93 * s, 0.28, moss));
    wnd.push(0); gl.push(0); sw.push(0); uv.push((pos.getX(i) + pos.getZ(i)) * 0.35, 0.03 + 0.14 * (0.5 + 0.5 * Math.sin(pos.getY(i) * 3.0 + pos.getX(i))));
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  merged.setAttribute('aWind', new THREE.Float32BufferAttribute(wnd, 1));
  merged.setAttribute('aGlow', new THREE.Float32BufferAttribute(gl, 1));
  merged.setAttribute('aSwap', new THREE.Float32BufferAttribute(sw, 1));
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
export { Geo, buildBlatt, buildRock };

// ------------------------------------------------------------------ materials
const LEAF_VERT_PARS = '#include <common>\nattribute float aWind; attribute float aGlow; attribute float aSwap;\nuniform sampler2D uNoiseTex; uniform float uTime; uniform float uBend; uniform float uJit; uniform vec3 uWind; uniform float uTreeFar;\nuniform vec3 uTintA; uniform vec3 uTintB;\nvarying float vLeaf; varying vec3 vGlw; varying float vSwap;';
const leafVertMove = (fade) => /* glsl */`
        vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
        #else
          vec3 iPos = modelMatrix[3].xyz;
        #endif
        float ph = iPos.x * 0.013 + iPos.z * 0.017;
        float hgt = max(position.y, 0.0);
        float gust = texture2D(uNoiseTex, iPos.xz * 0.0006 + uTime * vec2(0.021, 0.013)).r;
        float sway = sin(uTime * 0.9 + ph) * 0.6 + 0.5 * sin(uTime * 2.1 + ph * 1.7 + position.y * 0.02) + (gust - 0.4) * 2.0;
        transformed.xz += uWind.xz * (sway * hgt * hgt * 0.0011 * uBend);
        transformed += aWind * uJit * vec3(sin(uTime * 3.1 + position.x * 0.27 + ph), 0.6 * sin(uTime * 2.3 + position.z * 0.31 + ph), sin(uTime * 2.7 + position.y * 0.29 + ph));
        ${fade ? 'float tf = 1.0 - smoothstep(uTreeFar * 0.86, uTreeFar, distance(iPos.xz, cameraPosition.xz)); transformed *= tf;' : ''}
        vLeaf = aWind; vSwap = aSwap;`;
export function foliageMaterial(tex, key, bend, trans, alphaTest = 0.42, glow = {}, jit = 0.4) {
  const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, alphaTest, alphaToCoverage: true });
  const un = {
    uBend: { value: bend }, uJit: { value: jit }, uTrans: { value: trans }, uTintA: { value: new THREE.Color(1, 1, 1) }, uTintB: { value: new THREE.Color(1, 1, 1) }, uDesat: { value: 0 }, uDrop: { value: 0 }, uSwap: { value: 0 },
    uGlowA: { value: new THREE.Color(...(glow.a || [0, 0, 0])) }, uGlowB: { value: new THREE.Color(...(glow.b || glow.a || [0, 0, 0])) },
    uGlowP: { value: new THREE.Vector4(glow.lo ?? 0.4, glow.hi ?? 0.75, glow.base ?? 0, glow.i ?? 0) }, uRim: { value: glow.rim || 0 },
  };
  m.userData.un = un;
  patch(m, glow.noFade ? 'foliageNF' : 'foliage', (s) => {
    Object.assign(s.uniforms, un);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', LEAF_VERT_PARS)
      .replace('#include <color_vertex>', /* glsl */`
        vColor = vec4(color, 1.0);
        vGlw = vec3(aGlow, 0.5, 0.0);
        #ifdef USE_INSTANCING_COLOR
          if (aWind > 0.001) vColor.rgb *= mix(uTintA, uTintB, instanceColor.r) * (0.88 + 0.24 * instanceColor.g);
          else vColor.rgb *= 0.9 + 0.2 * instanceColor.b;
          vGlw.y = instanceColor.r; vGlw.z = instanceColor.g * 40.0;
        #endif`)
      .replace('#include <begin_vertex>', leafVertMove(!glow.noFade));
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTrans; uniform float uDesat; uniform float uDrop; uniform float uSwap;\nuniform vec3 uGlowA; uniform vec3 uGlowB; uniform vec4 uGlowP; uniform float uRim;\nvarying float vLeaf; varying vec3 vGlw; varying float vSwap;\nvec3 fGlow = vec3(0.0);')
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        // early and late parts of a plant (golden head / seed clock) take turns through the year
        if (vSwap > 0.5) { float late = step(vGlw.y, uSwap); if (vSwap < 1.5 ? late > 0.5 : late < 0.5) discard; }
        {
          float lumT = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.5, 0.2));
          float gm = vLeaf > 0.001 ? max(smoothstep(uGlowP.x, uGlowP.y, lumT), uGlowP.z) : 1.0;
          fGlow = mix(uGlowA, uGlowB, vGlw.y) * (vGlw.x * gm * uGlowP.w * uGlow);
        }
        diffuseColor.rgb *= 0.86 + 0.3 * texture2D(uNoiseTex, vWPos.xz * 0.061 + vWPos.y * 0.037).r;
        if (vLeaf > 0.001) {
          if ((vLeaf - 0.5) * 2.0 < uDrop) discard;
          float lumL = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumL) * vec3(1.06, 0.98, 0.82), uDesat);
        }`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        totalEmissiveRadiance += fGlow;
        if (uDew > 0.01 && vLeaf > 0.001) { // morning dew: millimetre drops sparkling on the leaves
          float dn = texture2D(uNoiseTex, vWPos.xz * 0.53 + vWPos.y * 0.71).r * 0.6 + texture2D(uNoiseTex, vWPos.zy * 0.47 + vWPos.x * 0.23).g * 0.4;
          float drop = smoothstep(0.74, 0.79, dn);
          if (drop > 0.0) {
            vec3 Vv = normalize(vViewPosition), Rw = inverseTransformDirection(reflect(-Vv, normal), viewMatrix);
            float gl2 = pow(max(dot(Rw, uSunDirW), 0.0), 40.0);
            totalEmissiveRadiance += drop * uDew * (uSunCol * gl2 * 3.0 + skyLUT(vec3(Rw.x, abs(Rw.y), Rw.z)) * 0.35);
          }
        }`)
      .replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif
        {
          vec3 wnF = inverseTransformDirection(normal, viewMatrix);
          float snF = uSnow * smoothstep(0.25, 0.75, wnF.y + (texture2D(uNoiseTex, vWPos.xz * 0.35).r - 0.5) * 0.5) * 0.7;
          float frost = uSnow * 0.35 * smoothstep(0.4, 0.7, texture2D(uNoiseTex, vWPos.xz * 0.9 + vWPos.y * 0.8).g);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.97), max(snF, frost));
        }`)
      .replace('#include <lights_fragment_begin>', /* glsl */`#include <lights_fragment_begin>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 Lf = directionalLights[0].direction;
          float nl = dot(normal, Lf);
          float wrap = clamp((nl + 0.7) / 1.7, 0.0, 1.0) - clamp(nl, 0.0, 1.0);
          float back = pow(clamp(dot(-geometryViewDir, Lf), 0.0, 1.0), 3.0);
          reflectedLight.directDiffuse += gDirectCol * diffuseColor.rgb * RECIPROCAL_PI * (wrap * 0.6 + back * uTrans) * step(0.001, vLeaf);
          reflectedLight.indirectDiffuse += uRim * pow(1.0 - abs(dot(normal, geometryViewDir)), 3.0) * (uAmbCol * 1.3 + gDirectCol * 0.3);
        }
        #endif`);
  });
  const dm = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  dm.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, un); s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind; s.uniforms.uTreeFar = U.uTreeFar; s.uniforms.uNoiseTex = U.uNoiseTex;
    s.vertexShader = s.vertexShader.replace('#include <common>', LEAF_VERT_PARS).replace('#include <begin_vertex>', leafVertMove(false) + '\n vGlw = vec3(aGlow, 0.5, 0.0);\n#ifdef USE_INSTANCING_COLOR\n vGlw.y = instanceColor.r;\n#endif');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDrop; uniform float uSwap;\nvarying float vLeaf; varying vec3 vGlw; varying float vSwap;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nif (vLeaf > 0.001 && (vLeaf - 0.5) * 2.0 < uDrop) discard;\nif (vSwap > 0.5) { float late = step(vGlw.y, uSwap); if (vSwap < 1.5 ? late > 0.5 : late < 0.5) discard; }');
  };
  dm.customProgramCacheKey = () => 'foliageDepth';
  m.userData.depth = dm;
  return m;
}

// per-season look: [desat, tintA, tintB, drop, swap] for spring, summer, autumn, winter
const N1 = [1, 1, 1];
const SEASON_LOOK = {
  [SP.GRAS]: [[0, [0.95, 1.06, 0.85], [1.08, 1.12, 0.78], 0, 0], [0.12, [0.98, 1.0, 0.72], [1.2, 1.05, 0.6], 0, 0], [0.32, [1.0, 0.95, 0.68], [1.2, 1.0, 0.55], 0, 0], [0.55, [0.85, 0.9, 0.85], [0.95, 0.95, 0.85], 0, 0]],
  [SP.KLEE]: [[0, N1, [1.05, 1.1, 0.95], 0, 0.12], [0, [0.95, 1.0, 0.9], [1.05, 1.05, 0.9], 0, 0.7], [0.25, [1.0, 0.95, 0.8], [1.05, 0.95, 0.75], 0.15, 0.25], [0.5, [0.85, 0.9, 0.85], N1, 0.45, 0]],
  [SP.LOEWE]: [[0, N1, N1, 0, 0.1], [0, N1, [1.05, 1.05, 0.95], 0, 0.65], [0.35, [1.0, 0.95, 0.8], N1, 0.2, 0.95], [0.6, [0.8, 0.8, 0.7], N1, 1.05, 1]],
  [SP.BLUME]: [[0, N1, N1, 0, 0], [0, N1, N1, 0, 0], [0.2, N1, N1, 0.45, 0], [0.5, N1, N1, 1.05, 0]],
  [SP.PILZ]: [[0, N1, N1, 0, 0], [0, N1, N1, 0, 0], [0, [1.05, 1.0, 0.95], N1, 0, 0], [0.4, [0.9, 0.9, 0.95], N1, 0, 0]],
  [SP.BLATT]: [[0.55, [0.8, 0.7, 0.55], [0.75, 0.62, 0.48], 0.55, 0], [0.35, [0.85, 0.8, 0.55], [0.9, 0.75, 0.5], 0.72, 0], [0, [1.25, 0.72, 0.25], [1.2, 0.42, 0.18], 0, 0], [0.45, [0.72, 0.6, 0.48], [0.65, 0.52, 0.42], 0.25, 0]],
  [SP.ROCK]: [[0, N1, N1, 0, 0], [0, N1, N1, 0, 0], [0, N1, N1, 0, 0], [0, N1, N1, 0, 0]],
  [SP.ZWEIG]: [[0, N1, N1, 0, 0], [0, N1, N1, 0, 0], [0, N1, N1, 0, 0], [0, N1, N1, 0, 0]],
};

const SPEC = {
  [SP.GRAS]: { lod: [34, 110], cap: [5000, 40000, 90000], bend: 0.032, trans: 1.3, jit: 0.25, build: (l, v) => buildGras(l, 11 + v * 5) },
  [SP.KLEE]: { lod: [40, 140], cap: [1500, 8000, 20000], bend: 0.08, trans: 1.1, jit: 0.5, build: (l, v) => buildKlee(l, 21 + v) },
  [SP.LOEWE]: { lod: [50, 180], cap: [300, 2000, 6000], bend: 0.03, trans: 0.8, jit: 0.6, build: (l, v) => buildLoewe(l, 31 + v) },
  [SP.BLUME]: { lod: [40, 140], cap: [400, 2500, 6000], bend: 0.12, trans: 0.7, jit: 0.4, build: (l, v) => buildBlume(l, 41 + v) },
  [SP.PILZ]: { lod: [40, 160], cap: [300, 2000, 5000], bend: 0.0, trans: 0.4, jit: 0.0, build: (l, v) => buildPilz(l, 51 + v) },
  [SP.BLATT]: { lod: [40, 150], cap: [800, 5000, 12000], bend: 0.0, trans: 0.9, jit: 0.0, build: (l, v) => buildBlatt(l, 61 + v) },
  [SP.ROCK]: { lod: [40, 150], cap: [1500, 8000, 20000], bend: 0.0, trans: 0.0, jit: 0.0, build: (l, v) => buildRock(l, 71 + v) },
  [SP.ZWEIG]: { lod: [60, 220], cap: [200, 1000, 3000], bend: 0.0, trans: 0.0, jit: 0.0, build: (l, v) => buildZweig(l, 81 + v) },
};
const SOLID = (sp) => sp === SP.ROCK || sp === SP.ZWEIG;

function instanceTint(sp, t, out, i) {
  out[i] = t; out[i + 1] = (t * 7.13) % 1; out[i + 2] = (t * 13.7) % 1;
}

export class Flora {
  constructor(ctx) {
    this.ctx = ctx; this.scene = ctx.scene; this.jobs = ctx.jobs;
    const T = makeTextures();
    this.species = [];
    for (let sp = 0; sp < SP.COUNT; sp++) {
      const s = SPEC[sp];
      const mat = foliageMaterial(T[sp], 'f' + sp, s.bend, s.trans, SOLID(sp) ? 0 : 0.42, s.glow || {}, s.jit);
      if (SOLID(sp)) { mat.side = THREE.FrontSide; mat.alphaToCoverage = false; }
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
        const tilt = sp === SP.ROCK ? 0.8 : sp === SP.ZWEIG ? 0.25 : sp === SP.GRAS ? 0.3 : sp === SP.BLATT ? 0.2 : 0.08;
        this._e.set((t - 0.5) * tilt, rot, ((t * 13) % 1 - 0.5) * tilt);
        this._q.setFromEuler(this._e);
        const ys = sc * (0.9 + 0.25 * ((t * 31) % 1));
        this._s.set(sc, sp === SP.ROCK ? sc * (0.55 + 0.6 * ((t * 17) % 1)) : sp === SP.BLATT || sp === SP.ZWEIG ? sc : ys, sc);
        this._m.compose(this._p, this._q, this._s);
        this._m.toArray(mats, k * 16);
        instanceTint(sp, t, cols, k * 3);
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
      const far = new THREE.InstancedMesh(this.species[sp].geo[2], this.species[sp].mat, n);
      far.instanceMatrix.array.set(mats); far.instanceMatrix.needsUpdate = true;
      far.instanceColor = new THREE.InstancedBufferAttribute(cols, 3);
      far.boundingSphere = new THREE.Sphere(new V3(cx, (ymin + ymax) / 2 + 120, cz), VEG_CELL * 0.75 + (ymax - ymin) / 2 + 300);
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
      let de = 0, dr = 0, swp = 0; const a = [0, 0, 0], b = [0, 0, 0];
      for (let q = 0; q < 4; q++) { const w = ws[q]; de += L[q][0] * w; dr += L[q][3] * w; swp += L[q][4] * w; for (let c = 0; c < 3; c++) { a[c] += L[q][1][c] * w; b[c] += L[q][2][c] * w; } }
      un.uDesat.value = de; un.uDrop.value = dr; un.uSwap.value = swp; un.uTintA.value.setRGB(a[0], a[1], a[2]); un.uTintB.value.setRGB(b[0], b[1], b[2]);
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
          varying float vGTip;
          varying vec3 vGCol; varying vec3 vFlCol; varying vec2 vGUv;`)
        .replace('#include <beginnormal_vertex>', /* glsl */`
          float gt = position.y;
          vec3 gBase = aG0.xyz;
          float dCam = distance(gBase, cameraPosition);
          float gFade = 1.0 - smoothstep(uGrassR * 0.72, uGrassR, dCam);
          float isFl = step(0.5, aG1.z) * step(uSeason.w, 0.5) * step(uSeason.z, 0.6);
          float gH = (2.2 + 4.2 * aG1.x) * gFade * (1.0 + isFl * 0.6) * (1.0 - 0.4 * uSnow) * (0.7 + 0.6 * aG1.w);
          float gW = 3.4 * (0.7 + 0.6 * aG1.y);
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
          // moss cushions and seedlings: velvet green in the damp, olive where it dries
          vec3 gc = mix(vec3(0.16, 0.30, 0.05), vec3(0.28, 0.42, 0.08), gn1.r);
          gc = mix(gc, vec3(0.30, 0.34, 0.10), smoothstep(0.5, 0.95, gn1.g) * 0.6 * (1.0 - aG1.w));
          gc = mix(gc, gc * vec3(1.15, 1.0, 0.7), uSeason.y * 0.4);
          gc = mix(gc, vec3(0.32, 0.30, 0.10), uSeason.z * 0.35 * (1.0 - aG1.w));
          gc = mix(gc, vec3(0.24, 0.30, 0.20), uSeason.w * 0.5);
          vGCol = mix(gc * 0.55, gc * 1.25 + vec3(0.03, 0.04, 0.0), gt) * (0.85 + 0.3 * aG1.y);
          vGCol = mix(vGCol, vec3(0.86, 0.90, 0.96), uSnow * smoothstep(0.15, 0.7, gt) * 0.8);
          vGTip = gt * gFade;
          vFlCol = aG1.z < 1.5 ? vec3(0.35, 0.45, 0.95) : aG1.z < 2.5 ? vec3(1.0, 0.86, 0.15) : vec3(0.95, 0.5, 0.75);
          vGUv = vec2((position.x + 0.5) * 0.5 + 0.5 * isFl, position.y);`)
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uGrassTex;\nvarying vec3 vGCol; varying vec3 vFlCol; varying vec2 vGUv; varying float vGTip;\nvec3 gGlow = vec3(0.0);')
        .replace('#include <map_fragment>', /* glsl */`
          vec4 gtx = texture2D(uGrassTex, vGUv, -0.8);
          diffuseColor.rgb = mix(vGCol * (0.52 + 0.62 * gtx.r), vFlCol * (0.55 + 0.5 * gtx.r), gtx.g);
          diffuseColor.a = min(1.0, gtx.a * 1.5);
          {
            float trl = trailGlow(vWPos);
            gGlow = vec3(0.0);
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gGlow;')
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
      cell.job = this.jobs.run('grass', [i, j, Math.round(900 * Q.grassD)], () => Math.hypot(cx - cam.x, cz - cam.z) * 0.5);
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
