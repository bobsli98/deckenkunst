/* Glühwürmchen: pulsgekoppelte Oszillatoren – aus Durcheinander wird langsam Gleichtakt */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const KINDS = [
    { name: 'Goldgrün', hues: [0.17, 0.2, 0.23] },
    { name: 'Blaue Geister', hues: [0.52, 0.55, 0.58] },
    { name: 'Gemischt', hues: [0.15, 0.2, 0.55, 0.08] },
  ];

  DK.register({
    id: 'gluehwuermchen',
    name: 'Glühwürmchen',
    sub: 'Erst Durcheinander, dann Gleichtakt',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const kind = DK.pick(KINDS);
      const M = () => Math.min(env.w, env.h);
      const N = Math.round(DK.clamp(((env.w * env.h) / (M() * M())) * 150, 100, 380));
      const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N);
      const ph = new Float32Array(N), fr = new Float32Array(N), ang = new Float32Array(N);
      const hue = new Float32Array(N);
      const flashed = [];
      const epsMax = DK.rand(0.04, 0.09);
      const radius = DK.rand(0.25, 0.45);
      let eps = 0, syncT = 0, rampT = 0;
      let sky = null;

      for (let i = 0; i < N; i++) {
        x[i] = Math.random() * env.w;
        y[i] = Math.random() * env.h;
        z[i] = DK.rand(0.35, 1);
        ph[i] = Math.random();
        fr[i] = 1 / DK.rand(1.4, 2.1);
        ang[i] = Math.random() * TAU;
        hue[i] = DK.pick(kind.hues) + DK.rand(-0.015, 0.015);
      }

      function buildSky() {
        sky = document.createElement('canvas');
        sky.width = env.w; sky.height = env.h;
        const g = sky.getContext('2d');
        g.fillStyle = '#010204';
        g.fillRect(0, 0, env.w, env.h);
        const n = Math.round((env.w * env.h) / 9000);
        for (let i = 0; i < n; i++) {
          g.fillStyle = `rgba(190,205,255,${DK.rand(0.05, 0.3)})`;
          g.fillRect(Math.random() * env.w, Math.random() * env.h, 1.2, 1.2);
        }
      }
      buildSky();

      return {
        info: kind.name,
        resize() { buildSky(); },
        render(t, dt, env) {
          const w = env.w, h = env.h, m = M();
          const R = m * radius, R2 = R * R;
          rampT += dt;
          eps = epsMax * DK.smooth(DK.clamp((rampT - 8) / 50, 0, 1));
          const p = env.pointer;
          const pX = p.nx * w, pY = p.ny * h;

          // Klick: alle in der Nähe blitzen gleichzeitig auf
          if (p.pulse) {
            for (let i = 0; i < N; i++) {
              const dx = x[i] - pX, dy = y[i] - pY;
              if (dx * dx + dy * dy < R2 * 0.5) ph[i] = 1;
            }
          }

          flashed.length = 0;
          let cs = 0, sn = 0;
          for (let i = 0; i < N; i++) {
            ph[i] += fr[i] * dt * (1 + env.audio.bass * 0.5);
            if (ph[i] >= 1) { ph[i] -= Math.floor(ph[i]); flashed.push(i); }
            cs += Math.cos(ph[i] * TAU); sn += Math.sin(ph[i] * TAU);

            ang[i] += noise(i * 0.37, t * 0.1, 0) * 1.5 * dt;
            const v = m * 0.012 * z[i];
            x[i] += Math.cos(ang[i]) * v * dt;
            y[i] += Math.sin(ang[i]) * v * dt;
            if (x[i] < -20) x[i] += w + 40; else if (x[i] > w + 20) x[i] -= w + 40;
            if (y[i] < -20) y[i] += h + 40; else if (y[i] > h + 20) y[i] -= h + 40;
          }
          // Kopplung: ein Blitz schubst die Nachbarn ein wenig vorwärts
          if (eps > 0) {
            for (const f of flashed) {
              for (let j = 0; j < N; j++) {
                if (j === f) continue;
                const dx = x[j] - x[f], dy = y[j] - y[f], d2 = dx * dx + dy * dy;
                if (d2 < R2 && ph[j] > 0.05) ph[j] = Math.min(1, ph[j] + eps * (1 - Math.sqrt(d2) / R));
              }
            }
          }
          // Wenn alle im Takt sind: nach einer Weile wieder durcheinanderbringen
          const order = Math.hypot(cs, sn) / N;
          if (order > 0.85) syncT += dt; else syncT = Math.max(0, syncT - dt);
          if (syncT > 25) {
            syncT = 0; rampT = 0;
            for (let i = 0; i < N; i++) ph[i] = Math.random();
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(sky, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < N; i++) {
            const b = Math.exp(-ph[i] * 10);
            const zz = z[i];
            const s = m * 0.1 * zz * (0.4 + b);
            ctx.globalAlpha = (0.05 + b * 0.95) * zz;
            ctx.drawImage(DK.glowSprite(hue[i], 0.9, 0.55, 64), x[i] - s / 2, y[i] - s / 2, s, s);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
