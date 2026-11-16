// Worker pool, quadtree terrain with LOD + skirts, terrain material, water.
import * as THREE from 'three';
import { U, patch, GLSL_COMMON } from './shaders.js';

// ------------------------------------------------------------------ worker pool
export class Jobs {
  constructor(src, seed, n) {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    this.workers = []; this.queue = []; this.nextId = 1; this.pending = new Map(); this.inFlight = 0;
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.busy = 0;
      w.onmessage = (e) => {
        const m = e.data, job = this.pending.get(m.id);
        this.pending.delete(m.id); w.busy--; this.inFlight--;
        if (job && !job.cancelled) job.resolve(m.result);
        this.pump();
      };
      w.postMessage({ type: 'init', seed });
      this.workers.push(w);
    }
  }
  run(type, args, prio) {
    const job = { id: this.nextId++, type, args, prio, cancelled: false };
    job.promise = new Promise((res) => { job.resolve = res; });
    this.queue.push(job);
    this.pump();
    return job;
  }
  get busy() { return this.inFlight + this.queue.length; }
  // drop everything queued or running and tell the workers about a new seed / origin
  reset(msg) {
    for (const j of this.queue) j.cancelled = true;
    this.queue.length = 0;
    for (const j of this.pending.values()) j.cancelled = true;
    for (const w of this.workers) w.postMessage(msg);
  }
  pump() {
    for (const w of this.workers) {
      while (w.busy < 1 && this.queue.length) {
        let bi = -1, bp = Infinity;
        for (let i = this.queue.length - 1; i >= 0; i--) {
          const j = this.queue[i];
          if (j.cancelled) { this.queue.splice(i, 1); if (bi > i) bi--; continue; }
          const p = typeof j.prio === 'function' ? j.prio() : j.prio;
          if (p < bp) { bp = p; bi = i; }
        }
        if (bi < 0) break;
        const job = this.queue.splice(bi, 1)[0];
        this.pending.set(job.id, job); w.busy++; this.inFlight++;
        w.postMessage({ id: job.id, type: job.type, args: job.args });
      }
    }
  }
}

// ------------------------------------------------------------------ materials
const TERRAIN_FRAG_PARS = /* glsl */`
uniform sampler2D uDetailN;
uniform float uTreeFar;
varying vec4 vAux;
varying vec3 vTN;
float tRough = 0.9;
vec3 tNrm = vec3(0.0);
`;
const TERRAIN_FRAG_COLOR = /* glsl */`
{
  vec3 tN = normalize(vTN);
  vec3 wp = vWPos;
  float h = wp.y;
  float dist = length(wp - cameraPosition);
  vec4 n1 = texture2D(uNoiseTex, wp.xz * 0.0031);
  vec4 n2 = texture2D(uNoiseTex, wp.xz * 0.027 + 0.37);
  vec4 n3 = texture2D(uNoiseTex, wp.xz * 0.23 + n1.xy * 0.2);
  vec4 n4 = texture2D(uNoiseTex, wp.xz * 1.9);
  float nearF = 1.0 - smoothstep(20.0, 90.0, dist);
  float slope = 1.0 - tN.y;
  float forest = vAux.x, sak = vAux.y, site = vAux.z, bam = vAux.w;

  vec3 grass = mix(vec3(0.080, 0.160, 0.030), vec3(0.150, 0.235, 0.045), n1.r);
  grass = mix(grass, vec3(0.22, 0.235, 0.075), smoothstep(0.5, 0.95, n1.g) * 0.5);
  grass = mix(grass, grass * vec3(0.8, 1.05, 0.7), uSeason.y * 0.6);
  grass = mix(grass, vec3(0.30, 0.235, 0.07) * (0.7 + 0.6 * n1.b), uSeason.z * 0.75);
  grass = mix(grass, vec3(0.26, 0.23, 0.13), uSeason.w * 0.8);
  grass *= 0.74 + 0.52 * n3.r;
  grass *= mix(1.0, 0.8 + 0.4 * n4.b, nearF);
  vec3 litter = mix(vec3(0.075, 0.062, 0.035), vec3(0.125, 0.095, 0.045), n3.g);
  vec3 ground = mix(grass, mix(grass * 0.6, litter, 0.6), smoothstep(0.25, 0.8, forest));
  ground = mix(ground, vec3(0.29, 0.24, 0.13) * (0.7 + 0.5 * n3.b), smoothstep(0.3, 0.8, bam) * 0.8);
  // fallen petals
  float pet = smoothstep(0.12, 0.6, sak);
  float speck = smoothstep(0.52, 0.80, n4.g * 0.6 + n3.a * 0.4);
  ground = mix(ground, vec3(0.78, 0.52, 0.60), pet * mix(0.22, speck * 0.75, nearF) * uSeason.x);
  // autumn leaf litter under the trees
  float lit = smoothstep(0.2, 0.7, forest) * uSeason.z;
  vec3 litC = mix(vec3(0.55, 0.20, 0.04), vec3(0.62, 0.42, 0.06), n3.b);
  ground = mix(ground, litC, lit * mix(0.3, smoothstep(0.5, 0.66, n4.g * 0.6 + n3.a * 0.4) * 0.9, nearF));

  float alp = smoothstep(430.0, 760.0, h + (n2.r - 0.5) * 160.0);
  vec3 scree = mix(vec3(0.20, 0.17, 0.145), vec3(0.27, 0.235, 0.20), n2.b) * (0.75 + 0.5 * n3.b);
  ground = mix(ground, mix(scree, vec3(0.19, 0.18, 0.09), 0.3 * n1.b), alp);

  float rockT = smoothstep(0.20, 0.34, slope + (n2.r - 0.5) * 0.10 + (n3.g - 0.5) * 0.06);
  vec3 rock = mix(vec3(0.17, 0.155, 0.14), vec3(0.31, 0.285, 0.25), n2.g);
  rock *= 0.72 + 0.5 * texture2D(uNoiseTex, vec2(h * 0.013 + n2.r * 0.25, (wp.x + wp.z) * 0.0021)).a;
  rock *= 0.75 + 0.5 * n3.b;
  rock = mix(rock, vec3(0.09, 0.13, 0.04), (1.0 - alp) * smoothstep(0.45, 0.8, n3.r) * 0.55);
  vec3 col = mix(ground, rock, rockT);

  float snow = smoothstep(900.0, 1080.0, h + (n2.g - 0.5) * 220.0 + (n1.b - 0.5) * 260.0) * (1.0 - smoothstep(0.40, 0.66, slope + (n3.r - 0.5) * 0.1));
  float wsnow = uSnow * smoothstep(0.52, 0.30, slope + (n3.r - 0.5) * 0.12) * smoothstep(0.25 , 0.9, h + n3.g * 0.6) * smoothstep(1.15 - uSnow * 1.1, 1.3 - uSnow * 1.1, n2.a * 0.5 + n3.b * 0.3 + 0.35);
  snow = max(snow, wsnow);
  col = mix(col, vec3(0.86, 0.90, 0.96), snow);

  float shore = 1.0 - smoothstep(0.45, 1.5, h + (n3.r - 0.5) * 0.6 + (n2.r - 0.5) * 0.5);
  vec3 sand = mix(vec3(0.40, 0.35, 0.26), vec3(0.27, 0.245, 0.20), n3.g);
  sand *= 0.8 + 0.4 * mix(0.5, n4.r, nearF);
  col = mix(col, sand, shore * (1.0 - rockT * 0.6));

  vec3 gravel = vec3(0.47, 0.43, 0.355) * (0.80 + 0.34 * mix(0.5, n4.r, nearF)) * (0.92 + 0.16 * n3.r);
  float siteT = smoothstep(0.3, 0.7, site);
  col = mix(col, mix(gravel, vec3(0.86, 0.90, 0.96), wsnow * 0.9), siteT);

  // beyond the tree draw distance, forests are painted onto the ground
  float canopy = smoothstep(uTreeFar * 0.72, uTreeFar, dist) * smoothstep(0.2, 0.6, forest + bam) * (1.0 - snow);
  vec3 cc = mix(vec3(0.028, 0.058, 0.018), vec3(0.060, 0.100, 0.028), n3.r);
  cc = mix(cc, vec3(0.15, 0.22, 0.05), clamp(bam * 1.3, 0.0, 1.0));
  float sakF = smoothstep(0.35, 0.65, sak * (0.55 + n3.g));
  vec3 decid = vec3(0.66, 0.45, 0.53) * uSeason.x + vec3(0.07, 0.125, 0.03) * uSeason.y + mix(vec3(0.55, 0.24, 0.04), vec3(0.45, 0.07, 0.03), n3.a) * uSeason.z + vec3(0.13, 0.11, 0.09) * uSeason.w;
  cc = mix(cc, decid * (0.75 + 0.5 * n3.b), sakF);
  cc = mix(cc, mix(vec3(0.5, 0.2, 0.04), vec3(0.5, 0.36, 0.05), n3.r), (1.0 - sakF) * uSeason.z * step(0.62, n3.a) * 0.8);
  cc = mix(cc, vec3(0.80, 0.84, 0.90), uSnow * (0.35 + 0.4 * n3.r));
  col = mix(col, cc, canopy);

  float wet = 1.0 - smoothstep(-0.1, 0.4, h + (n3.b - 0.5) * 0.2);
  col *= mix(1.0, 0.5, wet);
  float uw = smoothstep(0.0, -3.0, h);
  col = mix(col, col * vec3(0.45, 0.72, 0.66), uw);
  tRough = mix(0.93, 0.38, wet * (1.0 - uw));
  tRough = mix(tRough, 0.55, snow);

  vec2 dn1 = texture2D(uDetailN, wp.xz * 0.11).xy - 0.5;
  vec2 dn2 = texture2D(uDetailN, wp.xz * 0.9).xy - 0.5;
  vec2 dn3 = texture2D(uDetailN, wp.xz * 0.031).xy - 0.5;
  vec2 dn = dn1 * mix(0.45, 1.5, rockT) + dn2 * nearF * (0.35 + rockT) + dn3 * (0.5 + canopy * 3.0 + rockT);
  dn *= 1.0 - 0.85 * max(siteT, shore * 0.6);
  tNrm = vec3(dn.x, 0.0, dn.y) * 1.25;
  diffuseColor.rgb = col;
}
`;

export function makeTerrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  patch(m, 'terrain', (s) => {
    s.uniforms.uDetailN = U.uDetailN; s.uniforms.uTreeFar = U.uTreeFar;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aAux;\nvarying vec4 vAux;\nvarying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aAux; vTN = normal;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + TERRAIN_FRAG_PARS)
      .replace('#include <map_fragment>', TERRAIN_FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + mat3(viewMatrix) * tNrm);');
  });
  return m;
}

export function makeWaterMaterial(reflTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uReflTex: { value: reflTex }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 1 },
    },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      attribute float aDepth;
      varying float vDepth; varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz; vDepth = aDepth;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z -= 8e-7 * gl_Position.w;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying float vDepth; varying vec3 vWPos;
      ${GLSL_COMMON}
      uniform sampler2D uDetailN; uniform sampler2D uReflTex; uniform mat4 uReflMatrix; uniform float uReflOn;
      void main() {
        if (vDepth < 0.0) discard;
        vec3 Vv = cameraPosition - vWPos;
        float dist = length(Vv);
        vec3 V = Vv / dist;
        float t = uTime;
        vec2 uv = vWPos.xz;
        vec2 n = (texture2D(uDetailN, uv * 0.045 + t * vec2(0.010, 0.006)).xy - 0.5)
               + (texture2D(uDetailN, uv * 0.017 - t * vec2(0.004, 0.007)).xy - 0.5) * 1.2
               + (texture2D(uDetailN, uv * 0.19 + t * vec2(-0.022, 0.016)).xy - 0.5) * 0.6
               + (texture2D(uDetailN, uv * 0.0041 + t * vec2(0.0012, -0.0009)).xy - 0.5) * 0.8;
        float shallow = smoothstep(0.0, 1.2, vDepth);
        float amp = (0.10 + 0.22 * shallow) * (0.35 + 0.65 * exp(-dist * 0.0012));
        vec3 N = normalize(vec3(n.x * amp, 1.0, n.y * amp));
        float ndv = max(dot(N, V), 0.0);
        float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 refl = skyLUT(R);
        if (uReflOn > 0.5) {
          vec3 dp = vWPos + vec3(N.x, 0.0, N.z) * (0.6 + dist * 0.035);
          vec4 rc = uReflMatrix * vec4(dp, 1.0);
          vec2 ruv = clamp(rc.xy / rc.w, 0.001, 0.999);
          refl = texture2D(uReflTex, ruv).rgb;
        }
        float cs = cloudShadow(vWPos);
        vec3 light = uAmbCol + uSunCol * max(uSunDirW.y, 0.0) * cs;
        vec3 body = mix(vec3(0.030, 0.075, 0.060), vec3(0.008, 0.034, 0.042), smoothstep(0.0, 5.0, vDepth)) * light;
        float sp = pow(max(dot(R, uSunDirW), 0.0), 900.0) * 14.0 + pow(max(dot(R, uSunDirW), 0.0), 90.0) * 0.12;
        vec3 col = mix(body, refl, F) + uSunCol * sp * cs * (uReflOn > 0.5 ? 0.6 : 1.0);
        float a = 1.0 - exp(-vDepth * 1.6);
        float alpha = mix(a, 1.0, F);
        // a soft line of foam where the water meets the shore
        float fn = texture2D(uNoiseTex, uv * 0.21 + t * vec2(0.018, 0.011)).r + 0.22 * sin(t * 1.1 + uv.x * 0.6 + uv.y * 0.4);
        float foam = (1.0 - smoothstep(0.02, 0.38, vDepth)) * smoothstep(0.38, 0.8, fn);
        col = mix(col, light * 0.3, foam * 0.6);
        alpha = max(alpha, foam * 0.55) * smoothstep(0.0, 0.06, vDepth);
        col = applyFog(col, vWPos);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}

// ------------------------------------------------------------------ quadtree
const ROOT = 8000;
let SEG = 40;

function buildIndex(S) {
  const N = S + 1, idx = [];
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const grid = idx.slice();
  let w = N * N;
  const top = w, bottom = w + N, left = w + 2 * N, right = w + 3 * N;
  for (let i = 0; i < S; i++) { const A = i, B = i + 1, As = top + i, Bs = top + i + 1; idx.push(A, B, As, B, Bs, As); }
  for (let i = 0; i < S; i++) { const A = S * N + i, B = A + 1, As = bottom + i, Bs = bottom + i + 1; idx.push(A, As, B, B, As, Bs); }
  for (let j = 0; j < S; j++) { const A = j * N, B = A + N, As = left + j, Bs = left + j + 1; idx.push(A, As, B, B, As, Bs); }
  for (let j = 0; j < S; j++) { const A = j * N + S, B = A + N, As = right + j, Bs = right + j + 1; idx.push(A, B, As, B, Bs, As); }
  return { full: new THREE.BufferAttribute(new Uint16Array(idx), 1), grid: new THREE.BufferAttribute(new Uint16Array(grid), 1) };
}

class Node {
  constructor(x, z, size, level, parent) {
    this.x = x; this.z = z; this.size = size; this.level = level; this.parent = parent;
    this.children = null; this.state = 0; this.mesh = null; this.water = null; this.job = null;
    this.hmin = parent ? parent.hmin : -30; this.hmax = parent ? parent.hmax : 300; this.dead = false; this.d = 0;
  }
}

export class Terrain {
  constructor(scene, jobs, opts) {
    this.scene = scene; this.jobs = jobs;
    SEG = opts.seg || 40;
    this.minSize = opts.minSize || 62.5; this.K = opts.K || 1.55; this.range = opts.range || 2;
    this.index = buildIndex(SEG);
    this.material = makeTerrainMaterial();
    this.waterMaterial = opts.waterMaterial;
    this.roots = new Map();
    this.cam = new THREE.Vector3();
    const N = SEG + 1, up = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { up[(j * N + i) * 3] = i / SEG; up[(j * N + i) * 3 + 2] = j / SEG; }
    this.unitPos = new THREE.BufferAttribute(up, 3);
    this.visibleCount = 0; this.ready = false;
  }
  dist(n) {
    const c = this.cam;
    const dx = Math.max(n.x - c.x, 0, c.x - (n.x + n.size)), dz = Math.max(n.z - c.z, 0, c.z - (n.z + n.size));
    const dy = Math.max(n.hmin - c.y, 0, c.y - n.hmax);
    return Math.sqrt(dx * dx + dz * dz + dy * dy);
  }
  request(n) {
    if (n.state !== 0) return;
    n.state = 1;
    const prio = () => (n.level === 0 ? -1e7 : 0) + this.dist(n) - n.size * 0.5;
    n.job = this.jobs.run('chunk', [n.x, n.z, n.size, SEG], prio);
    n.job.promise.then((r) => this.onChunk(n, r));
  }
  onChunk(n, r) {
    if (n.dead) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
    g.setAttribute('aAux', new THREE.BufferAttribute(r.aux, 4));
    g.setIndex(this.index.full);
    n.hmin = r.hmin; n.hmax = r.hmax;
    const cx = n.x + n.size / 2, cz = n.z + n.size / 2, cy = (r.hmin + r.hmax) / 2;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.hypot(n.size * 0.71, (r.hmax - r.hmin) / 2 + 8));
    const m = new THREE.Mesh(g, this.material);
    m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = n.size <= 256; m.visible = false;
    this.scene.add(m); n.mesh = m;
    if (r.depth) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', this.unitPos);
      wg.setAttribute('aDepth', new THREE.BufferAttribute(r.depth, 1));
      wg.setIndex(this.index.grid);
      wg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.5, 0, 0.5), 0.75);
      const w = new THREE.Mesh(wg, this.waterMaterial);
      w.position.set(n.x, 0, n.z); w.scale.set(n.size, 1, n.size); w.updateMatrix(); w.matrixAutoUpdate = false;
      w.layers.set(1); w.visible = false; w.renderOrder = 10;
      this.scene.add(w); n.water = w;
    }
    n.state = 2;
  }
  dispose(n) {
    n.dead = true;
    if (n.job) n.job.cancelled = true;
    if (n.mesh) { this.scene.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh = null; }
    if (n.water) { this.scene.remove(n.water); n.water.geometry.dispose(); n.water = null; }
    if (n.children) { for (const c of n.children) this.dispose(c); n.children = null; }
  }
  show(n, v) {
    if (n.mesh) n.mesh.visible = v;
    if (n.water) n.water.visible = v;
    if (v) this.visibleCount++;
  }
  hideSubtree(n) {
    this.show(n, false);
    if (n.children) for (const c of n.children) this.hideSubtree(c);
  }
  visit(n) {
    const d = this.dist(n); n.d = d;
    const split = n.size > this.minSize && d < n.size * this.K * (n.children ? 1.12 : 1.0);
    if (split) {
      if (!n.children) {
        const h = n.size / 2;
        n.children = [new Node(n.x, n.z, h, n.level + 1, n), new Node(n.x + h, n.z, h, n.level + 1, n), new Node(n.x, n.z + h, h, n.level + 1, n), new Node(n.x + h, n.z + h, h, n.level + 1, n)];
      }
      let all = true;
      for (const c of n.children) { if (c.state !== 2) { all = false; this.request(c); } }
      if (all || n.state !== 2) {
        this.show(n, false);
        if (all) for (const c of n.children) this.visit(c);
        else { this.request(n); for (const c of n.children) this.hideSubtree(c); }
      } else {
        this.show(n, true);
        for (const c of n.children) this.hideSubtree(c);
      }
    } else {
      if (n.children) { for (const c of n.children) this.dispose(c); n.children = null; }
      if (n.state === 2) this.show(n, true); else this.request(n);
    }
  }
  clear() {
    for (const n of this.roots.values()) this.dispose(n);
    this.roots.clear();
  }
  // floating origin moved by (sx, sz): keep all finished chunks, just slide them
  rebase(sx, sz) {
    const shift = (n) => {
      n.x -= sx; n.z -= sz;
      if (n.state === 1) { if (n.job) n.job.cancelled = true; n.job = null; n.state = 0; }
      if (n.mesh) { n.mesh.position.x -= sx; n.mesh.position.z -= sz; n.mesh.updateMatrix(); }
      if (n.water) { n.water.position.x -= sx; n.water.position.z -= sz; n.water.updateMatrix(); }
      if (n.children) for (const c of n.children) shift(c);
    };
    const nr = new Map();
    for (const n of this.roots.values()) { shift(n); nr.set(Math.round(n.x / ROOT) + ':' + Math.round(n.z / ROOT), n); }
    this.roots = nr;
  }
  update(camPos) {
    this.cam.copy(camPos);
    const ci = Math.floor(camPos.x / ROOT), cj = Math.floor(camPos.z / ROOT);
    const want = new Set();
    for (let i = -this.range; i <= this.range; i++) for (let j = -this.range; j <= this.range; j++) {
      const k = (ci + i) + ':' + (cj + j);
      want.add(k);
      if (!this.roots.has(k)) this.roots.set(k, new Node((ci + i) * ROOT, (cj + j) * ROOT, ROOT, 0, null));
    }
    for (const [k, n] of this.roots) if (!want.has(k)) { this.dispose(n); this.roots.delete(k); }
    this.visibleCount = 0;
    for (const n of this.roots.values()) this.visit(n);
  }
}
