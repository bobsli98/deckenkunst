// Vegetation: procedural foliage textures, plant geometry (3 LODs each), instanced placement, grass.
// Every plant carries a per-vertex glow weight; after dark (or under the eclipse) those parts light up.
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
    for (let i = 0; i < 260; i++) { g.fillStyle = pick(r, colors); g.globalAlpha = 0.85; const x = r() * 512, y = r() * 128, w = 18 + r() * 40, h = 8 + r() * 16; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 6.3); g.fill(); g.strokeStyle = 'rgba(60,44,40,0.5)'; g.lineWidth = 1.3; g.stroke(); }
  } else { // smooth, softly streaked along the length
    for (let i = 0; i < 420; i++) { g.strokeStyle = pick(r, colors); g.globalAlpha = 0.25 + r() * 0.4; g.lineWidth = 1 + r() * 3; const y = r() * 128, x = r() * 512, l = 40 + r() * 200; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (r() - 0.5) * 4); g.stroke(); }
    if (kind === 'rings') for (let x = 0; x < 512; x += 32) { g.globalAlpha = 0.35; g.fillStyle = colors[colors.length - 1]; g.fillRect(x, 0, 3 + r() * 3, 128); }
  }
  g.globalAlpha = 1;
}
// a round membrane with forking veins (umbrella canopies, mushroom caps and gills)
function membrane(g, r, o) {
  const lobes = o.lobes || (11 + ((r() * 5) | 0)), ph = r() * 6.28, R = o.R || 117;
  g.beginPath();
  for (let i = 0; i <= 144; i++) {
    const a = i / 144 * 6.2832, rad = R * (1 - (o.scallop || 0.06) * (0.5 + 0.5 * Math.cos(a * lobes + ph)));
    const x = 128 + Math.cos(a) * rad, y = 128 + Math.sin(a) * rad;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath();
  const gr = g.createRadialGradient(128, 128, 5, 128, 128, R);
  gr.addColorStop(0, o.c[0]); gr.addColorStop(0.65, o.c[1]); gr.addColorStop(1, o.c[2]);
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  if (o.mottle) for (let i = 0; i < o.mottle; i++) { g.globalAlpha = 0.25; g.fillStyle = pick(r, o.c); g.beginPath(); g.arc(128 + (r() - 0.5) * 230, 128 + (r() - 0.5) * 230, 6 + r() * 16, 0, 6.3); g.fill(); }
  g.globalAlpha = 1; g.lineCap = 'round';
  if (o.vein) {
    const nv = o.veins || lobes;
    for (let i = 0; i < nv; i++) {
      const a = (i + 0.5) / nv * 6.2832 + ph / lobes + (r() - 0.5) * 0.08, fk = o.fork === 0 ? 1 : 0.5 + r() * 0.12;
      const mx = 128 + Math.cos(a) * R * fk, my = 128 + Math.sin(a) * R * fk;
      g.strokeStyle = o.vein; g.lineWidth = o.vw || 2.6; g.beginPath(); g.moveTo(128, 128); g.lineTo(mx, my); g.stroke();
      if (o.fork === 0) continue;
      for (const s of [-1, 1]) {
        const a2 = a + s * (3.1416 / nv) * 0.55, ex = 128 + Math.cos(a2) * R * 0.94, ey = 128 + Math.sin(a2) * R * 0.94;
        g.lineWidth = (o.vw || 2.6) * 0.62; g.beginPath(); g.moveTo(mx, my); g.lineTo(ex, ey); g.stroke();
        if (o.dot) { g.fillStyle = o.dot; g.beginPath(); g.arc(ex, ey, 3.2, 0, 6.3); g.fill(); }
      }
    }
    if (o.web) { g.strokeStyle = o.web; g.lineWidth = 1; for (const q of [0.3, 0.52, 0.74]) { g.beginPath(); g.arc(128, 128, R * q, 0, 6.3); g.stroke(); } }
  }
  if (o.spots) for (let i = 0; i < o.spots; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * R * 0.9; g.fillStyle = o.spot; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3 + r() * 7, 3 + r() * 6, r() * 3, 0, 6.3); g.fill(); }
  g.restore(); g.globalAlpha = 1;
}
// strands hanging from the top edge of the tile, with a bright bead at each end
function strands(g, r, o) {
  g.lineCap = 'round';
  for (let i = 0; i < o.n; i++) {
    const x0 = 14 + r() * 228, len = 70 + Math.pow(r(), 0.6) * 172, sway = (r() - 0.5) * 34;
    const x1 = x0 + sway, y1 = 6 + len;
    g.strokeStyle = pick(r, o.cols); g.lineWidth = o.w * (0.7 + r() * 0.6);
    g.beginPath(); g.moveTo(x0, 4); g.quadraticCurveTo(x0 + sway * 0.2, len * 0.55, x1, y1); g.stroke();
    if (o.leaf) for (let k = 2; k < 12; k++) {
      const t = k / 12, x = x0 + sway * t * t, y = 4 + len * t;
      g.strokeStyle = pick(r, o.cols); g.lineWidth = 2.2;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * (5 + r() * 5), y + 5 + r() * 4); g.stroke(); }
    }
    g.fillStyle = o.bead; g.beginPath(); g.arc(x1, y1, o.br * (0.7 + r() * 0.6), 0, 6.3); g.fill();
  }
}
function makeTextures() {
  const T = {};
  // umbrella trees: translucent mint canopies with pale veins; tile 2 is the fringe that hangs from the rim
  T[SP.SCHIRM] = foliageTexture([40, 150, 135], (g, r, t) => {
    if (t === 2) strands(g, r, { n: 20, cols: ['#2f9c8e', '#3fb3a0', '#58c9b3'], w: 1.8, bead: '#eafff7', br: 3.4 });
    else membrane(g, r, { c: ['#57c9ae', '#2c9c8e', '#1c7479'], vein: '#d6fff1', dot: '#f2fffa', web: 'rgba(190,255,235,0.35)', mottle: 26 });
  }, (g, r) => barkStrip(g, r, ['#cfc9d6', '#bdb6c8', '#ded9e4', '#a9a2b6'], 'rings'));

  // tassel trees: curtains of coral strands
  T[SP.QUASTE] = foliageTexture([225, 105, 120], (g, r) => {
    strands(g, r, { n: 26, cols: ['#c9475f', '#de6274', '#ee8590', '#b93a58'], w: 2.2, bead: '#fff3ee', br: 3.6, leaf: true });
  }, (g, r) => barkStrip(g, r, ['#5a4350', '#6a505e', '#4a3644'], 'smooth'));

  // glass coral: starburst polyps at the branch tips
  T[SP.KORALLE] = foliageTexture([215, 185, 235], (g, r) => {
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * 6.2832 + (r() - 0.5) * 0.2, l = 60 + r() * 56;
      g.strokeStyle = pick(r, ['#c8a8ec', '#dcc0f6', '#b693e0']); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * l, 128 + Math.sin(a) * l); g.stroke();
      g.fillStyle = '#fff4ff'; g.beginPath(); g.arc(128 + Math.cos(a) * l, 128 + Math.sin(a) * l, 4.2, 0, 6.3); g.fill();
    }
    g.fillStyle = '#f6e6ff'; g.beginPath(); g.arc(128, 128, 9, 0, 6.3); g.fill();
  }, (g, r) => barkStrip(g, r, ['#e6e0ee', '#d6cfe2', '#f2eef6'], 'smooth'));

  // giant mushrooms: tile 0/2 cap skin, tile 1/3 gills
  T[SP.PILZ] = foliageTexture([190, 90, 80], (g, r, t) => {
    if (t === 0) membrane(g, r, { c: ['#d9604c', '#c2463c', '#8f2f34'], scallop: 0.02, lobes: 9, spots: 46, spot: '#f6e6cc', mottle: 30 });
    else if (t === 2) membrane(g, r, { c: ['#9a6fd0', '#7a4fb4', '#51308a'], scallop: 0.02, lobes: 9, spots: 40, spot: '#efe2ff', mottle: 30 });
    else membrane(g, r, { c: ['#31505c', '#27424f', '#1c3340'], scallop: 0.01, lobes: 9, vein: '#cffaff', veins: 46, fork: 0, vw: 2.2 });
  }, (g, r) => barkStrip(g, r, ['#e9dfcf', '#d8ccb8', '#f3ecdf', '#c7b9a2'], 'smooth'));

  // lantern reeds: blade leaves; stalk and bulb are coloured per vertex
  T[SP.KOLBEN] = foliageTexture([40, 110, 100], (g, r) => {
    for (let s = 0; s < 7; s++) {
      const x0 = 128 + (r() - 0.5) * 60, lean = (r() - 0.5) * 150, len = 150 + r() * 90, w = 9 + r() * 6;
      const gr = g.createLinearGradient(0, 250, 0, 250 - len);
      gr.addColorStop(0, '#174a47'); gr.addColorStop(1, pick(r, ['#2f8a7c', '#3b9c88', '#25766e']));
      g.fillStyle = gr; g.beginPath(); g.moveTo(x0 - w / 2, 250);
      g.quadraticCurveTo(x0 + lean * 0.2 - w * 0.4, 250 - len * 0.6, x0 + lean, 250 - len);
      g.quadraticCurveTo(x0 + lean * 0.2 + w * 0.4, 250 - len * 0.6, x0 + w / 2, 250); g.fill();
    }
  }, (g, r) => barkStrip(g, r, ['#e4e4e0', '#d2d2cc', '#f0f0ec'], 'rings'));

  // lantern ferns: an arching frond with glowing capsules hanging beneath
  T[SP.FARN] = foliageTexture([50, 130, 120], (g, r) => {
    g.lineCap = 'round';
    const bend = (r() - 0.5) * 50;
    const P = (t) => [128 + bend * t * t, 250 - 232 * t];
    g.strokeStyle = '#1f5f5a'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 250); g.quadraticCurveTo(128, 130, P(1)[0], P(1)[1]); g.stroke();
    for (let i = 1; i < 19; i++) {
      const t = i / 19, [x, y] = P(t), l = (1 - Math.pow(Math.abs(t - 0.4) / 0.62, 2)) * 68 + 8;
      for (const s of [-1, 1]) {
        g.fillStyle = pick(r, ['#2a8076', '#37958a', '#48aa98', '#226c66']);
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * l * 0.5, y - 14, x + s * l, y - 3 + r() * 6); g.quadraticCurveTo(x + s * l * 0.5, y + 6, x, y + 5); g.fill();
      }
      if (i % 3 === 1 && t < 0.9) { const s = r() < 0.5 ? -1 : 1, cx = x + s * l * (0.4 + r() * 0.3), cy = y + 12 + r() * 8; g.strokeStyle = '#2a8076'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, cy); g.stroke(); g.fillStyle = '#fff2ff'; g.beginPath(); g.ellipse(cx, cy + 4, 4.6, 6.2, 0, 0, 6.3); g.fill(); }
    }
  }, (g, r) => barkStrip(g, r, ['#3d5a58', '#4b6a66'], 'smooth'));

  T[SP.ROCK] = foliageTexture([170, 160, 150], () => {}, (g, r) => barkStrip(g, r, ['#b8ab99', '#a59886', '#c8bca9', '#96897a', '#d2c7b6'], 'plates'));
  T[SP.CRYSTAL] = foliageTexture([220, 240, 250], () => {}, (g, r) => barkStrip(g, r, ['#dfeef4', '#c8e2ee', '#f2fafc', '#b4d6e6'], 'smooth'));
  return T;
}

// ------------------------------------------------------------------ geometry builder
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.gl = []; this.idx = []; this.cardSeed = 12345; }
  vert(x, y, z, nx, ny, nz, u, v, r, g, b, w, gl = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(r, g, b); this.w.push(w); this.gl.push(gl);
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
      const sh = dark * (0.75 + 0.25 * Math.min(1, path[i].p.y / 3));
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

// umbrella tree: a pale trunk carrying one large and several small translucent parasols
function buildSchirm(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const bark = [0.80, 0.76, 0.90];
  const trunk = branchPath(r, new V3(0, -0.4, 0), new V3(0.2, 1, 0.08), 10.6, 0.36, 0.13, lod === 2 ? 3 : 6, 0.2, 0.12);
  G.tube(trunk, [8, 5, 3][lod], bark, 0.25);
  const parasol = (c, R, big) => {
    const hs = 0.62 + 0.38 * clamp((c.y - 5) / 6, 0, 1);
    const shade = (p) => { const d = Math.hypot(p.x - c.x, p.z - c.z) / R, s = (0.6 + 0.5 * d) * hs; return [s, s, s]; };
    G.fan(c, R, R * 0.24, r() < 0.5 ? 0 : 3, [14, 9, 6][lod], [3, 2, 1][lod], domeNormal(c, R * 1.3), shade, 1, 1, 0.05);
    if (lod > 1 || (lod === 1 && !big)) return;
    const n = lod === 0 ? (big ? 10 : 6) : 5;
    for (let k = 0; k < n; k++) { // fringe hanging from the rim
      const a = (k + r() * 0.6) / n * 6.2832, rim = new V3(c.x + Math.cos(a) * R * 0.9, c.y - R * 0.2, c.z + Math.sin(a) * R * 0.9);
      const tan = new V3(-Math.sin(a), 0, Math.cos(a)), h = R * (0.32 + 0.2 * r());
      G.card(rim, tan.multiplyScalar(R * 0.3), new V3(0, h * 0.5, 0), 2, () => new V3(Math.cos(a) * 0.7, 0.7, Math.sin(a) * 0.7), [0.95, 0.95, 0.95], 1, -1, 1);
    }
  };
  const top = trunk[trunk.length - 1].p;
  parasol(new V3(top.x, top.y + 0.2, top.z), 4.5, true);
  const nB = [4, 3, 2][lod];
  for (let i = 0; i < nB; i++) {
    const st = pathAt(trunk, 0.42 + 0.42 * (i + r() * 0.5) / nB), az = i * 2.4 + r() * 0.9;
    const limb = branchPath(r, st, new V3(Math.cos(az), 0.35, Math.sin(az)), 2.6 + r() * 2.0, 0.11, 0.05, lod === 0 ? 4 : 2, 0.22, 0.7);
    G.tube(limb, [5, 4, 3][lod], bark, 0.25);
    const e = limb[limb.length - 1].p;
    parasol(new V3(e.x, e.y + 0.1, e.z), 1.7 + r() * 1.2, false);
  }
  return G.build();
}

// glass coral: forking translucent limbs, brightest at the tips
function buildKoralle(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const D = [4, 3, 2][lod];
  const c0 = [0.36, 0.26, 0.66], c1 = [1.0, 0.60, 0.86];
  const grow = (start, dir, len, rad, depth) => {
    const path = branchPath(r, start, dir, len, rad, rad * 0.7, lod === 0 ? 3 : 2, 0.26, 0.18);
    const t0 = depth / (D + 1), t1 = (depth + 1) / (D + 1);
    G.tube(path, Math.max(3, [6, 5, 3][lod] - (depth > 1 ? 1 : 0)), (i, n) => { const t = lerp(t0, t1, i / n); return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)]; }, 0.3, 1, (i, n) => { const t = lerp(t0, t1, i / n); return 0.12 + 0.88 * t * t; });
    const end = path[path.length - 1].p, d = path.dir;
    if (depth >= D) {
      const s = 0.42 + 0.2 * r() + (lod === 2 ? 0.5 : lod === 1 ? 0.2 : 0);
      const ax = new V3().crossVectors(d, randDir(r)).normalize(), ay = new V3().crossVectors(ax, d).normalize();
      G.card(end, ax.clone().multiplyScalar(s), ay.clone().multiplyScalar(s), (r() * 4) | 0, () => d, [1, 1, 1], 0.6, 0, 1);
      if (lod === 0) G.card(end, ax.multiplyScalar(s), d.clone().multiplyScalar(s), (r() * 4) | 0, () => ay, [1, 1, 1], 0.6, 0.7, 1);
      return;
    }
    const n = depth === 0 ? 3 : 2 + (lod === 0 && r() < 0.35 ? 1 : 0);
    const twist = r() * 6.28;
    for (let k = 0; k < n; k++) {
      const a = twist + k / n * 6.2832, side = new V3(Math.cos(a), 0.25 + 0.5 * r(), Math.sin(a));
      grow(end, d.clone().multiplyScalar(0.75).add(side.multiplyScalar(0.85)).normalize(), len * 0.72, rad * 0.68, depth + 1);
    }
  };
  grow(new V3(0, -0.4, 0), new V3(0.05, 1, 0.03), 2.7, 0.42, 0);
  return G.build();
}

// giant mushrooms: spotted caps, gills that glow from underneath
function buildPilz(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const set = [[0, 0, 6.2, 2.9, 0], [2.3, 0.9, 3.1, 1.5, 2], [-1.3, 1.9, 1.7, 0.9, 0]];
  for (let m = 0; m < (lod === 2 ? 2 : 3); m++) {
    const [x, z, h, R, tile] = set[m];
    const lean = new V3((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3);
    const stem = branchPath(r, new V3(x, -0.3, z), lean, h, R * 0.17, R * 0.085, lod === 2 ? 2 : 4, 0.12, 0.05);
    G.tube(stem, [8, 6, 4][lod], [0.98, 0.94, 0.86], 0.3, 1, (i, n) => 0.5 * Math.pow(i / n, 3));
    const e = stem[stem.length - 1].p, top = new V3(e.x, e.y + R * 0.38, e.z);
    const shade = (p) => { const s = 0.72 + 0.38 * clamp((p.y - top.y + R * 0.6) / (R * 0.6), 0, 1); return [s, s, s]; };
    G.fan(top, R, R * 0.6, tile, [14, 9, 6][lod], [4, 2, 2][lod], domeNormal(top, R * 0.9), shade, 0.3, 0, 0.02, 2.4);
    const gc = new V3(e.x, e.y - R * 0.1, e.z);
    G.fan(gc, R * 0.95, -R * 0.07, tile + 1, [14, 9, 6][lod], 1, () => new V3(0, -1, 0), [1, 1, 1], 0.3, 1);
  }
  return G.build();
}

// tassel tree: arching limbs hung with curtains of beaded strands
function buildQuaste(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const bark = [0.62, 0.48, 0.55];
  const trunk = branchPath(r, new V3(0, -0.4, 0), new V3(0.25, 1, -0.1), 5.6, 0.26, 0.12, lod === 2 ? 2 : 5, 0.3, 0.1);
  G.tube(trunk, [7, 5, 3][lod], bark, 0.3);
  const cc = new V3(0, 4.6, 0);
  const nfn = (p) => { const n = new V3().subVectors(p, cc); n.y = Math.abs(n.y) * 0.4 + 2.2; return n.normalize(); };
  const nP = [7, 5, 4][lod];
  for (let i = 0; i < nP; i++) {
    const az = (i + r() * 0.6) / nP * 6.2832, st = pathAt(trunk, 0.6 + 0.4 * r());
    const limb = branchPath(r, st, new V3(Math.cos(az), 0.75, Math.sin(az)), 3.0 + r() * 1.6, 0.085, 0.03, lod === 0 ? 5 : 3, 0.2, -0.95);
    G.tube(limb, [5, 4, 3][lod], bark, 0.3);
    const nC = [4, 2, 1][lod];
    for (let k = 0; k < nC; k++) {
      const d = new V3(), t = nC === 1 ? 0.7 : 0.38 + 0.62 * k / (nC - 1), p = pathAt(limb, t, d);
      d.y = 0; d.normalize();
      if (k % 2) d.applyAxisAngle(new V3(0, 1, 0), 1.2);
      const len = (lod === 2 ? 4.0 : 2.5 + r() * 1.5), wid = lod === 2 ? 1.9 : lod === 1 ? 1.5 : 1.05;
      const sh = 0.8 + 0.25 * r();
      G.card(new V3(p.x, p.y + 0.15, p.z), d.multiplyScalar(wid), new V3(0, len * 0.5, 0), (r() * 4) | 0, nfn, [sh, sh, sh], 1, -1, 1);
    }
  }
  return G.build();
}

// lantern reeds: thin stalks, each ending in an amber bulb
function buildKolben(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const nS = [3, 2, 1][lod], fat = [1, 1.35, 2.1][lod];
  const stalk = [0.15, 0.36, 0.34], bulb = [1.0, 0.74, 0.34];
  for (let c = 0; c < nS; c++) {
    const ox = c === 0 ? 0 : (r() - 0.5) * 1.9, oz = c === 0 ? 0 : (r() - 0.5) * 1.9;
    const Ht = 5.2 + r() * 2.6 - c * 0.8, lx = (r() - 0.5) * 0.9, lz = (r() - 0.5) * 0.9;
    const prof = lod === 2 ? [[0, 0.04], [0.76, 0.03], [0.82, 0.12], [0.94, 0.12], [1, 0.02]] : [[0, 0.045], [0.4, 0.036], [0.76, 0.028], [0.81, 0.10], [0.88, 0.13], [0.95, 0.10], [1, 0.015]];
    const path = prof.map(([t, rad]) => ({ p: new V3(ox + lx * t * t, -0.3 + Ht * t, oz + lz * t * t), r: rad * fat }));
    G.tube(path, [6, 5, 3][lod], (i) => (prof[i][0] > 0.78 ? bulb : stalk), 0.5, 1, (i) => (prof[i][0] > 0.78 ? 1 : 0));
    if (lod < 2) for (let k = 0; k < (lod === 0 ? 3 : 2); k++) {
      const a = r() * 6.2832, out = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-out.z, 0, out.x), h = 1.5 + r() * 1.3;
      G.card(new V3(ox, -0.2, oz), side.multiplyScalar(0.45), new V3(out.x * 0.35, h * 0.5, out.z * 0.35), (r() * 4) | 0, () => new V3(out.x * 0.5, 0.85, out.z * 0.5), [0.9, 0.9, 0.9], 1, 1, 0);
    }
  }
  return G.build();
}

// lantern fern: arching fronds around a centre
function buildFarn(lod, seed) {
  const r = mulberry32(seed), G = new Geo();
  const n = [10, 6, 4][lod];
  for (let k = 0; k < n; k++) {
    const a = (k + r() * 0.7) / n * 6.2832, el = 0.55 + r() * 0.5;
    const out = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-out.z, 0, out.x);
    const dir = new V3(out.x * Math.cos(el), Math.sin(el), out.z * Math.cos(el)), len = (lod === 2 ? 1.25 : 0.95) * (0.8 + 0.4 * r());
    G.card(new V3(0, 0.02, 0), side.multiplyScalar(len * 0.42), dir.multiplyScalar(len * 0.5), (r() * 4) | 0, () => new V3(out.x * 0.4, 0.9, out.z * 0.4).normalize(), (p) => { const q = 0.6 + 0.4 * clamp(p.y / 1.0, 0, 1); return [q, q, q]; }, 0.5, 1, 1);
  }
  return G.build();
}

function buildRock(lod, seed) {
  const r = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, [2, 1, 0][lod]);
  const merged = mergeByPosition(g);
  const pos = merged.attributes.position, col = [], wnd = [], uv = [], gl = [];
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
    const moss = clamp((ny - 0.45) * 2.2, 0, 1) * 0.7;
    col.push(lerp(0.98 * s, 0.16, moss), lerp(0.96 * s, 0.50, moss), lerp(0.93 * s, 0.44, moss));
    wnd.push(0); gl.push(moss * 0.25); uv.push((pos.getX(i) + pos.getZ(i)) * 0.35, 0.03 + 0.14 * (0.5 + 0.5 * Math.sin(pos.getY(i) * 3.0 + pos.getX(i))));
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  merged.setAttribute('aWind', new THREE.Float32BufferAttribute(wnd, 1));
  merged.setAttribute('aGlow', new THREE.Float32BufferAttribute(gl, 1));
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

// crystal cluster: faceted prisms leaning out of the ground, lit from within
export function crystalInto(G, r, count, sides, spread, size) {
  const list = [];
  for (let k = 0; k < 9; k++) {
    const a = r() * 6.2832, d = k === 0 ? 0 : (0.25 + 0.75 * r()) * spread, tilt = k === 0 ? 0.12 * r() : 0.2 + 0.5 * r();
    list.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, ax: new V3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)), L: size * (k === 0 ? 1 : 0.28 + 0.6 * r() * r()), tw: r() * 6.28 });
  }
  const cb = [0.20, 0.50, 0.58], ct = [0.80, 0.97, 1.0];
  for (let k = 0; k < count; k++) {
    const c = list[k], R = c.L * 0.105 + size * 0.012, tipL = R * 1.9;
    const up = c.ax, e1 = new V3().crossVectors(up, new V3(0.3, 0.1, 0.9)).normalize(), e2 = new V3().crossVectors(up, e1);
    const base = new V3(c.x, -0.4, c.z), mid = base.clone().addScaledVector(up, c.L - tipL), tip = base.clone().addScaledVector(up, c.L);
    const corner = (i, o) => { const a = c.tw + i / sides * 6.2832; return o.clone().addScaledVector(e1, Math.cos(a) * R).addScaledVector(e2, Math.sin(a) * R); };
    for (let i = 0; i < sides; i++) {
      const a0 = corner(i, base), a1 = corner(i + 1, base), b0 = corner(i, mid), b1 = corner(i + 1, mid);
      const fa = c.tw + (i + 0.5) / sides * 6.2832, n = new V3().addScaledVector(e1, Math.cos(fa)).addScaledVector(e2, Math.sin(fa));
      const sh = 0.78 + 0.3 * ((i * 0.37 + k * 0.21) % 1), u0 = i / sides, u1 = (i + 1) / sides;
      const v = (p, u, t, nn) => G.vert(p.x, p.y, p.z, nn.x, nn.y, nn.z, u * 0.8 + k * 0.13, 0.03 + 0.14 * t, lerp(cb[0], ct[0], t) * sh, lerp(cb[1], ct[1], t) * sh, lerp(cb[2], ct[2], t) * sh, 0, 0.3 + 0.7 * t);
      const i0 = v(a0, u0, 0, n), i1 = v(a1, u1, 0, n), i2 = v(b1, u1, 0.8, n), i3 = v(b0, u0, 0.8, n);
      G.idx.push(i0, i2, i1, i0, i3, i2);
      const nt = n.clone().multiplyScalar(0.8).addScaledVector(up, 0.6).normalize();
      const j0 = v(b0, u0, 0.8, nt), j1 = v(b1, u1, 0.8, nt), j2 = v(tip, (u0 + u1) / 2, 1, nt);
      G.idx.push(j0, j2, j1);
    }
  }
}
function buildCrystal(lod, seed) {
  const G = new Geo();
  crystalInto(G, mulberry32(seed), [7, 5, 3][lod], lod === 2 ? 4 : 6, 1.5, 4.6);
  return G.build();
}
export { Geo };

// ------------------------------------------------------------------ materials
const LEAF_VERT_PARS = '#include <common>\nattribute float aWind; attribute float aGlow;\nuniform float uTime; uniform float uBend; uniform vec3 uWind; uniform float uTreeFar;\nuniform vec3 uTintA; uniform vec3 uTintB;\nvarying float vLeaf; varying vec3 vGlw;';
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
export function foliageMaterial(tex, key, bend, trans, alphaTest = 0.42, glow = {}) {
  const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide, alphaTest, alphaToCoverage: true });
  const un = {
    uBend: { value: bend }, uTrans: { value: trans }, uTintA: { value: new THREE.Color(1, 1, 1) }, uTintB: { value: new THREE.Color(1, 1, 1) }, uDesat: { value: 0 }, uDrop: { value: 0 },
    uGlowA: { value: new THREE.Color(...(glow.a || [0, 0, 0])) }, uGlowB: { value: new THREE.Color(...(glow.b || glow.a || [0, 0, 0])) },
    uGlowP: { value: new THREE.Vector4(glow.lo ?? 0.4, glow.hi ?? 0.75, glow.base ?? 0, glow.i ?? 1) }, uRim: { value: glow.rim || 0 },
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
      .replace('#include <common>', '#include <common>\nuniform float uTrans; uniform float uDesat; uniform float uDrop;\nuniform vec3 uGlowA; uniform vec3 uGlowB; uniform vec4 uGlowP; uniform float uRim;\nvarying float vLeaf; varying vec3 vGlw;\nvec3 fGlow = vec3(0.0);')
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
        {
          float lumT = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.5, 0.2));
          float gm = vLeaf > 0.001 ? max(smoothstep(uGlowP.x, uGlowP.y, lumT), uGlowP.z) : 1.0;
          float pulse = 0.78 + 0.22 * sin(uTime * 0.7 + vGlw.z);
          float trl = trailGlow(vWPos);
          fGlow = mix(uGlowA, uGlowB, vGlw.y) * (vGlw.x * gm * uGlowP.w * pulse * (uGlow * (1.0 + trl) + trl * 0.25));
        }
        diffuseColor.rgb *= 0.84 + 0.34 * texture2D(uNoiseTex, vWPos.xz * 0.61 + vWPos.y * 0.37).r;
        if (vLeaf > 0.001) {
          if ((vLeaf - 0.5) * 2.0 < uDrop) discard;
          float lumL = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumL), uDesat);
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += fGlow;')
      .replace('#include <normal_fragment_begin>', /* glsl */`#include <normal_fragment_begin>
        #ifdef DOUBLE_SIDED
          normal *= faceDirection;
        #endif
        {
          vec3 wnF = inverseTransformDirection(normal, viewMatrix);
          float snF = uSnow * smoothstep(0.25, 0.75, wnF.y + (texture2D(uNoiseTex, vWPos.xz * 0.35).r - 0.5) * 0.5) * 0.7;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.93, 0.97), snF);
        }`)
      .replace('#include <lights_fragment_begin>', /* glsl */`#include <lights_fragment_begin>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 Lf = directionalLights[0].direction;
          float nl = dot(normal, Lf);
          float wrap = clamp((nl + 0.7) / 1.7, 0.0, 1.0) - clamp(nl, 0.0, 1.0);
          float back = pow(clamp(dot(-geometryViewDir, Lf), 0.0, 1.0), 3.0);
          reflectedLight.directDiffuse += gDirectCol * diffuseColor.rgb * RECIPROCAL_PI * (wrap * 0.6 + back * uTrans) * step(0.001, vLeaf);
          // glassy rim: facets catch the sky
          reflectedLight.indirectDiffuse += uRim * pow(1.0 - abs(dot(normal, geometryViewDir)), 3.0) * (uAmbCol * 1.3 + gDirectCol * 0.3);
        }
        #endif`);
  });
  // matching depth material so dropped leaves stop casting shadows
  const dm = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  dm.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, un); s.uniforms.uTime = U.uTime; s.uniforms.uWind = U.uWind; s.uniforms.uTreeFar = U.uTreeFar;
    s.vertexShader = s.vertexShader.replace('#include <common>', LEAF_VERT_PARS).replace('#include <begin_vertex>', leafVertMove(false) + '\n vGlw = vec3(aGlow);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDrop;\nvarying float vLeaf;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nif (vLeaf > 0.001 && (vLeaf - 0.5) * 2.0 < uDrop) discard;');
  };
  dm.customProgramCacheKey = () => 'foliageDepth';
  m.userData.depth = dm;
  return m;
}

// per-cycle look: [desat, tintA, tintB, drop] for bloom, ember, mist, frost
const N1 = [1, 1, 1];
const SEASON_LOOK = {
  [SP.SCHIRM]: [[0, [1.0, 1.0, 0.9], [0.62, 0.86, 1.45], 0], [1, [2.6, 1.35, 0.42], [2.5, 0.95, 0.45], 0], [0.6, [0.82, 1.0, 1.05], [0.75, 0.95, 1.1], 0], [0.55, [0.95, 1.15, 1.3], [0.9, 1.1, 1.35], 0]],
  [SP.KORALLE]: [[0, N1, N1, 0], [0.3, [1.2, 0.95, 0.8], [1.25, 0.9, 0.75], 0], [0.4, [0.9, 0.95, 1.0], [0.9, 0.95, 1.0], 0], [0.3, [0.95, 1.05, 1.15], [0.95, 1.05, 1.15], 0]],
  [SP.PILZ]: [[0, N1, [0.82, 0.9, 1.3], 0], [0, [1.12, 1.0, 0.8], [1.0, 0.9, 1.1], 0], [0.4, [0.9, 0.95, 1.0], [0.85, 0.9, 1.1], 0], [0.3, [0.95, 1.0, 1.1], [0.9, 0.95, 1.2], 0]],
  [SP.QUASTE]: [[0, N1, [1.0, 0.82, 1.15], 0], [0.5, [1.35, 0.9, 0.4], [1.3, 0.7, 0.35], 0], [0.55, [0.95, 0.9, 1.0], [0.9, 0.85, 1.05], 0.1], [0.5, [1.0, 1.0, 1.15], [0.95, 0.95, 1.2], 0.3]],
  [SP.KOLBEN]: [[0, N1, [0.9, 1.05, 1.1], 0], [0.8, [1.9, 1.3, 0.5], [1.8, 1.1, 0.5], 0], [0.5, [0.9, 1.0, 1.05], [0.85, 0.95, 1.05], 0], [0.5, [1.0, 1.15, 1.25], [0.95, 1.1, 1.25], 0]],
  [SP.FARN]: [[0, N1, [0.9, 1.05, 1.2], 0], [0.9, [2.2, 1.2, 0.45], [2.0, 0.9, 0.45], 0], [0.5, [0.9, 1.0, 1.05], [0.85, 0.95, 1.05], 0], [0.5, [1.0, 1.15, 1.25], [0.95, 1.1, 1.25], 0.2]],
  [SP.ROCK]: [[0, N1, N1, 0], [0, N1, N1, 0], [0, N1, N1, 0], [0, N1, N1, 0]],
  [SP.CRYSTAL]: [[0, N1, N1, 0], [0, N1, N1, 0], [0, N1, N1, 0], [0, N1, N1, 0]],
};

const SPEC = {
  [SP.SCHIRM]: { lod: [46, 175], cap: [300, 3000, 9000], bend: 0.7, trans: 1.5, glow: { a: [0.10, 1.0, 0.72], b: [0.14, 0.72, 1.0], lo: 0.36, hi: 0.72, base: 0.07, i: 1.5 }, build: (l, v) => buildSchirm(l, 11 + v * 5) },
  [SP.KORALLE]: { lod: [40, 160], cap: [300, 3000, 12000], bend: 0.25, trans: 0.6, glow: { a: [0.62, 0.30, 1.0], b: [1.0, 0.32, 0.72], lo: 0.5, hi: 0.85, base: 0.25, i: 1.25, rim: 0.5 }, build: (l, v) => buildKoralle(l, 21 + v) },
  [SP.PILZ]: { lod: [40, 160], cap: [300, 3000, 9000], bend: 0.15, trans: 0.5, glow: { a: [0.16, 0.90, 1.0], b: [0.55, 1.0, 0.5], lo: 0.3, hi: 0.7, base: 0.3, i: 1.9 }, build: (l, v) => buildPilz(l, 31 + v) },
  [SP.QUASTE]: { lod: [40, 160], cap: [300, 2500, 8000], bend: 1.2, trans: 1.2, glow: { a: [1.0, 0.28, 0.52], b: [1.0, 0.50, 0.28], lo: 0.55, hi: 0.85, base: 0.06, i: 2.0 }, build: (l, v) => buildQuaste(l, 41 + v) },
  [SP.KOLBEN]: { lod: [28, 90], cap: [1200, 9000, 30000], bend: 3.0, trans: 0.8, glow: { a: [1.0, 0.60, 0.14], b: [1.0, 0.80, 0.30], base: 1, i: 1.5 }, build: (l, v) => buildKolben(l, 51 + v) },
  [SP.FARN]: { lod: [30, 90], cap: [500, 3000, 6000], bend: 0.0, trans: 0.6, glow: { a: [1.0, 0.30, 0.90], b: [0.30, 0.92, 1.0], lo: 0.6, hi: 0.85, base: 0.03, i: 2.4 }, build: (l, v) => buildFarn(l, 61 + v) },
  [SP.ROCK]: { lod: [30, 110], cap: [300, 2000, 5000], bend: 0.0, trans: 0.0, glow: { a: [0.10, 0.90, 0.72], b: [0.70, 0.3, 0.95], i: 0.6 }, build: (l, v) => buildRock(l, 71 + v) },
  [SP.CRYSTAL]: { lod: [34, 130], cap: [300, 2000, 5000], bend: 0.0, trans: 0.0, glow: { a: [0.22, 0.90, 1.0], b: [0.72, 0.40, 1.0], i: 0.95, rim: 0.9 }, build: (l, v) => buildCrystal(l, 81 + v) },
};
const SOLID = (sp) => sp === SP.ROCK || sp === SP.CRYSTAL;

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
      const mat = foliageMaterial(T[sp], 'f' + sp, s.bend, s.trans, SOLID(sp) ? 0 : 0.42, s.glow);
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
          varying float vGTip;
          varying vec3 vGCol; varying vec3 vFlCol; varying vec2 vGUv;`)
        .replace('#include <beginnormal_vertex>', /* glsl */`
          float gt = position.y;
          vec3 gBase = aG0.xyz;
          float dCam = distance(gBase, cameraPosition);
          float gFade = 1.0 - smoothstep(uGrassR * 0.72, uGrassR, dCam);
          float isFl = step(0.5, aG1.z) * step(uSeason.w, 0.5);
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
          vec3 gc = mix(vec3(0.040, 0.175, 0.130), vec3(0.085, 0.250, 0.150), gn1.r);
          gc = mix(gc, vec3(0.19, 0.11, 0.25), smoothstep(0.55, 0.9, gn1.g) * 0.75);
          gc = mix(gc, mix(vec3(0.34, 0.17, 0.05), vec3(0.36, 0.10, 0.08), gn1.b), uSeason.y * 0.8);
          gc = mix(gc, dot(gc, vec3(0.3, 0.5, 0.2)) * vec3(0.85, 1.05, 1.1), uSeason.z * 0.45);
          gc = mix(gc, vec3(0.15, 0.21, 0.25), uSeason.w * 0.6);
          vGCol = mix(gc * 1.0, gc * 2.1 + vec3(0.06, 0.11, 0.10), gt * gt) * (0.85 + 0.3 * aG1.y);
          vGCol = mix(vGCol, vec3(0.80, 0.90, 0.95), uSnow * smoothstep(0.15, 0.7, gt) * 0.8);
          vGTip = gt * gFade;
          vFlCol = aG1.z < 1.5 ? vec3(0.45, 1.0, 0.88) : aG1.z < 2.5 ? vec3(1.0, 0.76, 0.36) : vec3(1.0, 0.45, 0.92);
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
            gGlow = vFlCol * gtx.g * uGlow * 1.5 + vec3(0.10, 0.92, 0.76) * vGTip * vGTip * (trl * (0.22 + 0.9 * uGlow) + uGlow * 0.035);
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
