/* Seidenstrom: tausende Teilchen ziehen Lichtfäden durch ein Rauschfeld (HDR-Spuren auf der GPU) */
(function () {
  'use strict';
  const G = DK.gl;

  const SHOW = G.HEADER + `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_exposure;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, gl_FragCoord.xy / u_res).rgb;
  o = vec4(1.0 - exp(-c * u_exposure), 1.0);
}`;

  DK.register({
    id: 'seide',
    name: 'Seidenstrom',
    sub: 'Fäden im unsichtbaren Wind',
    type: 'webgl2',
    scale: 1,
    needsFloat: true,
    create(gl, env) {
      const N = Math.round(DK.clamp((env.winW * env.winH) / 220, 5000, 9500) * env.q);
      const noise = DK.makeNoise();
      const curl = Math.random() < 0.5;
      const freq = DK.rand(1.2, 3.2);
      const speed = DK.rand(0.08, 0.16);
      const turns = DK.rand(1, 2.5);
      const hueSpread = DK.rand(0.06, 0.35);
      const fadeBase = DK.rand(0.965, 0.985);
      const trails = G.trails(gl, env.w, env.h);
      const batch = G.batch(gl, N * 2);
      const show = G.pass(gl, SHOW);

      const px = new Float32Array(N), py = new Float32Array(N);
      const life = new Float32Array(N), maxLife = new Float32Array(N), hoff = new Float32Array(N);
      let M = Math.min(env.w, env.h), AW = env.w / M, AH = env.h / M;

      function spawn(i) {
        px[i] = Math.random() * AW;
        py[i] = Math.random() * AH;
        maxLife[i] = life[i] = DK.rand(2, 9);
        hoff[i] = Math.random();
      }
      for (let i = 0; i < N; i++) { spawn(i); life[i] = Math.random() * maxLife[i]; }

      return {
        info: curl ? 'Wirbelfeld' : 'Winkelfeld',
        resize(w, h) {
          trails.resize(w, h);
          M = Math.min(w, h); AW = w / M; AH = h / M;
        },
        render(t, dt, env) {
          const tz = t * 0.04;
          const d = batch.data;
          const p = env.pointer;
          const pxu = p.nx * AW, pyu = p.ny * AH;
          const boost = 1 + env.audio.level * 1.5;
          let v = 0;
          for (let i = 0; i < N; i++) {
            const x = px[i], y = py[i];
            let vx, vy;
            if (curl) {
              // Vorwärtsdifferenzen: 3 statt 4 Rauschaufrufe pro Teilchen
              const e = 0.01;
              const n0 = noise(x * freq, y * freq, tz);
              const n1 = noise(x * freq, (y + e) * freq, tz), n3 = noise((x + e) * freq, y * freq, tz);
              vx = ((n1 - n0) / e) / freq;
              vy = (-(n3 - n0) / e) / freq;
            } else {
              const a = noise(x * freq, y * freq, tz) * Math.PI * 2 * turns;
              vx = Math.cos(a); vy = Math.sin(a);
            }
            if (p.active > 0.05) {
              const dx = x - pxu, dy = y - pyu;
              const f = p.active * 3 * Math.exp(-(dx * dx + dy * dy) / 0.02);
              vx += -dy * f * 10; vy += dx * f * 10;
            }
            const s = speed * boost * dt;
            const nx = x + vx * s, ny = y + vy * s;
            life[i] -= dt;
            if (life[i] <= 0 || nx < 0 || ny < 0 || nx > AW || ny > AH) { spawn(i); continue; }
            px[i] = nx; py[i] = ny;
            const spd = Math.sqrt(vx * vx + vy * vy);
            const lf = Math.sin(Math.PI * (life[i] / maxLife[i]));
            const c = DK.hsv2rgb(env.hue + hoff[i] * hueSpread + spd * 0.08, 0.7, 0.45 * lf);
            d[v++] = (x / AW) * 2 - 1; d[v++] = 1 - (y / AH) * 2; d[v++] = c[0]; d[v++] = c[1]; d[v++] = c[2];
            d[v++] = (nx / AW) * 2 - 1; d[v++] = 1 - (ny / AH) * 2; d[v++] = c[0]; d[v++] = c[1]; d[v++] = c[2];
          }
          trails.bind();
          trails.fade(Math.pow(fadeBase, dt * 60));
          trails.additive();
          batch.draw(v / 5, gl.LINES);
          gl.disable(gl.BLEND);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, env.w, env.h);
          show.draw({ u_res: [env.w, env.h], u_exposure: 1.3 }, trails.tex);
        },
        destroy() { trails.destroy(); batch.destroy(); show.destroy(); },
      };
    },
  });
})();
