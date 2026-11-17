import * as THREE from 'three';
import { U, CAPS, installGlobalPatches } from './shaders.js';
import { makeNoiseTextures } from './textures.js';
import { createWorld, ORIGIN_STEP } from './world.js';
import { Sky } from './sky.js';
import { Jobs, Terrain, makeWaterMaterial } from './terrain.js';
import { Post } from './post.js';
import { Flora, Grass } from './flora.js';
import { Structures } from './structures.js';
import { Fauna, Particles, Birds, Giant } from './fauna.js';
import { Giants } from './giants.js';
import { Ambience } from './audio.js';
import { setupUI } from './ui.js';
import { clamp, lerp, smoothstep } from './noise.js';

const P = new URLSearchParams(location.search);
const num = (k, d) => (P.has(k) ? parseFloat(P.get(k)) : d);
let savedSeed = null;
try { savedSeed = parseInt(localStorage.getItem('kleewald-seed'), 10); } catch (e) { /* storage may be unavailable */ }
let seed = P.has('seed') ? (num('seed', 7) | 0) : (savedSeed > 0 ? savedSeed : 7);
const errEl = document.getElementById('err');
window.addEventListener('error', (e) => { errEl.textContent += (e.message || e) + '\n'; });

const QUALITY = {
  low: { dpr: 1, samples: 0, shadow: 1024, shadowRange: 110, refl: 0, grassR: 34, grassD: 0.5, treeR: 420, treeNear: 90 },
  med: { dpr: 1.25, samples: 4, shadow: 2048, shadowRange: 150, refl: 0.5, grassR: 52, grassD: 0.8, treeR: 580, treeNear: 120 },
  high: { dpr: 1.75, samples: 4, shadow: 4096, shadowRange: 190, refl: 0.6, grassR: 68, grassD: 1, treeR: 720, treeNear: 150 },
};
let qName = P.get('q') || (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'low' : 'high');
let Q = QUALITY[qName] || QUALITY.high;

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false }); }
catch (e) {
  document.getElementById('ui').innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font:16px system-ui;padding:2em">Diese Landschaft braucht WebGL 2.<br>Bitte in einem aktuellen Browser mit aktivierter Grafikbeschleunigung öffnen.</div>';
  throw e;
}
{
  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) CAPS.rtType = THREE.UnsignedByteType;
}
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;
installGlobalPatches();
const tex = makeNoiseTextures();
U.uNoiseTex.value = tex.noise; U.uDetailN.value = tex.detail;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8899aa, 1, 100000); // only enables the (replaced) fog chunks
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 60000);
camera.layers.enable(1);
const world = createWorld(seed);
const sky = new Sky(renderer, scene);
sky.time = num('t', 16.25);
const post = new Post(renderer, Q.samples); post.rtType = CAPS.rtType || null;

// reflection
const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: CAPS.rtType || THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
const reflCam = new THREE.PerspectiveCamera();
const waterMat = makeWaterMaterial(reflRT.texture);
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.12);

const jobs = new Jobs(__WORKER_SRC__, seed, clamp((navigator.hardwareConcurrency || 4) - 1, 2, 4));
const terrain = new Terrain(scene, jobs, { seg: 32, K: 1.45, waterMaterial: waterMat });

const ctx = { THREE, scene, camera, world, sky, jobs, terrain, renderer, Q: () => Q, U };
const systems = [];
const flora = new Flora(ctx); systems.push(flora); ctx.flora = flora;
const grass = new Grass(ctx); systems.push(grass);
const structures = new Structures(ctx); systems.push(structures); ctx.structures = structures;
const fauna = new Fauna(ctx); systems.push(fauna);
const particles = new Particles(ctx); systems.push(particles);
const birds = new Birds(ctx); systems.push(birds); window.__birds = birds; ctx.birds = birds;
const giant = new Giant(ctx); systems.push(giant); window.__giant = giant;
const giants = new Giants(ctx); systems.push(giants); window.__giants = giants;
/*__SYSTEMS__*/

// ------------------------------------------------------------------ player
const EYE = 3.2; // eye height in millimetres
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, mode: 'cine', flySpeed: 34, onGround: false, agl: 10 };
function findSpawn() {
  let best = null, bs = -1e9;
  for (let i = -7; i <= 7; i++) for (let j = -7; j <= 7; j++) {
    const s = world.siteAt(i, j);
    if (!s || s.type !== 0) continue;
    const score = Math.cos(s.rot) * 900 - Math.hypot(s.x - 1800, s.z + 1500) * 0.5 - Math.abs(s.h - 20) * 4;
    if (score > bs) { bs = score; best = s; }
  }
  return best;
}
let spawnSite = null;
function placeAtSpawn() {
  spawnSite = findSpawn();
  player.vel.set(0, 0, 0);
  if (spawnSite) {
    const s = spawnSite, dx = Math.sin(s.rot), dz = Math.cos(s.rot);
    player.pos.set(s.x + dx * 420 + dz * 90, 0, s.z + dz * 420 - dx * 90);
    player.pos.y = Math.max(world.height(player.pos.x, player.pos.z), 0) + 270;
    player.yaw = Math.atan2(player.pos.x - s.x, player.pos.z - s.z);
    player.pitch = -0.2;
  } else { player.pos.set(0, Math.max(world.height(0, 0), 0) + 60, 0); player.yaw = 0; player.pitch = -0.1; }
}
placeAtSpawn();
if (P.has('pos')) {
  const a = P.get('pos').split(',').map(Number);
  player.pos.set(a[0], a[1], a[2]); player.yaw = num('yaw', 0) * Math.PI / 180; player.pitch = num('pitch', 0) * Math.PI / 180;
}
if (P.has('mode')) player.mode = P.get('mode');
window.__set = (o) => { if (o.pos) player.pos.set(o.pos[0], o.pos[1], o.pos[2]); if (o.yaw !== undefined) player.yaw = o.yaw * Math.PI / 180; if (o.pitch !== undefined) player.pitch = o.pitch * Math.PI / 180; if (o.t !== undefined) sky.time = o.t; if (o.season !== undefined) { season.year = o.season; season.auto = false; } if (o.mode) player.mode = o.mode; if (o.ground !== undefined) player.pos.y = Math.max(groundAt(player.pos.x, player.pos.z), 0) + o.ground; player.vel.set(0, 0, 0); };
window.__world = world; window.__player = player; window.__sky = sky;

const keys = new Set();
const input = { lookX: 0, lookY: 0, moveX: 0, moveZ: 0, up: 0 };
function groundAt(x, z, y) { // y: height of whoever asks, so floating rocks only catch those above them
  let h = world.height(x, z);
  for (const s of systems) if (s.groundAt) h = Math.max(h, s.groundAt(x, z, h, y));
  return h;
}
ctx.groundAt = groundAt; ctx.player = player; ctx.keys = keys; ctx.input = input; ctx.systems = systems;

const season = { year: num('season', 0), auto: !P.has('season'), fast: false, names: ['Frühling', 'Sommer', 'Herbst', 'Winter'] };
ctx.season = season;
function updateSeason(dt) {
  if (season.fast) { const f0 = season.year % 1; season.year += dt * 0.22; if ((season.year % 1) < f0 || season.year % 1 < 0.02) { season.year = Math.round(season.year) % 4; season.fast = false; } }
  else if (season.auto) season.year += dt * timeSpeed / (960 * 0.8);
  season.year = ((season.year % 4) + 4) % 4;
  const i0 = Math.floor(season.year) % 4, f = season.year - Math.floor(season.year), t = smoothstep(0.7, 1.0, f);
  const w = [0, 0, 0, 0]; w[i0] = 1 - t; w[(i0 + 1) % 4] = t;
  U.uSeason.value.set(w[0], w[1], w[2], w[3]);
  U.uSnow.value = w[3];
  sky.declination = (6 * w[0] + 23 * w[1] - 5 * w[2] - 22 * w[3]) * Math.PI / 180;
  sky.cloudBias = 0.07 * w[3] - 0.03 * w[1];
  season.index = t > 0.5 ? (i0 + 1) % 4 : i0;
}
const cine = { heading: 0, alt: 30, t: 0, init: false };
const lookBuf = { x: 0, y: 0 };
const trail = { t: 0, i: 0, x: 1e9, z: 1e9 };

// ---- floating origin: when the traveller strays far from the local origin, slide the whole world back.
// Nothing is regenerated; meshes and bookkeeping are shifted by a multiple of ORIGIN_STEP in one frame.
function rebase(sx, sz) {
  const o = world.origin();
  world.setOrigin(o[0] + sx, o[1] + sz);
  jobs.reset({ type: 'origin', ox: o[0] + sx, oz: o[1] + sz });
  player.pos.x -= sx; player.pos.z -= sz;
  terrain.rebase(sx, sz);
  for (const s of systems) if (s.rebase) s.rebase(sx, sz);
  sky.cloudOff.x += sx * 0.00000045; sky.cloudOff.y += sz * 0.00000045;
  for (const v of U.uTrail.value) { v.x -= sx; v.z -= sz; }
}
let holdOrigin = false; // test hook: keep a forced origin
function checkRebase() {
  if (holdOrigin) return;
  const lim = ORIGIN_STEP * 0.65;
  if (Math.abs(player.pos.x) > lim || Math.abs(player.pos.z) > lim) {
    const sx = Math.round(player.pos.x / ORIGIN_STEP) * ORIGIN_STEP, sz = Math.round(player.pos.z / ORIGIN_STEP) * ORIGIN_STEP;
    if (sx !== 0 || sz !== 0) rebase(sx, sz);
  }
}
// ---- a brand-new world from another seed
function resetWorld(newSeed) {
  seed = newSeed | 0;
  Object.assign(world, createWorld(seed));
  jobs.reset({ type: 'init', seed });
  terrain.clear();
  for (const s of systems) if (s.clear) s.clear();
  placeAtSpawn();
  cine.init = false;
  if (player.mode === 'walk') player.pos.y = Math.max(groundAt(player.pos.x, player.pos.z) + EYE, 0.8);
  try { localStorage.setItem('kleewald-seed', String(seed)); } catch (e) { /* ignore */ }
}
let worldSwap = null;
const fadeEl = document.createElement('div');
fadeEl.style.cssText = 'position:fixed;inset:0;background:#0b0d12;opacity:0;transition:opacity .7s;pointer-events:none;z-index:4';
document.body.appendChild(fadeEl);
window.__rebase = rebase; window.__newWorld = resetWorld; window.__forceOrigin = (sx, sz) => { holdOrigin = true; rebase(sx, sz); }; window.__freeOrigin = () => { holdOrigin = false; };
function updatePlayer(dt) {
  const p = player;
  lookBuf.x += input.lookX; lookBuf.y += input.lookY;
  input.lookX = input.lookY = 0;
  { // a touch of smoothing makes looking around feel soft instead of twitchy
    const k = 1 - Math.exp(-dt * 26), ax = lookBuf.x * k, ay = lookBuf.y * k;
    lookBuf.x -= ax; lookBuf.y -= ay;
    if (p.mode !== 'cine') { p.yaw -= ax; p.pitch = clamp(p.pitch - ay, -1.5, 1.5); }
  }
  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + input.moveZ;
  const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + input.moveX;
  const u = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0) + input.up;
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const g = groundAt(p.pos.x, p.pos.z, p.pos.y);
  const floor = Math.max(g, 0);
  if (p.mode === 'fly') {
    const sp0 = p.flySpeed * (fast ? 4 : 1);
    const tx = (-sy * cp * f + cy * r) * sp0, ty = (sp * f + u) * sp0, tz = (-cy * cp * f - sy * r) * sp0;
    const k = 1 - Math.exp(-dt * 3.2);
    p.vel.x += (tx - p.vel.x) * k; p.vel.y += (ty - p.vel.y) * k; p.vel.z += (tz - p.vel.z) * k;
    p.pos.addScaledVector(p.vel, dt);
    const minY = Math.max(groundAt(p.pos.x, p.pos.z, p.pos.y), 0) + 1.2;
    if (p.pos.y < minY) { p.pos.y = minY; if (p.vel.y < 0) p.vel.y = 0; }
    p.pos.y = Math.min(p.pos.y, 3500);
  } else if (p.mode === 'walk') {
    const sp0 = fast ? 22 : 9;
    const swim = g < -0.9;
    const tx = (-sy * f + cy * r) * sp0 * (swim ? 0.6 : 1), tz = (-cy * f - sy * r) * sp0 * (swim ? 0.6 : 1);
    const k = 1 - Math.exp(-dt * (p.onGround ? 10 : 2));
    p.vel.x += (tx - p.vel.x) * k; p.vel.z += (tz - p.vel.z) * k;
    p.vel.y -= 26 * dt; // small and light: a jump clears twice your own height
    if (keys.has('Space') && p.onGround) { p.vel.y = 15; p.onGround = false; }
    p.pos.addScaledVector(p.vel, dt);
    const g2 = groundAt(p.pos.x, p.pos.z, p.pos.y + 0.4);
    const eye = Math.max(g2 + EYE, 0.8);
    if (p.pos.y <= eye) {
      // smooth step-up, snap down
      p.pos.y = p.pos.y < eye - 0.5 ? eye : lerp(p.pos.y, eye, 1 - Math.exp(-dt * 18));
      if (p.pos.y < eye - 0.02 && p.vel.y < 0) p.pos.y = Math.max(p.pos.y, eye - 0.25);
      p.vel.y = Math.max(p.vel.y, 0); p.onGround = true;
    } else if (p.pos.y - eye < 0.35 && p.vel.y <= 0) { p.pos.y = lerp(p.pos.y, eye, 1 - Math.exp(-dt * 14)); p.onGround = true; p.vel.y = 0; }
    else p.onGround = false;
  } else { // cinematic drift
    if (!cine.init) { cine.heading = p.yaw; cine.alt = p.pos.y; cine.init = true; }
    cine.t += dt;
    cine.heading += (Math.sin(cine.t * 0.05) * 0.035 + Math.sin(cine.t * 0.021 + 2) * 0.02) * dt * 2;
    const hx = -Math.sin(cine.heading), hz = -Math.cos(cine.heading);
    const speed = 16;
    p.pos.x += hx * speed * dt; p.pos.z += hz * speed * dt;
    let need = 0;
    for (const d of [0, 40, 100, 200, 320]) need = Math.max(need, Math.max(groundAt(p.pos.x + hx * d, p.pos.z + hz * d), 0) + 250 + d * 0.05);
    for (const s of world.sitesNear(p.pos.x - 60, p.pos.z - 60, p.pos.x + 60, p.pos.z + 60)) if (Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < s.r1 + 120) need = Math.max(need, s.h + 380);
    cine.alt += (need - cine.alt) * (1 - Math.exp(-dt * (need > cine.alt ? 0.9 : 0.25)));
    p.pos.y = Math.max(cine.alt, floor + 4);
    p.yaw = cine.heading + Math.sin(cine.t * 0.11) * 0.22;
    p.pitch = lerp(p.pitch, -0.16 + Math.sin(cine.t * 0.07) * 0.06, 1 - Math.exp(-dt));
    p.vel.set(hx * speed, 0, hz * speed);
  }
  p.agl = p.pos.y - floor;
  // leave a ripple of light where the traveller moves close to the ground
  trail.t -= dt;
  if (trail.t <= 0 && p.pos.y - Math.max(g, 0) < 7 && Math.hypot(p.pos.x - trail.x, p.pos.z - trail.z) > 2.2) {
    trail.t = 0.45; trail.x = p.pos.x; trail.z = p.pos.z;
    U.uTrail.value[trail.i].set(p.pos.x, Math.max(g, 0), p.pos.z, U.uTime.value);
    trail.i = (trail.i + 1) % 6;
  }
  camera.position.copy(p.pos);
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
  camera.near = clamp(0.12 + (p.agl - 3) * 0.01, 0.12, 2.5);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
ctx.setMode = (m) => {
  player.mode = m; cine.init = false;
  if (m === 'walk') { player.vel.set(0, 0, 0); player.pos.y = Math.max(groundAt(player.pos.x, player.pos.z, player.pos.y + 3) + EYE, 0.8); player.pitch = clamp(player.pitch, -0.6, 0.6); }
  if (m === 'fly') player.vel.multiplyScalar(0.3);
};

// ------------------------------------------------------------------ sizing
let renderScale = 1, vw = 0, vh = 0;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr) * renderScale;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  vw = Math.round(w * dpr); vh = Math.round(h * dpr);
  canvas.width = vw; canvas.height = vh;
  renderer.setViewport(0, 0, vw, vh);
  post.samples = Q.samples;
  post.setSize(vw, vh);
  if (Q.refl > 0) reflRT.setSize(Math.max(4, Math.round(vw * Q.refl)), Math.max(4, Math.round(vh * Q.refl)));
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
function applyQuality(name) {
  qName = name; Q = QUALITY[name];
  const sh = sky.sun.shadow;
  if (sh.mapSize.x !== Q.shadow) { sh.mapSize.set(Q.shadow, Q.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  sh.bias = -0.0005; sh.normalBias = 0.3; sh.radius = 1.6;
  post.main && post.main.dispose(); post.main = null;
  resize();
}
ctx.applyQuality = applyQuality; ctx.qName = () => qName;
const PERF_STEPS = [['high', 1], ['high', 0.8], ['med', 0.85], ['med', 0.7], ['low', 0.85], ['low', 0.65], ['low', 0.5]];
const perf = { step: 0, slow: 0, fastN: 0, ups: 0, ceil: 0 };
function applyPerf() { const [q, sc] = PERF_STEPS[perf.step]; renderScale = sc; applyQuality(q); }
perf.step = Math.max(0, PERF_STEPS.findIndex((x) => x[0] === qName)); perf.ceil = perf.step;
applyQuality(qName);
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ reflection pass
const _n = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _rm = new THREE.Matrix4();
function renderReflection() {
  _v.copy(camera.position); _v.y = -_v.y;
  _t.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position); _t.y = -_t.y;
  reflCam.position.copy(_v);
  reflCam.up.set(0, 1, 0).applyQuaternion(camera.quaternion).reflect(_n);
  reflCam.lookAt(_t);
  reflCam.near = camera.near; reflCam.far = camera.far; reflCam.fov = camera.fov; reflCam.aspect = camera.aspect;
  reflCam.updateProjectionMatrix(); reflCam.updateMatrixWorld();
  _rm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  _rm.multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
  waterMat.uniforms.uReflMatrix.value.copy(_rm);
  renderer.clippingPlanes = [clipPlane];
  renderer.setRenderTarget(reflRT);
  renderer.clear();
  renderer.render(scene, reflCam);
  renderer.clippingPlanes = [];
}

// ------------------------------------------------------------------ loop
const clock = { last: performance.now(), elapsed: 0, frame: 0 };
let timeSpeed = num('speed', 1); // 1 => 24h in 16 min
const fps = { acc: 0, n: 0, avg: 16, slow: 0 };
const ambience = new Ambience(ctx);
// a ring gate was crossed: it chimes and sends a ripple of light across the ground
ctx.say = (t, sec) => ui && ui.say(t, sec);
ctx.onStomp = (d) => ambience.stomp(d);
ctx.onGate = (g) => { ambience.chime(g.r / 2.3); const tv = U.uTrail.value[trail.i]; tv.set(g.x, g.y - g.r, g.z, U.uTime.value); trail.i = (trail.i + 1) % 6; };
let paused = P.has('freeze'), timeGoal = null;
function sunsetHour() { const c = clamp(-Math.tan(47 * Math.PI / 180) * Math.tan(sky.declination), -1, 1); return 12 + Math.acos(c) * 180 / Math.PI / 15; }
const timePreset = { morning: () => 24 - sunsetHour() + 0.75, noon: () => 12.6, evening: () => sunsetHour() - 0.85, night: () => 23.2 };
const timeOrder = ['evening', 'night', 'morning', 'noon']; let timeIdx = 0;
const qOrder = ['low', 'med', 'high'], qLabel = { low: 'niedrig', med: 'mittel', high: 'hoch' };
const ui = setupUI(ctx, {
  noUI: P.get('ui') === '0',
  setMode: ctx.setMode,
  audioStart: () => ambience.start(),
  setTime: (k) => { timeGoal = timePreset[k](); },
  cycleTime: () => { timeIdx = (timeIdx + 1) % 4; timeGoal = timePreset[timeOrder[timeIdx]](); ui.say({ evening: 'Abend', night: 'Nacht', morning: 'Morgen', noon: 'Mittag' }[timeOrder[timeIdx]]); },
  togglePause: () => (paused = !paused),
  nextSeason: () => { season.fast = true; season.auto = true; ui.say(season.names[(Math.floor(season.year) + 1) % 4]); },
  cycleQuality: () => { const n = qOrder[(qOrder.indexOf(qName) + 1) % 3]; renderScale = 1; perf.step = PERF_STEPS.findIndex((x) => x[0] === n); perf.ceil = perf.step; perf.ups = 3; applyQuality(n); return qLabel[n]; },
  toggleMute: () => { ambience.setMuted(!ambience.muted); return ambience.muted; },
  toggleMusic: () => { ambience.music = !ambience.music; return ambience.music; },
  newWorld: () => {
    if (worldSwap) return;
    worldSwap = { t: 0, seed: 1 + Math.floor(Math.random() * 99998), done: false };
    fadeEl.style.opacity = 1;
    ui.say('Neuer Garten · Nr. ' + worldSwap.seed, 7);
  },
});
const sunNDC = new THREE.Vector3(), sunUV = new THREE.Vector2();
// HUD: how high you are (in millimetres) and what lies nearby
const hudX = { t: 0, s: '' };
function hudExtra() {
  hudX.t -= 1;
  if (hudX.t > 0) return hudX.s;
  hudX.t = 20;
  const a = player.agl, h = a < 1000 ? Math.round(a) + ' mm' : (a / 1000).toFixed(2).replace('.', ',') + ' m';
  const f = structures.nearestFind(player.pos.x, player.pos.z, 160);
  hudX.s = (player.mode === 'walk' ? '' : h + ' über dem Boden') + (f ? (player.mode === 'walk' ? '' : ' · ') + 'in der Nähe: ' + f.what : '');
  return hudX.s;
}
ctx.time = { get speed() { return timeSpeed; }, set speed(v) { timeSpeed = v; } };

function frame(now) {
  requestAnimationFrame(frame);
  if (window.__pause) { clock.last = now; return; }
  let dt = Math.min(0.1, (now - clock.last) / 1000); clock.last = now;
  if (P.has('dt')) dt = num('dt', 0.016);
  clock.elapsed += dt; clock.frame++;
  U.uTime.value = clock.elapsed;

  updatePlayer(dt);
  checkRebase();
  if (worldSwap) {
    worldSwap.t += dt;
    if (!worldSwap.done && worldSwap.t > 0.8) { resetWorld(worldSwap.seed); worldSwap.done = true; worldSwap.t = 0; camera.position.copy(player.pos); }
    else if (worldSwap.done && ((worldSwap.t > 1.5 && jobs.busy < 10) || worldSwap.t > 9)) { fadeEl.style.opacity = 0; worldSwap = null; }
  }
  updateSeason(dt);
  if (timeGoal !== null) {
    const diff = ((timeGoal - sky.time) % 24 + 24) % 24;
    const st = Math.max(diff * dt * 2.2, dt * 1.5);
    if (diff <= st) { sky.time = timeGoal; timeGoal = null; } else sky.time = (sky.time + st) % 24;
  } else {
    const scrub = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    sky.time = (sky.time + (paused ? 0 : dt * timeSpeed * (24 / 960) * 1) + scrub * dt * 2.5 + 24) % 24;
  }
  U.uWind.value.set(1, 0, 0.6).multiplyScalar(0.75 + 0.45 * Math.sin(clock.elapsed * 0.13) * Math.sin(clock.elapsed * 0.047 + 2));
  ambience.update(dt);
  ui.update(dt, { time: sky.time, season: season.names[season.index || 0], loading: jobs.busy > 6, seed, extra: hudExtra() });
  sky.update(dt, clock.elapsed);
  terrain.update(camera.position);
  for (const s of systems) s.update && s.update(dt, clock.elapsed);

  // shadows follow the camera
  const fwd = _t.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const range = Q.shadowRange * clamp(1 + player.agl / 120, 1, 2.2);
  const focus = _v.copy(camera.position).addScaledVector(fwd, range * 0.55);
  focus.y = Math.min(focus.y, camera.position.y - player.agl * 0.7);
  sky.updateShadow(focus, range);
  renderer.shadowMap.needsUpdate = true;

  renderer.info.reset();
  const doRefl = Q.refl > 0 && camera.position.y < 900;
  waterMat.uniforms.uReflOn.value = doRefl ? 1 : 0;
  if (doRefl) { camera.layers.disable(1); reflCam.layers.mask = 1; renderReflection(); camera.layers.enable(1); }

  renderer.setRenderTarget(post.main);
  renderer.clear();
  renderer.render(scene, camera);

  // sun shafts
  sunNDC.copy(sky.sunDir).multiplyScalar(10000).add(camera.position).project(camera);
  const behind = _t.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(sky.sunDir) < 0.05;
  sunUV.set(sunNDC.x * 0.5 + 0.5, sunNDC.y * 0.5 + 0.5);
  const off = Math.max(Math.abs(sunNDC.x), Math.abs(sunNDC.y));
  const rays = behind ? 0 : (1 - smoothstep(1.0, 1.6, off)) * sky.sunUp * 0.42;
  // depth of field: strong close to the ground, fading as you rise above the lawn
  const aperture = num('dof', 1) * 9 * (1 - smoothstep(60, 900, player.agl) * 0.75);
  post.render({ exposure: sky.exposure * num('exp', 1), bloom: 0.2, rays, sunUV, time: clock.elapsed, near: camera.near, far: camera.far, aperture });

  if (window.__wantShot) { window.__shot = canvas.toDataURL('image/png'); window.__wantShot = false; window.__pause = true; }
  // adaptive quality: step down through presets/resolution when slow, cautiously step back up
  fps.acc += dt; fps.n++;
  if (fps.acc > 1.5) {
    fps.avg = fps.acc / fps.n * 1000; fps.acc = 0; fps.n = 0;
    if (!P.has('noadapt') && clock.elapsed > 5 && jobs.busy < 6 && !document.hidden) {
      if (fps.avg > 27 && perf.step < PERF_STEPS.length - 1) { perf.slow++; perf.fastN = 0; if (perf.slow >= 2) { perf.step++; perf.slow = 0; perf.ceil = Math.max(perf.ceil, perf.step - (perf.ups > 0 ? 0 : 1)); applyPerf(); } }
      else if (fps.avg < 17.5 && perf.step > perf.ceil && perf.ups < 3) { perf.fastN++; perf.slow = 0; if (perf.fastN >= 8) { perf.step--; perf.fastN = 0; perf.ups++; applyPerf(); } }
      else { perf.slow = 0; if (fps.avg > 18.5) perf.fastN = 0; }
    }
  }
  window.__stats = { fps: 1000 / fps.avg, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, busy: jobs.busy, chunks: terrain.visibleCount, scale: renderScale, q: qName, frame: clock.frame, pos: [player.pos.x | 0, player.pos.y | 0, player.pos.z | 0], origin: world.origin(), seed, site: spawnSite && [spawnSite.x | 0, spawnSite.h | 0, spawnSite.z | 0, +spawnSite.rot.toFixed(2)] };
}
requestAnimationFrame(frame);
