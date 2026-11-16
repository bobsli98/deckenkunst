// Shared GLSL + global three.js shader-chunk patches (atmospheric fog, cloud shadows, foliage light capture).
import * as THREE from 'three';

export const CLOUD_H = 2600.0;
export const CAPS = { rtType: null };

// uniforms shared by every material in the scene
export const U = {
  uSkyLUT: { value: null },
  uNoiseTex: { value: null },
  uDetailN: { value: null },
  uFogP: { value: new THREE.Vector4(0.00011, 0.0012, 60, 0.75) }, // haze density, mist density, mist scale height, cloud shadow strength
  uSunDirW: { value: new THREE.Vector3(0, 1, 0) },   // direction towards the active light (sun or moon)
  uSunCol: { value: new THREE.Color(1, 1, 1) },      // active light colour * intensity (display units)
  uAmbCol: { value: new THREE.Color(0.3, 0.4, 0.5) },
  uCloudP: { value: new THREE.Vector4(0, 0, 0.5, 0) }, // wind offset xy, coverage, time
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector3(1, 0, 0.6) },      // xz dir * strength
  uNight: { value: 0 },                                // 0 day .. 1 night (lantern glow etc.)
  uTreeFar: { value: 600 },
  uSnow: { value: 0 },                                 // 0..1 winter snow cover
  uSeason: { value: new THREE.Vector4(1, 0, 0, 0) },   // weights of the four cycles: bloom, ember, mist, frost
  uGlow: { value: 0 },                                 // bioluminescence drive: night or eclipse
  uTrail: { value: [new THREE.Vector4(0, -999, 0, -99), new THREE.Vector4(0, -999, 0, -99), new THREE.Vector4(0, -999, 0, -99), new THREE.Vector4(0, -999, 0, -99), new THREE.Vector4(0, -999, 0, -99), new THREE.Vector4(0, -999, 0, -99)] }, // xyz pos, w birth time
};

export const GLSL_COMMON = /* glsl */`
uniform sampler2D uSkyLUT;
uniform sampler2D uNoiseTex;
uniform vec4 uFogP;
uniform vec3 uSunDirW;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;
uniform vec4 uCloudP;
uniform float uTime;
uniform float uNight;
uniform float uSnow;
uniform vec4 uSeason;
uniform float uGlow;
uniform vec4 uTrail[6];

vec3 skyLUT(vec3 d) {
  float el = asin(clamp(d.y, 0.0, 1.0));
  float v = sqrt(el / 1.5707963);
  float u = atan(d.z, d.x) / 6.2831853 + 0.5;
  return texture2D(uSkyLUT, vec2(u, v * 0.98 + 0.01)).rgb;
}
// light ripples left behind where the traveller brushes through glowing growth
float trailGlow(vec3 wp) {
  float g = 0.0;
  for (int i = 0; i < 6; i++) {
    float age = uTime - uTrail[i].w;
    if (age < 0.0 || age > 6.0) continue;
    vec3 dv = wp - uTrail[i].xyz;
    float d = length(dv.xz) + abs(dv.y) * 0.6;
    float r = 0.6 + age * 2.4;
    g += (exp(-pow((d - r) * 0.8, 2.0)) + 0.6 * exp(-d * d * 0.06)) * pow(1.0 - age / 6.0, 1.5);
  }
  return min(g, 2.0);
}
float cloudDensity(vec2 p) {
  vec2 q = p * 0.000045 + uCloudP.xy;
  float a = texture2D(uNoiseTex, q).r;
  float b = texture2D(uNoiseTex, q * 3.1 + vec2(0.31, 0.17) + uCloudP.xy * 0.6).g;
  float c = texture2D(uNoiseTex, q * 9.7 - uCloudP.xy * 0.9).b;
  float d = a * 0.58 + b * 0.30 + c * 0.12;
  float cov = uCloudP.z;
  return smoothstep(1.0 - cov, 1.0 - cov + 0.34, d);
}
float cloudShadow(vec3 wp) {
  float sy = max(uSunDirW.y, 0.08);
  vec2 p = wp.xz + uSunDirW.xz * ((${CLOUD_H.toFixed(1)} - wp.y) / sy);
  float d = cloudDensity(p);
  return 1.0 - uFogP.w * d * smoothstep(0.02, 0.25, uSunDirW.y);
}
float fogOD(float y0, float y1, float dist, float dens, float H) {
  float dy = (y1 - y0) / H;
  float e0 = exp(-max(y0, -20.0) / H);
  float f = abs(dy) > 0.001 ? (1.0 - exp(-dy)) / dy : 1.0;
  return dens * dist * e0 * f;
}
vec3 fogTransmit(vec3 camP, vec3 wp, out float mist) {
  float dist = length(wp - camP);
  float t1 = fogOD(camP.y, wp.y, dist, uFogP.x, 1900.0);
  float t2 = fogOD(camP.y, wp.y, dist, uFogP.y, uFogP.z);
  mist = t2;
  return exp(-t1 * vec3(0.70, 1.12, 1.30) - t2);
}
vec3 applyFog(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition;
  vec3 dir = normalize(v);
  float mist;
  vec3 tr = fogTransmit(cameraPosition, wp, mist);
  vec3 fd = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.55 + 0.035, dir.z));
  vec3 fogCol = skyLUT(fd);
  // soften + whiten for the low mist layer
  float lum = dot(fogCol, vec3(0.3, 0.5, 0.2));
  fogCol = mix(fogCol, vec3(lum) * vec3(0.95, 1.0, 1.06) + uAmbCol * 0.05, clamp(mist * 0.6, 0.0, 0.55));
  fogCol /= 1.0 + 0.45 * max(lum - 0.9, 0.0);
  return col * tr + fogCol * (1.0 - tr);
}
`;

export function installGlobalPatches() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying vec3 vWPos;
#endif
`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  {
    vec4 wpF = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wpF = instanceMatrix * wpF;
    #endif
    vWPos = (modelMatrix * wpF).xyz;
  }
#endif
`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  varying vec3 vWPos;
  ${GLSL_COMMON}
  vec3 gDirectCol = vec3(0.0);
#endif
`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vWPos);
#endif
`;
  // cloud shadows on the sun + capture of the shadowed sun colour for custom terms
  let lf = C.lights_fragment_begin;
  const k1 = 'getDirectionalLightInfo( directionalLight, directLight );';
  const idx = lf.indexOf(k1);
  if (idx < 0) throw new Error('three chunk mismatch (dir light)');
  let head = lf.slice(0, idx + k1.length), tail = lf.slice(idx + k1.length);
  head += '\n#ifdef USE_FOG\n directLight.color *= cloudShadow(vWPos);\n#endif\n';
  const k2 = 'RE_Direct( directLight';
  if (tail.indexOf(k2) < 0) throw new Error('three chunk mismatch (RE_Direct)');
  tail = tail.replace(k2, '\n#ifdef USE_FOG\n gDirectCol = directLight.color;\n#endif\n' + k2);
  C.lights_fragment_begin = head + tail;
}

// attach shared uniforms (and optional extra patching) to a built-in material
export function patch(mat, key, fn) {
  mat.onBeforeCompile = (shader) => {
    for (const k in U) shader.uniforms[k] = U[k];
    if (fn) fn(shader);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ------------------------------------------------------------------ sky LUT (single scattering atmosphere)
export const SKY_LUT_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uSun; uniform vec3 uMoon; uniform float uSunI; uniform float uMoonI; uniform float uTurb;
const float PI = 3.14159265;
const float Rg = 6360e3, Rt = 6460e3;
const vec3 bR = vec3(4.6e-6, 21.0e-6, 27.5e-6);
const vec3 MIE_TINT = vec3(1.0, 0.80, 0.66);
const vec3 bO = vec3(0.650e-6, 1.881e-6, 0.085e-6);
float sphereFar(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r;
  float d = b * b - c;
  return d < 0.0 ? -1.0 : -b + sqrt(d);
}
bool hitsGround(vec3 ro, vec3 rd) {
  float b = dot(ro, rd), c = dot(ro, ro) - Rg * Rg;
  float d = b * b - c;
  return d > 0.0 && (-b - sqrt(d)) > 0.0;
}
vec3 densities(vec3 p) {
  float h = max(length(p) - Rg, 0.0);
  return vec3(exp(-h / 8000.0), exp(-h / 1200.0), max(0.0, 1.0 - abs(h - 25000.0) / 15000.0));
}
vec3 scatter(vec3 rd, vec3 L, float bM) {
  vec3 ro = vec3(0.0, Rg + 200.0, 0.0);
  float tmax = sphereFar(ro, rd, Rt);
  const int N = 22;
  vec3 od = vec3(0.0);
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float tPrev = 0.0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 1.0) / float(N);
    float t = tmax * f * f;
    float dt = t - tPrev;
    vec3 p = ro + rd * (tPrev + dt * 0.5);
    tPrev = t;
    vec3 dn = densities(p) * dt;
    od += dn;
    if (hitsGround(p, L)) continue;
    float tl = sphereFar(p, L, Rt);
    vec3 odl = vec3(0.0);
    float dl = tl / 6.0;
    for (int j = 0; j < 6; j++) {
      odl += densities(p + L * (float(j) + 0.5) * dl) * dl;
    }
    vec3 tau = bR * (od.x + odl.x) + vec3(bM * 1.11) * (od.y + odl.y) + bO * (od.z + odl.z);
    vec3 att = exp(-tau);
    sumR += att * dn.x;
    sumM += att * dn.y;
  }
  float mu = dot(rd, L);
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = 0.78;
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  // crude multiple-scattering fill so the sky never goes fully black
  vec3 ms = sumR * bR * 0.045;
  return sumR * bR * pR + sumM * bM * pM * MIE_TINT + ms;
}
void main() {
  float el = vUv.y * vUv.y * 1.5707963;
  float az = (vUv.x - 0.5) * 6.2831853;
  vec3 rd = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  float bM = 3.996e-6 * uTurb;
  vec3 col = vec3(0.0);
  if (uSunI > 0.0) col += scatter(rd, uSun, bM) * uSunI;
  if (uMoonI > 0.0) col += scatter(rd, uMoon, bM) * uMoonI * vec3(0.42, 0.85, 1.15);
  // airglow / starlit night floor
  col += vec3(0.0010, 0.0022, 0.0030) * (1.0 + 1.5 * (1.0 - rd.y));
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SKY_DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_DOME_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
${GLSL_COMMON}
uniform vec3 uSunPos;
uniform vec3 uSunDisc; uniform float uStarI;
uniform mat3 uStarRot;
uniform vec3 uCloudLit; uniform vec3 uCloudDark;
uniform vec3 uPlanetPos; uniform vec3 uRingN; uniform vec3 uRingE; uniform float uPlanetI;
uniform vec3 uMoonA; uniform vec3 uMoonB; uniform float uMoonVis; uniform float uAurora; uniform float uEcl;
const float PR = 0.15;

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }

vec3 stars(vec3 d) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 90.0 : 190.0;
    vec3 p = d * sc;
    vec3 ip = floor(p), fp = fract(p);
    float h = hash13(ip + float(k) * 17.0);
    if (h < 0.16) {
      vec3 sp = vec3(hash13(ip + 1.7), hash13(ip + 5.3), hash13(ip + 9.1)) * 0.5 + 0.25;
      float dist = length(fp - sp);
      float b = pow(hash13(ip + 3.3), 5.0) * (k == 0 ? 3.0 : 1.0) + 0.06;
      float tw = 0.75 + 0.25 * sin(uTime * (2.0 + 5.0 * h * 8.0) + h * 100.0);
      float hc = hash13(ip + 7.7);
      vec3 tint = hc < 0.5 ? mix(vec3(0.75, 0.9, 1.0), vec3(1.0), hc * 2.0) : mix(vec3(1.0), vec3(1.0, 0.72, 0.62), hc * 2.0 - 1.0);
      acc += tint * b * tw * smoothstep(0.11, 0.0, dist);
    }
  }
  return acc;
}

float ringDens(float r) {
  if (r < 1.28 || r > 2.38) return 0.0;
  float n = texture2D(uNoiseTex, vec2(r * 0.83, 0.613)).r;
  float n2 = texture2D(uNoiseTex, vec2(r * 3.7, 0.271)).g;
  float dd = 0.3 + 0.7 * smoothstep(0.25, 0.75, n * 0.7 + n2 * 0.3);
  dd *= smoothstep(1.28, 1.40, r) * smoothstep(2.38, 2.27, r);
  dd *= 1.0 - 0.9 * smoothstep(0.04, 0.0, abs(r - 1.93));
  return dd;
}

// the ringed giant this moon circles: fixed in the sky, lit by the sun (so it shows phases through the day)
vec3 planetAndRings(vec3 d, vec3 S, out float cover) {
  cover = 0.0;
  vec3 C = uPlanetPos; float Rp = sin(PR);
  float cosd = dot(d, C);
  if (cosd < cos(PR * 2.6)) return vec3(0.0);
  vec3 rad = vec3(0.0);
  float disc = cosd * cosd - (1.0 - Rp * Rp);
  float tS = -1.0;
  if (disc > 0.0) {
    tS = cosd - sqrt(disc);
    vec3 n = normalize(d * tS - C);
    float lat = dot(n, uRingN);
    vec3 e2 = cross(uRingN, uRingE);
    float lon = atan(dot(n, uRingE), dot(n, e2)) / 6.2831853 + uTime * 0.0004;
    float turb = texture2D(uNoiseTex, vec2(lon * 2.0, lat * 0.9)).r - 0.5;
    float bands = texture2D(uNoiseTex, vec2(0.17 + turb * 0.03, lat * 0.62 + 0.5)).g;
    float bands2 = texture2D(uNoiseTex, vec2(0.71 + turb * 0.05, lat * 1.9 + 0.2)).r;
    float fine = texture2D(uNoiseTex, vec2(lon * 3.0 + turb * 0.15, lat * 2.6)).b;
    vec3 pc = mix(vec3(1.0, 0.86, 0.66), vec3(0.88, 0.47, 0.40), smoothstep(0.3, 0.7, bands * 0.65 + bands2 * 0.35));
    pc = mix(pc, vec3(0.46, 0.74, 0.78), smoothstep(0.5, 0.95, abs(lat)) * 0.85);
    pc *= 0.8 + 0.4 * fine;
    float ndv = max(dot(n, -d), 0.0);
    float lit = smoothstep(-0.10, 0.5, dot(n, S)) * (0.3 + 0.7 * pow(ndv, 0.55));
    float sn = dot(S, uRingN);
    if (abs(sn) > 0.001) {
      float ts = -lat * Rp / sn;
      if (ts > 0.0) lit *= 1.0 - 0.7 * ringDens(length(n * Rp + S * ts) / Rp);
    }
    float back = pow(max(dot(C, S), 0.0), 12.0);
    vec3 rim = vec3(1.0, 0.40, 0.16) * pow(1.0 - ndv, 6.0) * back * 9.0;
    float edge = smoothstep(0.0, 0.05, ndv);
    rad = (pc * lit * uPlanetI + rim) * edge;
    cover = edge;
  }
  float dn = dot(d, uRingN);
  if (abs(dn) > 1e-4) {
    float tR = dot(C, uRingN) / dn;
    if (tR > 0.0 && (tS < 0.0 || tR < tS)) {
      vec3 h = d * tR - C;
      float r = length(h) / Rp;
      float rd = ringDens(r);
      if (rd > 0.0) {
        float pr = dot(h, S);
        float sh = pr > 0.0 ? 1.0 : smoothstep(Rp * 0.93, Rp * 1.07, length(h - S * pr));
        vec3 rc = mix(vec3(1.0, 0.86, 0.74), vec3(0.70, 0.82, 0.90), texture2D(uNoiseTex, vec2(r * 1.9, 0.83)).b);
        float fs = 0.7 + 1.6 * pow(max(dot(d, S), 0.0), 5.0);
        rad = rad * (1.0 - rd * 0.85) + rc * rd * sh * fs * uPlanetI * 0.8;
        cover = max(cover, rd * 0.75);
      }
    }
  }
  return rad;
}

vec3 smallMoon(vec3 d, vec3 M, float MR, vec3 tint, vec3 S, float seed, inout float cover) {
  float mmu = dot(d, M);
  if (mmu < cos(MR * 1.05)) return vec3(0.0);
  vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), M)); vec3 my = cross(M, mx);
  vec2 q = vec2(dot(d, mx), dot(d, my)) / MR;
  float r2 = dot(q, q);
  if (r2 >= 1.0) return vec3(0.0);
  vec3 n = normalize(q.x * mx + q.y * my - sqrt(1.0 - r2) * M);
  float lit = smoothstep(-0.05, 0.25, dot(n, S));
  float maria = texture2D(uNoiseTex, q * 0.11 + seed).r * 0.6 + texture2D(uNoiseTex, q * 0.31 + seed).g * 0.4;
  float e = smoothstep(1.0, 0.88, r2) * smoothstep(-0.03, 0.05, M.y);
  cover = max(cover, e);
  return tint * (0.5 + 0.7 * smoothstep(0.35, 0.7, maria)) * (lit * 2.2 + 0.01) * e;
}

vec3 aurora(vec3 d) {
  if (d.y < 0.03) return vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    float fi = float(i) / 9.0;
    vec2 p = d.xz / d.y * (1.0 + fi * 0.5);
    float w = texture2D(uNoiseTex, vec2(p.x * 0.045 + uTime * 0.0016, 0.31)).r;
    float w2 = texture2D(uNoiseTex, vec2(p.x * 0.17 - uTime * 0.0021, 0.67)).g;
    float zc = -3.1 + (w - 0.5) * 3.6 + (w2 - 0.5) * 0.8;
    float band = exp(-pow((p.y - zc) * 3.0, 2.0));
    float rays = texture2D(uNoiseTex, vec2(p.x * 0.21 + uTime * 0.004, uTime * 0.003 + 0.4)).b;
    rays = 0.45 + 0.55 * smoothstep(0.3, 0.75, rays);
    vec3 c = mix(vec3(0.10, 1.0, 0.62), vec3(0.85, 0.22, 0.95), smoothstep(0.3, 1.0, fi));
    acc += c * band * rays * (1.0 - fi * 0.65);
  }
  return acc * smoothstep(0.03, 0.2, d.y) * (1.0 - smoothstep(0.5, 0.8, d.y)) * 0.075;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 dc = normalize(vec3(d.x, max(d.y, 0.0), d.z));
  vec3 col = skyLUT(dc);
  float below = clamp(-d.y * 3.0, 0.0, 1.0);

  float cover = 0.0;
  vec3 bodies = vec3(0.0);
  if (d.y > -0.05) {
    bodies = planetAndRings(d, uSunPos, cover);
    bodies += smallMoon(d, uMoonA, 0.021, vec3(0.86, 0.80, 1.0), uSunPos, 0.4, cover) * uMoonVis;
    bodies += smallMoon(d, uMoonB, 0.012, vec3(0.70, 1.0, 0.88), uSunPos, 0.9, cover) * uMoonVis;
    bodies *= smoothstep(-0.05, 0.03, d.y);
  }

  // stars + nebula
  if (uStarI > 0.001 && d.y > -0.02) {
    vec3 sd = uStarRot * d;
    float ext = smoothstep(-0.02, 0.3, d.y);
    vec3 st = stars(sd);
    vec3 axis = normalize(vec3(0.35, 0.3, 0.88));
    float band = exp(-pow(dot(sd, axis) * 2.6, 2.0));
    vec2 muv = vec2(atan(sd.z, sd.x) * 1.2, sd.y * 2.4);
    float mw = texture2D(uNoiseTex, muv * 0.35).r * texture2D(uNoiseTex, muv * 1.3 + 0.3).g;
    float hue = texture2D(uNoiseTex, muv * 0.21 + 0.6).b;
    vec3 nebc = mix(vec3(0.20, 0.75, 0.85), vec3(0.95, 0.30, 0.70), smoothstep(0.35, 0.65, hue));
    vec3 mwc = nebc * band * (0.012 + mw * mw * 0.75);
    col += (st * 1.7 + mwc * 0.42) * uStarI * ext * (1.0 - cover);
  }
  if (uAurora > 0.001) col += aurora(d) * uAurora * (1.0 - cover);
  col += bodies;
  if (uEcl > 0.001) { // corona around the eclipsed sun, and a violet dusk overhead
    float angP = acos(clamp(dot(d, uPlanetPos), -1.0, 1.0));
    float cor = exp(-max(angP - PR, 0.0) * 11.0) * (1.0 - cover);
    float str = 0.75 + 0.25 * sin(atan(dot(d, uRingE), dot(d, uRingN)) * 14.0 + 1.3);
    col += (vec3(1.0, 0.56, 0.30) * cor * str * 0.55 + vec3(0.035, 0.012, 0.07) * (1.0 - cover)) * uEcl;
  }

  // sun disc + aureole (the aureole survives an eclipse as a corona)
  float mu = dot(d, uSunPos);
  float disc = smoothstep(0.99993, 0.99996, mu);
  col += uSunDisc * ((disc * 90.0 + pow(max(mu, 0.0), 2500.0) * 6.0) * (1.0 - cover) + pow(max(mu, 0.0), 250.0) * 0.5 * (1.0 - cover * 0.92)) * (1.0 - below);

  // clouds
  if (d.y > 0.004) {
    float t = (${CLOUD_H.toFixed(1)} - cameraPosition.y) / d.y;
    vec3 cp = cameraPosition + d * t;
    float dens = cloudDensity(cp.xz);
    if (dens > 0.001) {
      float sy = max(uSunDirW.y, 0.12);
      float dl = cloudDensity(cp.xz + uSunDirW.xz / sy * 260.0);
      float dl2 = cloudDensity(cp.xz + uSunDirW.xz / sy * 700.0);
      float shade = exp(-(dl * 1.3 + dl2 * 0.9 + dens * 0.5));
      float fw = pow(max(dot(d, uSunDirW), 0.0), 6.0);
      vec3 cc = uCloudDark + uCloudLit * (shade * (1.0 + fw * 1.6));
      cc += uCloudLit * fw * (1.0 - dens) * 1.2;
      float mist;
      vec3 tr = fogTransmit(cameraPosition, cameraPosition + d * min(t, 60000.0), mist);
      float trm = dot(tr, vec3(0.333));
      float alpha = dens * smoothstep(0.004, 0.07, d.y) * (0.25 + 0.75 * trm);
      cc = cc * tr + skyLUT(normalize(vec3(d.x, 0.04, d.z))) * (1.0 - tr);
      col = mix(col, cc, clamp(alpha, 0.0, 1.0) * 0.9);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
