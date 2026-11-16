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
  uSeason: { value: new THREE.Vector4(1, 0, 0, 0) },   // weights: spring, summer, autumn, winter
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

vec3 skyLUT(vec3 d) {
  float el = asin(clamp(d.y, 0.0, 1.0));
  float v = sqrt(el / 1.5707963);
  float u = atan(d.z, d.x) / 6.2831853 + 0.5;
  return texture2D(uSkyLUT, vec2(u, v * 0.98 + 0.01)).rgb;
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
  return exp(-t1 * vec3(0.72, 0.95, 1.38) - t2);
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
const vec3 bR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
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
  return sumR * bR * pR + sumM * bM * pM + ms;
}
void main() {
  float el = vUv.y * vUv.y * 1.5707963;
  float az = (vUv.x - 0.5) * 6.2831853;
  vec3 rd = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  float bM = 3.996e-6 * uTurb;
  vec3 col = vec3(0.0);
  if (uSunI > 0.0) col += scatter(rd, uSun, bM) * uSunI;
  if (uMoonI > 0.0) col += scatter(rd, uMoon, bM) * uMoonI * vec3(0.8, 0.9, 1.15);
  // airglow / starlit night floor
  col += vec3(0.0011, 0.0016, 0.0032) * (1.0 + 1.5 * (1.0 - rd.y));
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
uniform vec3 uSunPos; uniform vec3 uMoonPos;
uniform vec3 uSunDisc; uniform float uMoonVis; uniform float uStarI;
uniform mat3 uStarRot;
uniform vec3 uCloudLit; uniform vec3 uCloudDark;

float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }

float stars(vec3 d) {
  float acc = 0.0;
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 90.0 : 190.0;
    vec3 p = d * sc;
    vec3 ip = floor(p), fp = fract(p);
    float h = hash13(ip + float(k) * 17.0);
    if (h < 0.12) {
      vec3 sp = vec3(hash13(ip + 1.7), hash13(ip + 5.3), hash13(ip + 9.1)) * 0.5 + 0.25;
      float dist = length(fp - sp);
      float b = pow(hash13(ip + 3.3), 5.0) * (k == 0 ? 3.0 : 1.0) + 0.06;
      float tw = 0.75 + 0.25 * sin(uTime * (2.0 + 5.0 * h * 8.0) + h * 100.0);
      acc += b * tw * smoothstep(0.11, 0.0, dist);
    }
  }
  return acc;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 dc = normalize(vec3(d.x, max(d.y, 0.0), d.z));
  vec3 col = skyLUT(dc);
  float below = clamp(-d.y * 3.0, 0.0, 1.0);

  // stars + milky way
  if (uStarI > 0.001 && d.y > -0.02) {
    vec3 sd = uStarRot * d;
    float ext = smoothstep(-0.02, 0.3, d.y);
    float st = stars(sd);
    vec3 axis = normalize(vec3(0.35, 0.3, 0.88));
    float band = exp(-pow(dot(sd, axis) * 3.2, 2.0));
    vec2 muv = vec2(atan(sd.z, sd.x) * 1.2, sd.y * 2.4);
    float mw = texture2D(uNoiseTex, muv * 0.35).r * texture2D(uNoiseTex, muv * 1.3 + 0.3).g;
    vec3 mwc = vec3(0.55, 0.62, 0.9) * band * (0.02 + mw * 0.22);
    col += (vec3(0.9, 0.95, 1.0) * st * 1.6 + mwc * 0.5) * uStarI * ext;
  }

  // moon
  float mmu = dot(d, uMoonPos);
  const float MR = 0.0135;
  if (uMoonVis > 0.0 && mmu > cos(MR * 1.05)) {
    vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonPos));
    vec3 my = cross(uMoonPos, mx);
    vec2 q = vec2(dot(d, mx), dot(d, my)) / MR;
    float r2 = dot(q, q);
    if (r2 < 1.0) {
      vec3 n = normalize(q.x * mx + q.y * my - sqrt(1.0 - r2) * uMoonPos);
      float lit = smoothstep(-0.05, 0.25, dot(n, uSunPos));
      float maria = texture2D(uNoiseTex, q * 0.11 + 0.4).r * 0.6 + texture2D(uNoiseTex, q * 0.31).g * 0.4;
      vec3 mc = vec3(1.0, 0.96, 0.88) * (0.55 + 0.6 * smoothstep(0.35, 0.7, maria));
      float edge = smoothstep(1.0, 0.92, r2);
      col = mix(col, col + mc * (lit * 2.6 + 0.012) * uMoonVis, edge);
    }
  }
  float mg = max(mmu, 0.0);
  col += vec3(0.5, 0.6, 0.8) * uMoonVis * (pow(mg, 900.0) * 0.25 + pow(mg, 60.0) * 0.02);

  // sun disc + aureole
  float mu = dot(d, uSunPos);
  float disc = smoothstep(0.999962, 0.999975, mu);
  col += uSunDisc * (disc * 90.0 + pow(max(mu, 0.0), 2500.0) * 6.0 + pow(max(mu, 0.0), 250.0) * 0.5) * (1.0 - below);

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
      // thin edges glow when back-lit
      cc += uCloudLit * fw * (1.0 - dens) * 1.2;
      float mist;
      vec3 tr = fogTransmit(cameraPosition, cameraPosition + d * min(t, 60000.0), mist);
      float trm = dot(tr, vec3(0.333));
      float alpha = dens * smoothstep(0.004, 0.07, d.y) * (0.25 + 0.75 * trm);
      cc = cc * tr + skyLUT(normalize(vec3(d.x, 0.04, d.z))) * (1.0 - tr);
      col = mix(col, cc, clamp(alpha, 0.0, 1.0) * 0.96);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
