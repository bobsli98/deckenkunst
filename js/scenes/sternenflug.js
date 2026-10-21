/* Sternenflug: der klassische Warp-Bildschirmschoner – ab und zu geht es in den Hyperraum */
(function () {
  'use strict';

  DK.register({
    id: 'sternenflug',
    name: 'Sternenflug',
    sub: 'Volle Kraft voraus',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const N = Math.round(550 * env.q + 250);
      const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N), T = new Float32Array(N);
      const tint = DK.pick([[200, 220, 255], [255, 240, 220], [210, 255, 240]]);
      const reset = (i, far) => {
        X[i] = DK.rand(-1, 1); Y[i] = DK.rand(-1, 1);
        Z[i] = far ? DK.rand(0.8, 1) : DK.rand(0.05, 1);
        T[i] = Math.random();
      };
      for (let i = 0; i < N; i++) reset(i, false);
      let warp = 0, nextWarp = DK.rand(15, 30);
      const B = 5;
      const paths = new Array(B);

      return {
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.max(w, h) * 0.5;
          const cx = w / 2 + Math.sin(t * 0.07) * w * 0.05, cy = h / 2 + Math.cos(t * 0.05) * h * 0.05;
          nextWarp -= dt;
          if (nextWarp < 0 || env.pointer.pulse) { warp = 1; nextWarp = DK.rand(20, 40); }
          warp = Math.max(0, warp - dt * 0.3);
          const speed = 0.22 + DK.smooth(warp) * 1.6 + env.audio.level * 0.6;
          const streak = 0.02 + DK.smooth(warp) * 0.25;

          for (let b = 0; b < B; b++) paths[b] = new Path2D();
          for (let i = 0; i < N; i++) {
            Z[i] -= speed * dt;
            if (Z[i] < 0.02) { reset(i, true); continue; }
            const z0 = Math.min(1.2, Z[i] + streak);
            const x1 = cx + (X[i] / Z[i]) * M, y1 = cy + (Y[i] / Z[i]) * M;
            if (x1 < -50 || y1 < -50 || x1 > w + 50 || y1 > h + 50) { reset(i, true); continue; }
            const x0 = cx + (X[i] / z0) * M, y0 = cy + (Y[i] / z0) * M;
            const b = Math.min(B - 1, Math.floor((1 - Z[i]) * B));
            paths[b].moveTo(x0, y0);
            paths[b].lineTo(x1 + 0.01, y1);
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(0,0,${Math.round(8 * warp)},1)`;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'butt';
          for (let b = 0; b < B; b++) {
            const k = (b + 1) / B;
            ctx.lineWidth = 0.6 + k * 1.6;
            ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${(0.15 + k * 0.85).toFixed(2)})`;
            ctx.stroke(paths[b]);
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
