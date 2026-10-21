/* Galaxie: Kern, Scheibe und logarithmische Spiralarme mit Sternentstehungsgebieten */
(function () {
  'use strict';
  const G = DK.gl;
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(DK.TAU * v);
  };

  const SHOW = G.HEADER + G.LIB + `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform vec3 u_core;
uniform float u_coreR;
out vec4 o;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  vec3 c = texture(u_tex, gl_FragCoord.xy / u_res).rgb;
  float r = length(uv) / u_coreR;
  c += u_core * (exp(-r * 9.0) * 1.2 + exp(-r * 2.5) * 0.12);
  c += vec3(0.7, 0.8, 1.0) * stars(uv, 80.0, u_time, u_seed) * 0.5;
  o = vec4(1.0 - exp(-c * 1.5), 1.0);
}`;

  DK.register({
    id: 'galaxie',
    name: 'Galaxie',
    sub: 'Hundert Milliarden Sonnen, im Zeitraffer',
    type: 'webgl2',
    scale: 1,
    needsFloat: true,
    create(gl, env) {
      const N = Math.round(60000 * env.q);
      const trails = G.trails(gl, env.w, env.h);
      const batch = G.batch(gl, N);
      const show = G.pass(gl, SHOW);
      const arms = DK.pick([2, 2, 3, 4]);
      const pitch = DK.rand(0.22, 0.4) * (Math.random() < 0.5 ? -1 : 1);
      const incl = DK.rand(0, 0.95);
      const omegaP = DK.rand(0.025, 0.05) * Math.sign(-pitch);
      const viewRot = DK.rand(-0.01, 0.01);
      const hue = DK.rand(0.54, 0.64);
      const seed = DK.rand(0, 50);

      const R = new Float32Array(N), T0 = new Float32Array(N), W = new Float32Array(N);
      const C = new Float32Array(N * 3);
      const bright = new Uint8Array(N);
      // Gruppe 0 = Kern, 2 = Arme: drehen starr als Ganzes (eine Rotation pro Gruppe statt pro Stern)
      const grp = new Uint8Array(N), BX = new Float32Array(N), BY = new Float32Array(N);
      let nBright = 0;
      const setCol = (i, col, b) => { C[i * 3] = col[0] * b; C[i * 3 + 1] = col[1] * b; C[i * 3 + 2] = col[2] * b; };

      for (let i = 0; i < N; i++) {
        const roll = Math.random();
        if (roll < 0.18) {
          // Kern: dicht, gelblich, schnell
          const r = Math.abs(gauss()) * 0.11;
          R[i] = r; T0[i] = Math.random() * DK.TAU; W[i] = omegaP * 3; grp[i] = 0;
          setCol(i, DK.hsv2rgb(DK.rand(0.07, 0.12), DK.rand(0.3, 0.6), 1), DK.rand(0.04, 0.09));
        } else if (roll < 0.4) {
          // Scheibe: diffus, dreht differenziell
          const r = Math.min(1.2, -Math.log(1 - Math.random() * 0.97) * 0.32);
          R[i] = r; T0[i] = Math.random() * DK.TAU; W[i] = Math.sign(omegaP) * (0.02 + 0.05 / (r + 0.2)); grp[i] = 1;
          setCol(i, DK.hsv2rgb(DK.rand(0.08, 0.6), DK.rand(0.1, 0.35), 1), DK.rand(0.02, 0.05));
        } else {
          // Spiralarme: r ~ e^(pitch·θ), Streuung wächst nach aussen
          const r = 0.12 + Math.pow(Math.random(), 0.9) * 1.0;
          const k = Math.floor(Math.random() * arms);
          const spread = gauss() * (0.12 + 0.2 * r);
          R[i] = r * (1 + gauss() * 0.03);
          T0[i] = (k / arms) * DK.TAU + Math.log(r) / pitch + spread;
          W[i] = omegaP;
          grp[i] = 2;
          const hii = Math.random() < 0.035 && Math.abs(spread) < 0.15;
          if (hii) {
            bright[i] = 1; nBright++;
            setCol(i, DK.hsv2rgb(DK.rand(0.9, 0.98), 0.6, 1), DK.rand(0.12, 0.25));
          } else if (Math.random() < 0.02) {
            bright[i] = 1; nBright++;
            setCol(i, DK.hsv2rgb(hue, 0.2, 1), DK.rand(0.1, 0.2));
          } else {
            setCol(i, DK.hsv2rgb(hue + DK.rand(-0.05, 0.05), DK.rand(0.25, 0.65), 1), DK.rand(0.03, 0.08));
          }
        }
      }
      for (let i = 0; i < N; i++) { BX[i] = R[i] * Math.cos(T0[i]); BY[i] = R[i] * Math.sin(T0[i]); }
      // helle Sterne ans Ende, damit sie grösser gezeichnet werden können
      const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => bright[a] - bright[b]);

      return {
        info: `${arms} Spiralarme · ${incl > 0.55 ? 'schräg von der Seite' : 'von oben'}`,
        resize(w, h) { trails.resize(w, h); },
        render(t, dt, env) {
          const M = Math.min(env.w, env.h) * 0.6 * (1 + env.audio.bass * 0.05);
          const sx = M / (env.w / 2), sy = M / (env.h / 2);
          const ci = Math.cos(incl);
          const vr = t * viewRot, cv = Math.cos(vr), sv = Math.sin(vr);
          const tt = t * (1 + env.audio.level * 0.5);
          const data = batch.data;
          let v = 0;
          const c0 = Math.cos(tt * omegaP * 3), s0 = Math.sin(tt * omegaP * 3);
          const c2 = Math.cos(tt * omegaP), s2 = Math.sin(tt * omegaP);
          for (let n = 0; n < N; n++) {
            const i = order[n];
            let x, y;
            const gI = grp[i];
            if (gI === 1) {
              const a = T0[i] + tt * W[i];
              x = R[i] * Math.cos(a); y = R[i] * Math.sin(a) * ci;
            } else {
              const cg = gI === 0 ? c0 : c2, sg = gI === 0 ? s0 : s2;
              x = BX[i] * cg - BY[i] * sg; y = (BX[i] * sg + BY[i] * cg) * ci;
            }
            data[v++] = (x * cv - y * sv) * sx;
            data[v++] = (x * sv + y * cv) * sy;
            data[v++] = C[i * 3]; data[v++] = C[i * 3 + 1]; data[v++] = C[i * 3 + 2];
          }
          trails.bind();
          trails.fade(Math.pow(0.82, dt * 60));
          trails.additive();
          batch.draw(N - nBright, gl.POINTS, 1.5);
          batch.draw(nBright, gl.POINTS, 4, 1, N - nBright);
          gl.disable(gl.BLEND);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, env.w, env.h);
          show.draw({
            u_res: [env.w, env.h], u_time: t, u_seed: seed,
            u_core: DK.hsv2rgb(0.09, 0.45, 1), u_coreR: 0.6 * Math.max(0.4, ci),
          }, trails.tex);
        },
        destroy() { trails.destroy(); batch.destroy(); show.destroy(); },
      };
    },
  });
})();
