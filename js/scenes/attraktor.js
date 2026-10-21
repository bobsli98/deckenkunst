/* Seltsamer Attraktor: Clifford- und de-Jong-Systeme, deren Parameter langsam ineinander morphen */
(function () {
  'use strict';
  const G = DK.gl;

  const SYSTEMS = {
    Clifford: {
      presets: [[-1.4, 1.6, 1.0, 0.7], [1.7, 1.7, 0.6, 1.2], [-1.7, 1.3, -0.1, -1.2], [-1.7, 1.8, -1.9, -0.4],
        [1.5, -1.8, 1.6, 0.9], [-1.8, -2.0, -0.5, -0.9], [1.6, -0.6, -1.2, 1.6]],
      range: (a, b, c, d) => [1 + Math.abs(c), 1 + Math.abs(d)],
    },
    'de Jong': {
      presets: [[1.4, -2.3, 2.4, -2.1], [2.01, -2.53, 1.61, -0.33], [-2.7, -0.09, -0.86, -2.2],
        [-2.24, 0.43, -0.65, -2.43], [2.0, -2.0, -1.2, 2.0], [-2.0, -2.0, -1.2, 2.0]],
      range: () => [2, 2],
    },
  };

  const SHOW = G.HEADER + `
uniform sampler2D u_tex;
uniform vec2 u_res;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, gl_FragCoord.xy / u_res).rgb;
  c = 1.0 - exp(-c * 1.6);
  o = vec4(pow(c, vec3(0.9)), 1.0);
}`;

  DK.register({
    id: 'attraktor',
    name: 'Seltsamer Attraktor',
    sub: 'Chaos, das eine Form annimmt',
    type: 'webgl2',
    scale: 1,
    needsFloat: true,
    create(gl, env) {
      const sysName = DK.pick(Object.keys(SYSTEMS));
      const sys = SYSTEMS[sysName];
      const N = Math.round(40000 * env.q);
      const trails = G.trails(gl, env.w, env.h);
      const batch = G.batch(gl, N);
      const show = G.pass(gl, SHOW);
      const px = new Float32Array(N), py = new Float32Array(N);
      for (let i = 0; i < N; i++) { px[i] = DK.rand(-1, 1); py[i] = DK.rand(-1, 1); }

      const order = DK.shuffle(sys.presets.slice());
      let idx = 0, morphT = 0;
      const morphDur = DK.rand(18, 30);
      const lut = new Float32Array(256 * 3);
      const intensity = DK.rand(0.03, 0.05);
      const hueSpan = DK.rand(0.2, 0.6);
      const rotSpeed = DK.rand(-0.02, 0.02);

      return {
        info: `${sysName}-System`,
        resize(w, h) { trails.resize(w, h); },
        render(t, dt, env) {
          morphT += dt / morphDur;
          if (morphT >= 1) { morphT -= 1; idx = (idx + 1) % order.length; }
          const P0 = order[idx], P1 = order[(idx + 1) % order.length];
          const k = DK.smooth(DK.clamp((morphT - 0.4) / 0.6, 0, 1));
          const a = DK.lerp(P0[0], P1[0], k), b = DK.lerp(P0[1], P1[1], k);
          const c = DK.lerp(P0[2], P1[2], k), d = DK.lerp(P0[3], P1[3], k);
          const [rx, ry] = sys.range(a, b, c, d);
          const M = Math.min(env.w, env.h) * 0.46;
          const sx = M / rx / (env.w / 2), sy = M / ry / (env.h / 2);
          const ang = t * rotSpeed, ca = Math.cos(ang), sa = Math.sin(ang);

          for (let i = 0; i < 256; i++) {
            const col = DK.hsv2rgb(env.hue + (i / 255) * hueSpan, 0.65 + 0.3 * (i / 255), intensity * (1 + env.audio.level));
            lut[i * 3] = col[0]; lut[i * 3 + 1] = col[1]; lut[i * 3 + 2] = col[2];
          }

          const data = batch.data;
          let v = 0;
          const reseed = Math.floor(N * 0.004);
          const start = Math.floor(Math.random() * N);
          for (let r = 0; r < reseed; r++) {
            const j = (start + r) % N;
            px[j] = DK.rand(-rx, rx); py[j] = DK.rand(-ry, ry);
          }
          const cliff = sysName === 'Clifford';
          for (let i = 0; i < N; i++) {
            const x = px[i], y = py[i];
            // Formeln direkt ausgeschrieben – ohne pro Punkt ein Array anzulegen
            const nx = cliff ? Math.sin(a * y) + c * Math.cos(a * x) : Math.sin(a * y) - Math.cos(b * x);
            const ny = cliff ? Math.sin(b * x) + d * Math.cos(b * y) : Math.sin(c * x) - Math.cos(d * y);
            px[i] = nx; py[i] = ny;
            const dx = nx - x, dy = ny - y;
            const li = Math.min(255, ((Math.abs(dx) + Math.abs(dy)) * 45) | 0) * 3;
            const X = (nx * ca - ny * sa) * sx, Y = (nx * sa + ny * ca) * sy;
            data[v++] = X; data[v++] = Y;
            data[v++] = lut[li]; data[v++] = lut[li + 1]; data[v++] = lut[li + 2];
          }
          trails.bind();
          trails.fade(Math.pow(0.92, dt * 60));
          trails.additive();
          batch.draw(N, gl.POINTS, 1);
          gl.disable(gl.BLEND);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, env.w, env.h);
          show.draw({ u_res: [env.w, env.h] }, trails.tex);
        },
        destroy() { trails.destroy(); batch.destroy(); show.destroy(); },
      };
    },
  });
})();
