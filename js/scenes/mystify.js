/* Mystify: der Windows-Bildschirmschoner – springende Vielecke mit Nachbildern */
(function () {
  'use strict';

  DK.register({
    id: 'mystify',
    name: 'Mystify',
    sub: 'Bildschirmschoner, Jahrgang 1992',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const nShapes = DK.randInt(2, 3);
      const V = DK.pick([4, 4, 5]);
      const TRAIL = 16;
      const shapes = [];
      for (let s = 0; s < nShapes; s++) {
        const pts = [];
        for (let v = 0; v < V; v++) {
          const a = Math.random() * DK.TAU;
          pts.push({ x: Math.random() * env.w, y: Math.random() * env.h, vx: Math.cos(a) * DK.rand(0.6, 1.2), vy: Math.sin(a) * DK.rand(0.6, 1.2) });
        }
        shapes.push({ pts, hist: [], hue: Math.random() });
      }
      let snapT = 0;

      return {
        info: `${nShapes} × ${V} Ecken`,
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h);
          const sp = M * 0.32 * (1 + env.audio.level * 1.5);
          for (const s of shapes) {
            for (const p of s.pts) {
              p.x += p.vx * sp * dt; p.y += p.vy * sp * dt;
              if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); } else if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx); }
              if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); } else if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy); }
            }
            s.hue = (s.hue + dt * 0.03) % 1;
          }
          if (env.pointer.pulse) for (const s of shapes) for (const p of s.pts) { const a = Math.random() * DK.TAU; p.vx = Math.cos(a); p.vy = Math.sin(a); }
          snapT += dt;
          if (snapT > 0.05) {
            snapT = 0;
            for (const s of shapes) {
              s.hist.push(s.pts.map((p) => [p.x, p.y]));
              if (s.hist.length > TRAIL) s.hist.shift();
            }
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineWidth = Math.max(1.5, M * 0.0025);
          ctx.lineJoin = 'round';
          for (const s of shapes) {
            const n = s.hist.length;
            for (let k = 0; k < n; k++) {
              const poly = s.hist[k];
              const a = (k + 1) / n;
              ctx.strokeStyle = DK.hsl(s.hue + k * 0.006, 0.9, 0.6, a * a * 0.9);
              ctx.beginPath();
              ctx.moveTo(poly[0][0], poly[0][1]);
              for (let v = 1; v < poly.length; v++) ctx.lineTo(poly[v][0], poly[v][1]);
              ctx.closePath();
              ctx.stroke();
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
