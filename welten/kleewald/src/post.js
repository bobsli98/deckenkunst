// HDR post chain: macro depth of field, bloom (dual filter), sun shafts, ACES tonemap, vignette, grain.
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const mk = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'precision highp float; varying vec2 vUv;\n' + frag, uniforms, depthTest: false, depthWrite: false, ...extra });

export class Post {
  constructor(renderer, samples) {
    this.r = renderer; this.samples = samples; this.rtType = null;
    this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); this.quad.frustumCulled = false; this.scene.add(this.quad);
    this.mips = []; this.main = null; this.rays = null;
    this.mDown = mk(`
      uniform sampler2D tex; uniform vec2 px; uniform float first;
      vec3 pre(vec3 c) { if (first < 0.5) return c; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); c = clamp(c, vec3(0.0), vec3(60.0)); float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); float w = max(l - 1.0, 0.0) / max(l, 1e-4); return c * (w + 0.035); }
      void main() {
        vec3 a = pre(texture2D(tex, vUv + px * vec2(-1.0, -1.0)).rgb), b = pre(texture2D(tex, vUv + px * vec2(1.0, -1.0)).rgb);
        vec3 c = pre(texture2D(tex, vUv + px * vec2(-1.0, 1.0)).rgb), d = pre(texture2D(tex, vUv + px * vec2(1.0, 1.0)).rgb);
        vec3 e = pre(texture2D(tex, vUv).rgb);
        gl_FragColor = vec4((a + b + c + d) * 0.2 + e * 0.2, 1.0);
      }`, { tex: { value: null }, px: { value: new THREE.Vector2() }, first: { value: 0 } });
    this.mUp = mk(`
      uniform sampler2D tex; uniform vec2 px;
      void main() {
        vec3 s = texture2D(tex, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(tex, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(tex, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(tex, vUv + px * vec2(1.0, 1.0)).rgb;
        s += 2.0 * (texture2D(tex, vUv + px * vec2(-1.0, 0.0)).rgb + texture2D(tex, vUv + px * vec2(1.0, 0.0)).rgb + texture2D(tex, vUv + px * vec2(0.0, 1.0)).rgb + texture2D(tex, vUv + px * vec2(0.0, -1.0)).rgb);
        s += 4.0 * texture2D(tex, vUv).rgb;
        gl_FragColor = vec4(s / 16.0, 1.0);
      }`, { tex: { value: null }, px: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.mRays = mk(`
      uniform sampler2D tex; uniform vec2 sun; uniform float aspect;
      void main() {
        vec2 d = (sun - vUv);
        float len = length(d * vec2(aspect, 1.0));
        vec2 stp = d / 40.0 * min(1.0, 0.9 / max(len, 1e-3));
        vec2 uv = vUv; vec3 acc = vec3(0.0); float w = 1.0, tw = 0.0;
        float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        uv += stp * jit;
        for (int i = 0; i < 40; i++) {
          vec3 c = texture2D(tex, uv).rgb;
          acc += min(c, vec3(8.0)) * w; tw += w; w *= 0.965; uv += stp;
        }
        gl_FragColor = vec4(acc / tw, 1.0);
      }`, { tex: { value: null }, sun: { value: new THREE.Vector2() }, aspect: { value: 1 } });
    this.mFinal = mk(`
      uniform sampler2D tScene, tBloom, tRays; uniform float exposure, bloom, rays, time; uniform vec2 res;
      uniform sampler2D tDepth, tD1, tD2, tD3; uniform float near, far, aperture, dofOn;
      float diopter(vec2 uv) { // 1 / distance; 0 for the sky
        float z = texture2D(tDepth, uv).r;
        if (z >= 0.99999) return 0.0;
        float zn = z * 2.0 - 1.0;
        return (far + near - zn * (far - near)) / (2.0 * near * far);
      }
      vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c) {
        const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        return clamp(O * RRTAndODTFit(I * c), 0.0, 1.0);
      }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
        if (dofOn > 0.5) {
          // a macro lens: the focus follows whatever sits in the middle of the view
          float F = 0.0;
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) F += diopter(vec2(0.5) + vec2(float(i), float(j)) * vec2(0.035, 0.05));
          F /= 9.0;
          float D = diopter(vUv);
          float coc = clamp(abs(D - F) * aperture, 0.0, 1.0);
          vec3 b1 = texture2D(tD1, vUv).rgb, b2 = texture2D(tD2, vUv).rgb, b3 = texture2D(tD3, vUv).rgb;
          if (any(isnan(b1 + b2 + b3)) || any(isinf(b1 + b2 + b3))) { b1 = c; b2 = c; b3 = c; }
          vec3 bl = coc < 0.33 ? mix(c, b1, coc / 0.33) : coc < 0.66 ? mix(b1, b2, (coc - 0.33) / 0.33) : mix(b2, b3, (coc - 0.66) / 0.34);
          c = bl;
        }
        vec3 b = texture2D(tBloom, vUv).rgb;
        c += b * bloom + texture2D(tRays, vUv).rgb * rays;
        c *= exposure;
        c = aces(c * 1.05);
        // soft, warm grade: lifted shadows, a little extra colour
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, 1.14);
        c = mix(c, sqrt(max(c, 0.0)), 0.07);
        c *= vec3(1.03, 1.0, 0.965);
        c = pow(c, vec3(1.0 / 2.2));
        vec2 q = vUv - 0.5;
        c *= 1.0 - dot(q, q) * 0.34;
        float g = fract(sin(dot(gl_FragCoord.xy + time * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
        c += (g - 0.5) / 160.0;
        gl_FragColor = vec4(c, 1.0);
      }`, { tScene: { value: null }, tBloom: { value: null }, tRays: { value: null }, tDepth: { value: null }, tD1: { value: null }, tD2: { value: null }, tD3: { value: null }, near: { value: 0.1 }, far: { value: 1000 }, aperture: { value: 0 }, dofOn: { value: 0 }, exposure: { value: 1 }, bloom: { value: 0.5 }, rays: { value: 0 }, time: { value: 0 }, res: { value: new THREE.Vector2() } });
  }
  setSize(w, h) {
    w = Math.max(8, Math.floor(w)); h = Math.max(8, Math.floor(h));
    if (this.main && this.main.width === w && this.main.height === h) return;
    this.dispose();
    const opt = { type: this.rtType || THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.main = new THREE.WebGLRenderTarget(w, h, { ...opt, depthBuffer: true, samples: this.samples });
    this.main.depthTexture = new THREE.DepthTexture(w, h); this.main.depthTexture.type = THREE.UnsignedIntType;
    this.dof = [2, 4, 8].map((k) => new THREE.WebGLRenderTarget(Math.max(4, w / k | 0), Math.max(4, h / k | 0), opt));
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < 6 && mw > 4 && mh > 4; i++) { this.mips.push(new THREE.WebGLRenderTarget(mw, mh, opt)); mw >>= 1; mh >>= 1; }
    this.pre = new THREE.WebGLRenderTarget(this.mips[1].width, this.mips[1].height, opt);
    this.rays = new THREE.WebGLRenderTarget(this.mips[1].width, this.mips[1].height, opt);
  }
  dispose() {
    if (this.main) { if (this.main.depthTexture) this.main.depthTexture.dispose(); this.main.dispose(); }
    if (this.dof) { for (const d of this.dof) d.dispose(); this.dof = null; }
    for (const m of this.mips) m.dispose(); this.mips = [];
    if (this.rays) { this.rays.dispose(); this.pre.dispose(); }
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }
  render(o) {
    const r = this.r;
    const ac = r.autoClear; r.autoClear = false;
    // blurred copies of the scene for the depth of field
    const dofOn = (o.aperture || 0) > 0.01;
    if (dofOn) {
      let s = this.main;
      for (const d of this.dof) { const m = this.mDown.uniforms; m.tex.value = s.texture; m.px.value.set(1 / s.width, 1 / s.height); m.first.value = 0; this.pass(this.mDown, d); s = d; }
    }
    // bloom down
    let src = this.main;
    for (let i = 0; i < this.mips.length; i++) {
      const m = this.mDown.uniforms;
      m.tex.value = src.texture; m.px.value.set(1 / src.width, 1 / src.height); m.first.value = i === 0 ? 1 : 0;
      this.pass(this.mDown, this.mips[i]);
      if (i === 1) { // keep an un-accumulated copy for the shafts
        m.tex.value = this.mips[0].texture; m.px.value.set(1 / this.mips[0].width, 1 / this.mips[0].height); m.first.value = 0;
        this.pass(this.mDown, this.pre);
      }
      src = this.mips[i];
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      const m = this.mUp.uniforms;
      m.tex.value = this.mips[i].texture; m.px.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      this.pass(this.mUp, this.mips[i - 1]);
    }
    const f = this.mFinal.uniforms;
    if (o.rays > 0.001) {
      const m = this.mRays.uniforms;
      m.tex.value = this.pre.texture; m.sun.value.copy(o.sunUV); m.aspect.value = this.main.width / this.main.height;
      this.pass(this.mRays, this.rays);
    }
    f.tScene.value = this.main.texture; f.tBloom.value = this.mips[0].texture; f.tRays.value = this.rays.texture;
    f.dofOn.value = dofOn ? 1 : 0; f.tDepth.value = this.main.depthTexture; f.tD1.value = this.dof[0].texture; f.tD2.value = this.dof[1].texture; f.tD3.value = this.dof[2].texture;
    f.near.value = o.near || 0.1; f.far.value = o.far || 1000; f.aperture.value = o.aperture || 0;
    f.exposure.value = o.exposure; f.bloom.value = o.bloom; f.rays.value = o.rays; f.time.value = o.time % 100;
    this.pass(this.mFinal, null);
    r.autoClear = ac;
  }
}
