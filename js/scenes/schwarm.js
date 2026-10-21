/* Schwarm: Stare in der Dämmerung (Boids). Ein Greifvogel – oder ein Klick – reisst Löcher in die Wolke */
(function () {
  'use strict';
  const TAU = DK.TAU;

  DK.register({
    id: 'schwarm',
    name: 'Schwarm',
    sub: 'Tausend Vögel, ein Gedanke',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const M0 = Math.min(env.w, env.h);
      const N = Math.round(DK.clamp(((env.w * env.h) / (M0 * M0)) * 420, 300, 900) * env.q);
      const x = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
      const hueBase = DK.pick([0.08, 0.55, 0.62, 0.95, 0.13]);
      const palette = DK.pick(['Abendrot', 'Silber', 'Bunt']);
      let cellHead = new Int32Array(1), next = new Int32Array(N);
      let hawk = null, nextHawk = DK.rand(8, 16);

      for (let i = 0; i < N; i++) {
        const a = Math.random() * TAU, r = Math.random() * M0 * 0.2;
        x[i] = env.w / 2 + Math.cos(a) * r;
        y[i] = env.h / 2 + Math.sin(a) * r;
        const va = Math.random() * TAU;
        vx[i] = Math.cos(va) * M0 * 0.2;
        vy[i] = Math.sin(va) * M0 * 0.2;
      }

      const buckets = 10;
      const paths = [];

      return {
        info: `${N} Vögel · ${palette}`,
        render(t, dt, env) {
          const w = env.w, h = env.h, M = Math.min(w, h);
          const R = M * 0.075, R2 = R * R, Rs = M * 0.016, Rs2 = Rs * Rs;
          const vmax = M * 0.32 * (1 + env.audio.level * 0.4), vmin = vmax * 0.45;
          const cols = Math.ceil(w / R) + 1, rows = Math.ceil(h / R) + 1;
          if (cellHead.length < cols * rows) cellHead = new Int32Array(cols * rows);
          cellHead.fill(-1);
          for (let i = 0; i < N; i++) {
            const cx = DK.clamp((x[i] / R) | 0, 0, cols - 1), cy = DK.clamp((y[i] / R) | 0, 0, rows - 1);
            const c = cy * cols + cx;
            next[i] = cellHead[c];
            cellHead[c] = i;
          }

          // Greifvogel
          nextHawk -= dt;
          const p = env.pointer;
          if (p.pulse) hawk = { x: p.nx * w, y: p.ny * h, vx: 0, vy: 0, life: 2.5 };
          if (!hawk && nextHawk < 0) {
            const a = Math.random() * TAU;
            hawk = { x: w / 2 - Math.cos(a) * w * 0.7, y: h / 2 - Math.sin(a) * h * 0.7, vx: Math.cos(a) * vmax * 1.3, vy: Math.sin(a) * vmax * 1.3, life: 8 };
          }
          if (hawk) {
            hawk.x += hawk.vx * dt; hawk.y += hawk.vy * dt; hawk.life -= dt;
            if (hawk.life < 0) { hawk = null; nextHawk = DK.rand(10, 22); }
          }
          const fleeR = M * 0.16;

          const mg = M * 0.1;
          for (let i = 0; i < N; i++) {
            const xi = x[i], yi = y[i];
            let n = 0, ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0;
            const gx = DK.clamp((xi / R) | 0, 0, cols - 1), gy = DK.clamp((yi / R) | 0, 0, rows - 1);
            for (let oy = -1; oy <= 1; oy++) {
              const yy = gy + oy;
              if (yy < 0 || yy >= rows) continue;
              for (let ox = -1; ox <= 1; ox++) {
                const xx = gx + ox;
                if (xx < 0 || xx >= cols) continue;
                for (let j = cellHead[yy * cols + xx]; j !== -1; j = next[j]) {
                  if (j === i) continue;
                  const dx = x[j] - xi, dy = y[j] - yi, d2 = dx * dx + dy * dy;
                  if (d2 > R2) continue;
                  n++;
                  ax += vx[j]; ay += vy[j]; cx += x[j]; cy += y[j];
                  if (d2 < Rs2 && d2 > 0) { const d = Math.sqrt(d2); sx -= (dx / d) * (1 - d / Rs); sy -= (dy / d) * (1 - d / Rs); }
                }
              }
            }
            let fx = 0, fy = 0;
            if (n) {
              fx += (ax / n - vx[i]) * 1.8 + (cx / n - xi) * 1.8;
              fy += (ay / n - vy[i]) * 1.8 + (cy / n - yi) * 1.8;
            }
            fx += sx * vmax * 7; fy += sy * vmax * 7;
            // weich am Bildrand umkehren
            if (xi < mg) fx += (mg - xi) * 6; else if (xi > w - mg) fx -= (xi - (w - mg)) * 6;
            if (yi < mg) fy += (mg - yi) * 6; else if (yi > h - mg) fy -= (yi - (h - mg)) * 6;
            if (hawk) {
              const dx = xi - hawk.x, dy = yi - hawk.y, d = Math.hypot(dx, dy);
              if (d < fleeR && d > 0) { const k = (1 - d / fleeR) * vmax * 12; fx += (dx / d) * k; fy += (dy / d) * k; }
            }
            let nvx = vx[i] + fx * dt, nvy = vy[i] + fy * dt;
            const sp = Math.hypot(nvx, nvy) || 1;
            const cl = DK.clamp(sp, vmin, vmax) / sp;
            vx[i] = nvx * cl; vy[i] = nvy * cl;
          }
          for (let i = 0; i < N; i++) { x[i] += vx[i] * dt; y[i] += vy[i] * dt; }

          // Zeichnen: leichter Nachzieheffekt, Vögel als kurze Striche
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1.2, M * 0.0035);
          for (let b = 0; b < buckets; b++) paths[b] = new Path2D();
          const len = M * 0.012 / vmax;
          for (let i = 0; i < N; i++) {
            const a = Math.atan2(vy[i], vx[i]);
            const b = Math.floor(DK.wrap01(a / TAU) * buckets) % buckets;
            paths[b].moveTo(x[i] - vx[i] * len, y[i] - vy[i] * len);
            paths[b].lineTo(x[i] + vx[i] * len * 0.3, y[i] + vy[i] * len * 0.3);
          }
          for (let b = 0; b < buckets; b++) {
            let hh = hueBase, s = 0.7, l = 0.62;
            if (palette === 'Silber') { s = 0.15; l = 0.55 + 0.25 * Math.sin((b / buckets) * TAU); }
            else if (palette === 'Bunt') hh = env.hue + b / buckets;
            else hh = hueBase + 0.06 * Math.sin((b / buckets) * TAU);
            ctx.strokeStyle = DK.hsl(hh, s, l, 0.85);
            ctx.stroke(paths[b]);
          }
          if (hawk) {
            const s = M * 0.04;
            ctx.globalAlpha = 0.5;
            ctx.drawImage(DK.glowSprite(0.02, 0.9, 0.5), hawk.x - s, hawk.y - s, s * 2, s * 2);
            ctx.globalAlpha = 1;
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
