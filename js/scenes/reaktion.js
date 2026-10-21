/* Reaktion–Diffusion (Gray-Scott) auf der GPU, zwei Muster-Regime fliessen ineinander */
(function () {
  'use strict';
  const G = DK.gl;

  const PRESETS = {
    Korallen: [0.0545, 0.062],
    Mitose: [0.0367, 0.0649],
    Labyrinth: [0.029, 0.057],
    Würmer: [0.078, 0.061],
    Löcher: [0.039, 0.058],
    Solitonen: [0.03, 0.062],
  };

  const INIT = G.HEADER + G.LIB + `
uniform float u_seed;
uniform float u_aspect;
uniform vec2 u_size;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  vec2 g = vec2(uv.x * u_aspect, uv.y) * 14.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + u_seed * 13.0);
  float B = (h > 0.45 && length(f - (hash22(id) - 0.5) * 0.4) < 0.14) ? 1.0 : 0.0;
  B = max(B, step(0.9993, hash12(gl_FragCoord.xy + u_seed)));
  o = vec4(1.0, B, 0.0, 1.0);
}`;

  const SIM = G.HEADER + G.LIB + `
uniform sampler2D u_state;
uniform vec2 u_fA;
uniform vec2 u_fB;
uniform float u_time;
uniform float u_mix;
uniform float u_seed;
uniform float u_aspect;
uniform vec4 u_drop;
out vec4 o;
ivec2 SZ;
ivec2 P;
vec2 S(int dx, int dy) { return texelFetch(u_state, (P + ivec2(dx, dy) + SZ) % SZ, 0).xy; }
void main() {
  SZ = textureSize(u_state, 0);
  P = ivec2(gl_FragCoord.xy);
  vec2 c = S(0, 0);
  vec2 lap = -c + 0.2 * (S(1, 0) + S(-1, 0) + S(0, 1) + S(0, -1))
               + 0.05 * (S(1, 1) + S(-1, 1) + S(1, -1) + S(-1, -1));
  vec2 uv = gl_FragCoord.xy / vec2(SZ);
  float m = smoothstep(0.35, 0.65, vnoise(vec2(uv.x * u_aspect, uv.y) * u_mix + vec2(u_time * 0.013, -u_time * 0.009) + u_seed));
  vec2 fk = mix(u_fA, u_fB, m);
  float A = c.x, B = c.y;
  float abb = A * B * B;
  A += lap.x - abb + fk.x * (1.0 - A);
  B += 0.5 * lap.y + abb - (fk.y + fk.x) * B;
  if (u_drop.z > 0.0) {
    vec2 dd = uv - u_drop.xy;
    dd.x *= u_aspect;
    if (length(dd) < u_drop.z) B = 0.9;
  }
  o = vec4(clamp(A, 0.0, 1.0), clamp(B, 0.0, 1.0), 0.0, 1.0);
}`;

  const SHOW = G.HEADER + G.LIB + `
uniform sampler2D u_state;
uniform vec2 u_res;
uniform float u_hue;
uniform float u_hueOff;
out vec4 o;
float sb(vec2 uv) {
  ivec2 sz = textureSize(u_state, 0);
  vec2 q = uv * vec2(sz) - 0.5;
  ivec2 i = ivec2(floor(q));
  vec2 f = fract(q);
  float a = texelFetch(u_state, (i + sz) % sz, 0).y;
  float b = texelFetch(u_state, (i + ivec2(1, 0) + sz) % sz, 0).y;
  float c = texelFetch(u_state, (i + ivec2(0, 1) + sz) % sz, 0).y;
  float d = texelFetch(u_state, (i + ivec2(1, 1) + sz) % sz, 0).y;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 tx = 1.0 / vec2(textureSize(u_state, 0));
  float b = sb(uv);
  float bx = sb(uv + vec2(tx.x, 0.0)) - sb(uv - vec2(tx.x, 0.0));
  float by = sb(uv + vec2(0.0, tx.y)) - sb(uv - vec2(0.0, tx.y));
  vec3 n = normalize(vec3(-bx * 4.0, -by * 4.0, 1.0));
  vec3 L = normalize(vec3(-0.4, 0.5, 0.75));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 24.0);
  float v = smoothstep(0.08, 0.4, b);
  float h = u_hue + u_hueOff;
  vec3 c1 = hsv2rgb(vec3(h, 0.85, 0.85));
  vec3 c2 = hsv2rgb(vec3(h + 0.12, 0.5, 1.0));
  vec3 base = mix(c1 * v, c2, smoothstep(0.3, 0.55, b));
  vec3 col = base * (0.3 + 0.9 * diff) + spec * 0.7 * v;
  col += hsv2rgb(vec3(h - 0.08, 0.9, 1.0)) * smoothstep(0.02, 0.2, length(vec2(bx, by))) * 0.35 * (1.0 - v);
  o = vec4(col, 1.0);
}`;

  DK.register({
    id: 'reaktion',
    name: 'Reaktion–Diffusion',
    sub: 'Zwei Stoffe, die Muster erfinden',
    type: 'webgl2',
    scale: 0.6,
    needsFloat: true,
    create(gl, env) {
      const simW = Math.round(DK.clamp(env.winW * (env.q < 1 ? 0.22 : 0.3), 200, 640));
      const simH = Math.max(64, Math.round((simW * env.winH) / env.winW));
      const opts = { internal: gl.RGBA32F, type: gl.FLOAT, filter: gl.NEAREST };
      const tg = [G.target(gl, simW, simH, opts), G.target(gl, simW, simH, opts)];
      const init = G.pass(gl, INIT), sim = G.pass(gl, SIM), show = G.pass(gl, SHOW);

      const names = Object.keys(PRESETS);
      const a = DK.pick(names);
      let b = DK.pick(names);
      while (b === a) b = DK.pick(names);
      const seed = DK.rand(0, 50), aspect = simW / simH;
      const mixScale = DK.rand(1.2, 3), hueOff = Math.random();
      const drop = [0, 0, 0, 0], noDrop = [0, 0, 0, 0];
      let cur = 0, nextDrop = 2;

      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tg[0].fbo);
      gl.viewport(0, 0, simW, simH);
      init.draw({ u_seed: seed, u_aspect: aspect, u_size: [simW, simH] });

      return {
        info: `${a} trifft ${b}`,
        render(t, dt, env) {
          gl.disable(gl.BLEND);
          drop[2] = 0;
          nextDrop -= dt;
          const p = env.pointer;
          if (p.pulse || (p.down && p.active > 0.5)) {
            drop[0] = p.nx; drop[1] = 1 - p.ny; drop[2] = p.pulse ? 0.025 : 0.008;
          } else if (nextDrop < 0) {
            nextDrop = DK.rand(2, 6);
            drop[0] = Math.random(); drop[1] = Math.random(); drop[2] = DK.rand(0.006, 0.02);
          }
          // anfangs schneller, damit das Muster rasch wächst
          const steps = Math.round(((t < 12 ? 24 : 12) + env.audio.bass * 8) * (env.q < 1 ? 0.6 : 1));
          gl.viewport(0, 0, simW, simH);
          for (let i = 0; i < steps; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, tg[1 - cur].fbo);
            sim.draw({
              u_fA: PRESETS[a], u_fB: PRESETS[b], u_time: t, u_mix: mixScale,
              u_seed: seed, u_aspect: aspect, u_drop: i === 0 ? drop : noDrop,
            }, tg[cur].tex);
            cur = 1 - cur;
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, env.w, env.h);
          show.draw({ u_res: [env.w, env.h], u_hue: env.hue, u_hueOff: hueOff }, tg[cur].tex);
        },
        destroy() {
          tg.forEach((x) => x.destroy());
          init.destroy(); sim.destroy(); show.destroy();
        },
      };
    },
  });
})();
