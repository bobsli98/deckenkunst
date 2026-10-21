/* Oszilloskop: Lissajous-Figuren und Rosetten auf nachleuchtendem Phosphor */
(function () {
  'use strict';
  const TAU = DK.TAU;
  const PHOSPHOR = [
    { n: 'Grüner Phosphor', h: 0.33, s: 0.9 },
    { n: 'Bernstein', h: 0.09, s: 0.95 },
    { n: 'Kaltes Blau', h: 0.55, s: 0.8 },
  ];
  const MODES = ['Lissajous', 'Rosette', 'Harmonie'];

  DK.register({
    id: 'oszilloskop',
    name: 'Oszilloskop',
    sub: 'Musik, die man sehen kann',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const P = DK.pick(PHOSPHOR);
      let mode = DK.pick(MODES);
      let a = DK.randInt(1, 5), b = DK.randInt(1, 5), na = a, nb = b, mt = 1, ph = 0, changeT = DK.rand(8, 14);
      let grid = null;

      function buildGrid() {
        grid = document.createElement('canvas');
        grid.width = env.w; grid.height = env.h;
        const g = grid.getContext('2d');
        const M = Math.min(env.w, env.h) * 0.9;
        const x0 = (env.w - M) / 2, y0 = (env.h - M) / 2;
        g.strokeStyle = DK.hsl(P.h, P.s, 0.5, 0.09);
        g.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
          g.beginPath(); g.moveTo(x0 + (i / 10) * M, y0); g.lineTo(x0 + (i / 10) * M, y0 + M); g.stroke();
          g.beginPath(); g.moveTo(x0, y0 + (i / 10) * M); g.lineTo(x0 + M, y0 + (i / 10) * M); g.stroke();
        }
        g.strokeStyle = DK.hsl(P.h, P.s, 0.5, 0.16);
        for (let i = 0; i <= 50; i++) {
          const x = x0 + (i / 50) * M, y = y0 + (i / 50) * M;
          g.beginPath(); g.moveTo(x, env.h / 2 - 4); g.lineTo(x, env.h / 2 + 4); g.stroke();
          g.beginPath(); g.moveTo(env.w / 2 - 4, y); g.lineTo(env.w / 2 + 4, y); g.stroke();
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, env.w, env.h);
      }
      buildGrid();

      function point(tau, A, B) {
        if (mode === 'Lissajous') return [Math.sin(A * tau + ph), Math.sin(B * tau)];
        if (mode === 'Rosette') {
          const r = Math.cos((A / B) * tau + ph * 0.3);
          return [r * Math.cos(tau), r * Math.sin(tau)];
        }
        return [
          (Math.sin(A * tau + ph) + 0.3 * Math.sin(3 * A * tau)) / 1.3,
          (Math.sin(B * tau) + 0.3 * Math.cos(5 * B * tau + ph)) / 1.3,
        ];
      }

      return {
        get info() { return `${P.n} · ${mode}`; },
        resize() { buildGrid(); },
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h) * 0.42 * (1 + env.audio.level * 0.25);
          changeT -= dt;
          if (changeT < 0 || env.pointer.pulse) {
            changeT = DK.rand(9, 15);
            a = na; b = nb; mt = 0;
            do { na = DK.randInt(1, 6); nb = DK.randInt(1, 6); } while (na === nb);
            if (env.pointer.pulse || Math.random() < 0.25) mode = DK.pick(MODES);
          }
          mt = Math.min(1, mt + dt / 5);
          const k = DK.smooth(mt);
          const A = DK.lerp(a, na, k), B = DK.lerp(b, nb, k);
          ph += dt * (0.5 + env.audio.bass * 2);

          // Nachleuchten des Phosphors
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.fillRect(0, 0, w, h);

          const N = 600;
          const span = mode === 'Rosette' ? TAU * Math.max(1, Math.round(B)) : TAU;
          const path = new Path2D();
          for (let i = 0; i <= N; i++) {
            const [x, y] = point((i / N) * span, A, B);
            const X = w / 2 + x * M, Y = h / 2 + y * M;
            i === 0 ? path.moveTo(X, Y) : path.lineTo(X, Y);
          }
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineJoin = 'round';
          const passes = [[M * 0.011, 0.2, 0.5], [Math.max(1.2, M * 0.003), 0.85, 0.8]];
          for (const [lw, al, l] of passes) {
            ctx.lineWidth = lw;
            ctx.strokeStyle = DK.hsl(P.h, P.s, l, al);
            ctx.stroke(path);
          }
          ctx.globalAlpha = 0.6;
          ctx.drawImage(grid, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
