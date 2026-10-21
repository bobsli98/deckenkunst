/* Harmonograph: gedämpfte Pendel zeichnen eine Figur, Linie für Linie – dann verblasst sie und eine neue beginnt */
(function () {
  'use strict';
  const TAU = DK.TAU;
  const RATIOS = [[1, 1], [1, 2], [2, 3], [3, 4], [1, 3], [3, 5], [2, 5], [4, 5]];

  DK.register({
    id: 'harmonograph',
    name: 'Harmonograph',
    sub: 'Pendel, die Ornamente zeichnen',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      let fig = null, phase = 'zeichnen', hold = 0, fade = 0, count = 0;

      function newFigure() {
        const r = DK.pick(RATIOS);
        const base = DK.rand(1.6, 2.6);
        const det = () => DK.rand(-0.012, 0.012);
        const P = (f) => ({ f: base * f * (1 + det()), p: Math.random() * TAU, d: DK.rand(0.004, 0.012), A: DK.rand(0.3, 0.55) });
        fig = {
          x1: P(r[0]), x2: P(r[1]), y1: P(r[1]), y2: P(r[0]),
          rot: Math.random() < 0.5 ? DK.rand(-0.02, 0.02) : 0, tau: 0, hue: Math.random(), span: DK.rand(0.15, 0.6),
        };
        fig.y1.p = fig.x1.p + Math.PI / 2 + DK.rand(-0.4, 0.4);
        count++;
      }
      newFigure();

      function at(tau) {
        const f = fig;
        let x = f.x1.A * Math.sin(f.x1.f * tau + f.x1.p) * Math.exp(-f.x1.d * tau) + f.x2.A * Math.sin(f.x2.f * tau + f.x2.p) * Math.exp(-f.x2.d * tau);
        let y = f.y1.A * Math.sin(f.y1.f * tau + f.y1.p) * Math.exp(-f.y1.d * tau) + f.y2.A * Math.sin(f.y2.f * tau + f.y2.p) * Math.exp(-f.y2.d * tau);
        if (f.rot) { const a = f.rot * tau, c = Math.cos(a), s = Math.sin(a); const nx = x * c - y * s; y = x * s + y * c; x = nx; }
        return [x, y];
      }

      function clear() {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, env.w, env.h);
      }
      clear();

      return {
        resize() { clear(); newFigure(); phase = 'zeichnen'; },
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h) * 0.44;
          if (env.pointer.pulse) { clear(); newFigure(); phase = 'zeichnen'; }

          if (phase === 'zeichnen') {
            const steps = 160;
            const dTau = (dt * (9 + env.audio.level * 8)) / steps;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineWidth = Math.max(1, M * 0.0012);
            let [x0, y0] = at(fig.tau);
            const decay = Math.exp(-Math.min(fig.x1.d, fig.y1.d) * fig.tau);
            ctx.strokeStyle = DK.hsl(fig.hue + fig.tau * 0.002 * fig.span * 10, 0.7, 0.6, 0.22 * (0.5 + decay));
            ctx.beginPath();
            ctx.moveTo(w / 2 + x0 * M, h / 2 + y0 * M);
            for (let i = 0; i < steps; i++) {
              fig.tau += dTau;
              const [x, y] = at(fig.tau);
              ctx.lineTo(w / 2 + x * M, h / 2 + y * M);
            }
            ctx.stroke();
            if (decay < 0.06) { phase = 'halten'; hold = 0; }
          } else if (phase === 'halten') {
            hold += dt;
            if (hold > 6) { phase = 'blenden'; fade = 0; }
          } else {
            fade += dt;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            ctx.fillRect(0, 0, w, h);
            if (fade > 4) { clear(); newFigure(); phase = 'zeichnen'; }
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
