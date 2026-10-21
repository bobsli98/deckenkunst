/* Eisblumen: Frost wächst in farnartigen Kristallen über eine Dachluke – und taut wieder ab */
(function () {
  'use strict';
  const TAU = DK.TAU;

  DK.register({
    id: 'eisblumen',
    name: 'Eisblumen',
    sub: 'Kristalle, die über Nacht wachsen',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      let frost, fctx, bg, W, H, M, occ, OW, OH, cell;
      let tips = [], phase = 'wachsen', phaseT = 0, sparkles = [];
      const maxTips = Math.round(900 * env.q + 300);
      const tint = DK.pick([[200, 225, 255], [215, 240, 255], [225, 215, 255]]);

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        frost = document.createElement('canvas');
        frost.width = W; frost.height = H;
        fctx = frost.getContext('2d');
        fctx.lineCap = 'round';
        bg = document.createElement('canvas');
        bg.width = W; bg.height = H;
        const g = bg.getContext('2d');
        const grd = g.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
        grd.addColorStop(0, 'hsl(220, 45%, 10%)');
        grd.addColorStop(1, 'hsl(230, 50%, 2%)');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 40; i++) {
          g.globalAlpha = DK.rand(0.3, 0.9);
          g.fillStyle = 'rgba(230,235,255,0.8)';
          g.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
        }
        cell = Math.max(3, Math.round(M / 180));
        OW = Math.ceil(W / cell); OH = Math.ceil(H / cell);
        occ = new Uint8Array(OW * OH);
        tips = [];
        sparkles = [];
        phase = 'wachsen'; phaseT = 0;
        seed(DK.randInt(4, 8), true);
      }

      function seed(n, edges) {
        for (let i = 0; i < n; i++) {
          let x, y, a;
          if (edges) {
            const side = DK.randInt(0, 3);
            x = side === 0 ? 0 : side === 1 ? W : Math.random() * W;
            y = side === 2 ? 0 : side === 3 ? H : Math.random() * H;
            a = Math.atan2(H / 2 - y, W / 2 - x) + DK.rand(-0.6, 0.6);
          } else {
            x = Math.random() * W; y = Math.random() * H; a = Math.random() * TAU;
          }
          // Kristallkeim: mehrere Hauptarme im 60°-Raster
          const arms = edges ? DK.randInt(2, 4) : 6;
          for (let k = 0; k < arms; k++) {
            tips.push({ x, y, a: a + (edges ? DK.rand(-0.5, 0.5) : (k / 6) * TAU), len: M * DK.rand(0.15, 0.4), gen: 0, s: Math.random() * 100 });
          }
        }
      }

      build();

      return {
        resize() { build(); },
        render(t, dt, env) {
          const p = env.pointer;
          phaseT += dt;
          if (p.pulse) seed(1, false);

          if (phase === 'wachsen') {
            const step = M * 0.0035;
            const iters = 2;
            fctx.globalCompositeOperation = 'lighter';
            for (let it = 0; it < iters; it++) {
              const paths = [new Path2D(), new Path2D(), new Path2D()];
              const next = [];
              for (const tp of tips) {
                const nx = tp.x + Math.cos(tp.a) * step, ny = tp.y + Math.sin(tp.a) * step;
                const ox = (nx / cell) | 0, oy = (ny / cell) | 0;
                if (ox < 0 || oy < 0 || ox >= OW || oy >= OH) continue;
                const oi = oy * OW + ox;
                // zu dicht? dann endet der Ast
                if (occ[oi] > 2 && tp.gen > 0) continue;
                occ[oi]++;
                paths[Math.min(2, tp.gen)].moveTo(tp.x, tp.y);
                paths[Math.min(2, tp.gen)].lineTo(nx, ny);
                tp.x = nx; tp.y = ny;
                tp.a += noise(tp.s, tp.len * 0.02, 0) * 0.05;
                tp.len -= step;
                if (tp.len <= 0) continue;
                next.push(tp);
                // Seitenäste im 60°-Winkel, wie bei echtem Eis
                if (tp.gen < 3 && next.length + 2 < maxTips && Math.random() < 0.09 - tp.gen * 0.015) {
                  const side = Math.random() < 0.5 ? 1 : -1;
                  next.push({ x: nx, y: ny, a: tp.a + side * (Math.PI / 3 + DK.rand(-0.08, 0.08)), len: tp.len * DK.rand(0.25, 0.55), gen: tp.gen + 1, s: Math.random() * 100 });
                  if (Math.random() < 0.5) sparkles.push({ x: nx, y: ny, ph: Math.random() * TAU });
                }
              }
              tips = next;
              for (let gI = 0; gI < 3; gI++) {
                fctx.lineWidth = Math.max(0.7, (M / 500) * (2.2 - gI * 0.55));
                fctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${0.4 - gI * 0.08})`;
                fctx.stroke(paths[gI]);
              }
            }
            if (Math.random() < dt * 0.25) seed(1, Math.random() < 0.5);
            if (phaseT > 70 || (tips.length === 0 && phaseT > 20)) { phase = 'halten'; phaseT = 0; }
          } else if (phase === 'halten') {
            if (phaseT > 15) { phase = 'tauen'; phaseT = 0; }
          } else {
            // Tauwetter: der Frost verblasst von innen nach aussen
            fctx.globalCompositeOperation = 'destination-out';
            fctx.fillStyle = `rgba(0,0,0,${(dt * 0.25).toFixed(4)})`;
            fctx.fillRect(0, 0, W, H);
            fctx.globalCompositeOperation = 'source-over';
            sparkles.length = Math.max(0, sparkles.length - Math.ceil(sparkles.length * dt * 0.3));
            if (phaseT > 10) build();
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(frost, 0, 0);
          // funkelnde Kristallspitzen
          const gs = DK.glowSprite(0.58, 0.3, 0.7, 32);
          const s = M * 0.012;
          for (let i = 0; i < sparkles.length; i += 3) {
            const sp = sparkles[i];
            const b = Math.max(0, Math.sin(t * 1.7 + sp.ph));
            if (b < 0.6) continue;
            ctx.globalAlpha = (b - 0.6) * 2;
            ctx.drawImage(gs, sp.x - s / 2, sp.y - s / 2, s, s);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
