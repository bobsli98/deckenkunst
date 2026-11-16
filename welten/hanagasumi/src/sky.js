// Sky: atmosphere LUT, dome (sun, moon, stars, clouds), and the day/night lighting rig.
import * as THREE from 'three';
import { U, CAPS, SKY_LUT_FRAG, SKY_DOME_VERT, SKY_DOME_FRAG } from './shaders.js';
import { clamp, lerp, smoothstep } from './noise.js';

const LAT = 35 * Math.PI / 180;
const Rg = 6360e3, Rt = 6460e3;
const bR = [5.802e-6, 13.558e-6, 33.1e-6], bO = [0.650e-6, 1.881e-6, 0.085e-6];

function transmittance(dirY, turb, out) {
  // numeric optical depth from 200 m altitude along a direction with given sin(elevation)
  const y0 = Rg + 200, dy = Math.max(dirY, -0.02), dx = Math.sqrt(1 - dy * dy);
  const b = y0 * dy, c = y0 * y0 - Rt * Rt;
  const tmax = -b + Math.sqrt(b * b - c);
  let oR = 0, oM = 0, oO = 0, tp = 0;
  const N = 32;
  for (let i = 0; i < N; i++) {
    const f = (i + 1) / N, t = tmax * f * f, dt = t - tp, tm = tp + dt * 0.5; tp = t;
    const px = dx * tm, py = y0 + dy * tm;
    const h = Math.max(0, Math.hypot(px, py) - Rg);
    oR += Math.exp(-h / 8000) * dt; oM += Math.exp(-h / 1200) * dt; oO += Math.max(0, 1 - Math.abs(h - 25000) / 15000) * dt;
  }
  const bM = 3.996e-6 * turb * 1.11;
  for (let k = 0; k < 3; k++) out[k] = Math.exp(-(bR[k] * oR + bM * oM + bO[k] * oO));
  return out;
}

export class Sky {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.lut = new THREE.WebGLRenderTarget(256, 128, { type: CAPS.rtType || THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
    this.lutMat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3() }, uMoon: { value: new THREE.Vector3() }, uSunI: { value: 20 }, uMoonI: { value: 0 }, uTurb: { value: 2.2 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: SKY_LUT_FRAG, depthTest: false, depthWrite: false,
    });
    this.lutScene = new THREE.Scene();
    this.lutCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lutMat); q.frustumCulled = false;
    this.lutScene.add(q);
    U.uSkyLUT.value = this.lut.texture;

    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        ...U,
        uSunPos: { value: new THREE.Vector3() }, uMoonPos: { value: new THREE.Vector3() },
        uSunDisc: { value: new THREE.Color() }, uMoonVis: { value: 0 }, uStarI: { value: 0 },
        uStarRot: { value: new THREE.Matrix3() }, uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      },
      vertexShader: SKY_DOME_VERT, fragmentShader: SKY_DOME_FRAG, depthWrite: false, depthTest: true, side: THREE.BackSide, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), this.domeMat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -1000;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3(); this.lightDir = new THREE.Vector3();
    this.time = 16.6; this.night = 0; this.exposure = 1; this.sunUp = 1;
    this.cloudOff = new THREE.Vector2(Math.random() * 10, Math.random() * 10);
    this.coverage = 0.5; this.declination = 6 * Math.PI / 180; this.cloudBias = 0;
    this._tr = [1, 1, 1];
    this._lastLUT = -1e9; this._lutSun = new THREE.Vector3(0, -2, 0);
  }

  static sunAt(time, declination, out) {
    const Hh = (time - 12) * 15 * Math.PI / 180;
    const sd = Math.sin(declination), cd = Math.cos(declination), sl = Math.sin(LAT), cl = Math.cos(LAT);
    const up = sl * sd + cl * cd * Math.cos(Hh);
    const east = -cd * Math.sin(Hh);
    const north = cl * sd - sl * cd * Math.cos(Hh);
    return out.set(east, up, -north).normalize();
  }

  update(dt, elapsed) {
    const t = this.time;
    const DECL = this.declination;
    Sky.sunAt(t, DECL, this.sunDir);
    Sky.sunAt(t + 12.9, -DECL * 0.6 + 0.2, this.moonDir);
    const sy = this.sunDir.y, my = this.moonDir.y;
    const turb = 2.2;

    const sunVis = smoothstep(-0.045, 0.02, sy);
    const night = 1 - smoothstep(-0.2, 0.02, sy);
    const moonUp = smoothstep(-0.02, 0.12, my);
    const moonLight = smoothstep(-0.05, -0.16, sy) * moonUp;
    this.night = night; this.sunUp = sunVis;

    // sun colour through the atmosphere
    transmittance(sy, turb, this._tr);
    const tr = this._tr;
    const sunCol = new THREE.Color(tr[0], tr[1], tr[2]).multiplyScalar(3.9 * sunVis);
    // the sun reddens further in real skies than single scattering predicts
    const low = 1 - smoothstep(0.0, 0.25, sy);
    sunCol.g *= lerp(0.97, 0.86, low); sunCol.b *= lerp(0.90, 0.66, low);
    const moonCol = new THREE.Color(0.52, 0.66, 1.0).multiplyScalar(0.36 * moonLight);

    const useSun = sy > -0.045;
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    const lightCol = useSun ? sunCol : moonCol;
    this.sun.color.copy(lightCol); this.sun.intensity = Math.PI;
    U.uSunDirW.value.copy(this.lightDir);
    U.uSunCol.value.copy(lightCol);

    // ambient
    const kf = (y) => {
      const day = [0.62, 0.68, 0.84, 0.62], set = [0.72, 0.58, 0.58, 0.44], dusk = [0.26, 0.28, 0.48, 0.26], ngt = [0.13, 0.18, 0.34, 0.125];
      let a, b, f;
      if (y > 0.28) return day;
      if (y > 0.0) { a = set; b = day; f = smoothstep(0, 0.28, y); }
      else if (y > -0.1) { a = dusk; b = set; f = smoothstep(-0.1, 0, y); }
      else { a = ngt; b = dusk; f = smoothstep(-0.24, -0.1, y); }
      return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f)];
    };
    const k = kf(sy);
    const ambI = k[3] * (1 + 0.9 * moonLight * night);
    const amb = new THREE.Color(k[0], k[1], k[2]).multiplyScalar(ambI);
    this.hemi.color.copy(amb); this.hemi.intensity = Math.PI;
    this.hemi.groundColor.set(amb.r * 0.50 + lightCol.r * 0.09, amb.g * 0.48 + lightCol.g * 0.09, amb.b * 0.36 + lightCol.b * 0.04);
    U.uAmbCol.value.copy(amb);
    U.uNight.value = night;

    // fog: morning mist, evening haze
    const morning = t < 12 ? smoothstep(-0.12, 0.05, sy) * (1 - smoothstep(0.12, 0.42, sy)) : 0;
    const evening = t >= 12 ? (1 - smoothstep(0.02, 0.3, sy)) : 0;
    U.uFogP.value.x = 0.000085 + 0.00005 * evening + 0.00004 * morning + 0.00002 * night;
    U.uFogP.value.y = 0.0007 + 0.0036 * morning + 0.0012 * evening + 0.0012 * night;
    U.uFogP.value.z = 55 + 25 * morning;

    // clouds
    this.cloudOff.x += dt * 0.00022; this.cloudOff.y += dt * 0.00011;
    this.coverage = 0.50 + this.cloudBias + 0.14 * Math.sin(elapsed * 0.011 + 1.3) + 0.06 * Math.sin(elapsed * 0.031);
    U.uCloudP.value.set(this.cloudOff.x, this.cloudOff.y, this.coverage, elapsed);

    const du = this.domeMat.uniforms;
    du.uSunPos.value.copy(this.sunDir); du.uMoonPos.value.copy(this.moonDir);
    du.uSunDisc.value.setRGB(tr[0], tr[1] * lerp(1, 0.8, low), tr[2] * lerp(1, 0.6, low)).multiplyScalar(smoothstep(-0.03, 0.0, sy));
    du.uMoonVis.value = smoothstep(-0.06, 0.02, my) * (0.25 + 0.75 * night);
    du.uStarI.value = night * night;
    // star field rotation about the celestial pole
    const ang = (t / 24) * Math.PI * 2;
    const axis = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT));
    du.uStarRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationAxis(axis, ang));
    du.uCloudLit.value.copy(lightCol).multiplyScalar(useSun ? 0.42 : 0.9);
    du.uCloudDark.value.copy(amb).multiplyScalar(0.62);

    this.exposure = lerp(0.84, 1.75, night) * lerp(1, 1.12, low * (1 - night));

    // atmosphere LUT (only when the sun moved noticeably)
    const lu = this.lutMat.uniforms;
    if (this._lutSun.distanceToSquared(this.sunDir) > 1e-7 || this._lastLUT < 0) {
      this._lutSun.copy(this.sunDir); this._lastLUT = elapsed;
      lu.uSun.value.copy(this.sunDir); lu.uMoon.value.copy(this.moonDir);
      lu.uSunI.value = 21 * smoothstep(-0.32, -0.02, sy);
      lu.uMoonI.value = 0.55 * moonUp * night;
      lu.uTurb.value = turb;
      const prev = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.lut);
      this.renderer.render(this.lutScene, this.lutCam);
      this.renderer.setRenderTarget(prev);
    }
  }

  // place the shadow camera around a focus point, snapped to texels
  updateShadow(focus, range) {
    const l = this.sun, cam = l.shadow.camera;
    if (cam.right !== range) {
      cam.left = -range; cam.right = range; cam.top = range; cam.bottom = -range; cam.near = 1; cam.far = 1400;
      cam.updateProjectionMatrix();
    }
    const d = this.lightDir;
    // snap in light space
    const texel = (range * 2) / l.shadow.mapSize.x;
    const up = Math.abs(d.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, d).normalize();
    const upv = new THREE.Vector3().crossVectors(d, right).normalize();
    const fx = Math.round(focus.dot(right) / texel) * texel, fy = Math.round(focus.dot(upv) / texel) * texel, fz = focus.dot(d);
    const c = new THREE.Vector3().addScaledVector(right, fx).addScaledVector(upv, fy).addScaledVector(d, fz);
    l.target.position.copy(c);
    l.position.copy(c).addScaledVector(d, 700);
    l.target.updateMatrixWorld(); l.updateMatrixWorld();
  }
}
