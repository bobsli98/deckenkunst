/* Ensō: Zen-Kreise, in einem Atemzug mit trockenem Pinsel gezogen – mit rotem Namensstempel */
(function () {
  'use strict';
  const TAU = DK.TAU;

  DK.register({
    id: 'enso',
    name: 'Ensō',
    sub: 'Ein Kreis, ein Atemzug',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const ink = DK.pick(['Weiss', 'Gold', 'Farbe']);
      const items = [];
      let nextT = 0.5;
      const BR = 40; // Borsten

      function newEnso() {
        const M = Math.min(env.w, env.h);
        const R = M * DK.rand(0.14, 0.3);
        const size = Math.ceil(R * 2.8);
        const c = document.createElement('canvas');
        c.width = c.height = size;
        // nicht mit bestehenden Kreisen kollidieren, wenn möglich
        let x = 0, y = 0;
        for (let k = 0; k < 10; k++) {
          x = DK.rand(R * 1.2, env.w - R * 1.2); y = DK.rand(R * 1.2, env.h - R * 1.2);
          if (items.every((o) => Math.hypot(o.x - x, o.y - y) > (o.R + R) * 0.9)) break;
        }
        const bristles = [];
        for (let b = 0; b < BR; b++) {
          // Borsten ungleichmässig verteilt; aussen trocknen sie schneller aus
          const o = Math.sign(Math.random() - 0.5) * Math.pow(Math.random(), 0.8);
          bristles.push({ o, ink: DK.rand(0.7, 1.1), dry: DK.rand(0.4, 1.4) * (0.6 + Math.abs(o)), w: DK.rand(0.6, 1.5), ph: Math.random() * 50 });
        }
        let col;
        if (ink === 'Weiss') col = [235, 232, 222];
        else if (ink === 'Gold') col = [235, 190, 110];
        else col = DK.hsv2rgb(env.hue + Math.random() * 0.3, 0.55, 0.95).map((v) => v * 255);
        items.push({
          c, g: c.getContext('2d'), x, y, R, size, a0: Math.random() * TAU, sweep: DK.rand(1.75, 1.95) * Math.PI,
          dir: Math.random() < 0.5 ? 1 : -1, prog: 0, speed: DK.rand(0.22, 0.38), wob: Math.random() * 10,
          bristles, col, state: 'malen', age: 0, alpha: 1, seal: false,
        });
      }

      function paint(it, from, to) {
        const g = it.g, ctr = it.size / 2;
        const steps = Math.max(2, Math.ceil(((to - from) * it.sweep * it.R) / 1.2));
        const Wmax = it.R * 0.22;
        for (let s = 0; s <= steps; s++) {
          const u = from + ((to - from) * s) / steps;
          const a = it.a0 + it.dir * u * it.sweep;
          // Druck: kräftiger Ansatz, dann ausdünnend
          const press = Math.min(1, u * 12) * (1 - Math.pow(u, 2.2) * 0.75);
          const rr = it.R * (1 + 0.04 * Math.sin(u * 7 + it.wob) + 0.02 * Math.sin(u * 23));
          const cx = ctr + Math.cos(a) * rr, cy = ctr + Math.sin(a) * rr;
          const nx = Math.cos(a), ny = Math.sin(a);
          const W = Wmax * press;
          for (const b of it.bristles) {
            const left = b.ink - u * b.dry;
            if (left <= 0) continue;
            // trockener Pinsel: die Borste setzt immer öfter aus
            if (Math.random() > Math.min(1, left * 2.2)) continue;
            const jit = Math.sin(u * 40 + b.ph) * 0.06 + (Math.random() - 0.5) * 0.05;
            const off = (b.o + jit) * W * 0.5;
            g.fillStyle = `rgba(${it.col[0] | 0},${it.col[1] | 0},${it.col[2] | 0},${Math.min(0.55, left * 0.35).toFixed(3)})`;
            const r = Math.max(0.6, (W / BR) * 1.6 * b.w);
            g.beginPath();
            g.arc(cx + nx * off, cy + ny * off, r, 0, TAU);
            g.fill();
          }
        }
      }

      function stamp(it) {
        const g = it.g, ctr = it.size / 2;
        const a = it.a0 + it.dir * it.sweep * 1.04;
        const s = it.R * 0.16;
        const x = ctr + Math.cos(a) * it.R * 1.15, y = ctr + Math.sin(a) * it.R * 1.15;
        g.save();
        g.translate(x, y);
        g.rotate(DK.rand(-0.1, 0.1));
        g.fillStyle = 'rgba(200,30,35,0.9)';
        g.fillRect(-s / 2, -s / 2, s, s);
        g.strokeStyle = 'rgba(255,220,210,0.85)';
        g.lineWidth = Math.max(1, s * 0.08);
        g.strokeRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
        g.beginPath();
        g.moveTo(-s * 0.15, -s * 0.2); g.lineTo(-s * 0.15, s * 0.22);
        g.moveTo(s * 0.12, -s * 0.22); g.lineTo(s * 0.12, s * 0.2);
        g.moveTo(-s * 0.22, 0); g.lineTo(s * 0.22, 0);
        g.stroke();
        g.restore();
      }

      return {
        info: `Tusche: ${ink}`,
        render(t, dt, env) {
          nextT -= dt;
          const painting = items.some((i) => i.state === 'malen');
          if ((nextT < 0 && !painting) || env.pointer.pulse) { newEnso(); nextT = DK.rand(4, 9); }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#020203';
          ctx.fillRect(0, 0, env.w, env.h);
          ctx.globalCompositeOperation = 'lighter';

          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i];
            it.age += dt;
            if (it.state === 'malen') {
              // langsam ansetzen, zügig ziehen, langsam abheben
              const sp = it.speed * (0.45 + Math.sin(Math.PI * it.prog) * 0.9);
              const np = Math.min(1, it.prog + sp * dt);
              paint(it, it.prog, np);
              it.prog = np;
              if (np >= 1) { it.state = 'ruhen'; it.age = 0; }
            } else if (it.state === 'ruhen') {
              if (!it.seal && it.age > 0.8) { stamp(it); it.seal = true; }
              if (it.age > DK.rand(12, 16)) it.state = 'gehen';
            } else {
              it.alpha -= dt / 6;
              if (it.alpha <= 0) { items.splice(i, 1); continue; }
            }
            ctx.globalAlpha = it.alpha;
            ctx.drawImage(it.c, it.x - it.size / 2, it.y - it.size / 2);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
