/* Komorebi (木漏れ日): Sonnenlicht, das durch ein sich wiegendes Blätterdach fällt */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const MOODS = [
    { n: 'Sommerlaub', hue: 95, sat: 55, shape: 'oval', sky: ['#fffbe8', '#e9f3c8', '#9cbf72'] },
    { n: 'Ahorn im Herbst', hue: 22, sat: 85, shape: 'ahorn', sky: ['#fff6e0', '#f6dcaa', '#c98c55'] },
    { n: 'Frühlingsgrün', hue: 85, sat: 60, shape: 'oval', sky: ['#fbfff2', '#e6f5d5', '#a8cf8c'] },
    { n: 'Ahorn im Sommer', hue: 100, sat: 50, shape: 'ahorn', sky: ['#fffbe8', '#e5f0c8', '#93b86d'] },
  ];

  function leafSprite(hue, sat, light, shape) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.translate(48, 48);
    g.beginPath();
    if (shape === 'ahorn') {
      // siebenlappiges Ahornblatt
      const lobes = 7;
      for (let i = 0; i <= lobes * 2; i++) {
        const a = -Math.PI / 2 + ((i / (lobes * 2)) - 0.5) * Math.PI * 1.7;
        const r = i % 2 === 0 ? 44 * (1 - Math.abs(i / (lobes * 2) - 0.5) * 0.7) : 18;
        const x = Math.cos(a) * r, y = Math.sin(a) * r + 8;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.closePath();
    } else {
      g.moveTo(0, 44);
      g.bezierCurveTo(30, 20, 26, -24, 0, -44);
      g.bezierCurveTo(-26, -24, -30, 20, 0, 44);
    }
    const grd = g.createRadialGradient(0, 0, 4, 0, 0, 46);
    grd.addColorStop(0, `hsl(${hue}, ${sat}%, ${Math.min(90, light * 1.35)}%)`);
    grd.addColorStop(1, `hsl(${hue - 8}, ${sat}%, ${light * 0.7}%)`);
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = `hsla(${hue}, ${sat}%, ${Math.min(95, light * 1.6)}%, 0.45)`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 44); g.lineTo(0, -38);
    for (let k = -1; k <= 1; k += 2) for (let y = 24; y > -30; y -= 14) { g.moveTo(0, y); g.lineTo(k * 18, y - 14); }
    g.stroke();
    return c;
  }

  DK.register({
    id: 'komorebi',
    name: 'Komorebi',
    sub: 'Licht, das durch Blätter fällt',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const mood = DK.pick(MOODS);
      // drei Schichten: hinten hell und durchscheinend, vorne dunkel
      const sprites = [
        leafSprite(mood.hue, mood.sat, 62, mood.shape),
        leafSprite(mood.hue, mood.sat, 42, mood.shape),
        leafSprite(mood.hue, mood.sat * 0.8, 20, mood.shape),
      ];
      let sky, W, H, M, sun;
      const leaves = [], twigs = [], bokeh = [];

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        sun = { x: W * DK.rand(0.3, 0.7), y: H * DK.rand(0.3, 0.7) };
        sky = document.createElement('canvas');
        sky.width = W; sky.height = H;
        const g = sky.getContext('2d');
        const grd = g.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, Math.max(W, H) * 0.8);
        grd.addColorStop(0, mood.sky[0]);
        grd.addColorStop(0.35, mood.sky[1]);
        grd.addColorStop(1, mood.sky[2]);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);

        leaves.length = 0; twigs.length = 0; bokeh.length = 0;
        const clusters = Math.round(DK.rand(26, 34) * (W * H) / (M * M) * 0.6);
        for (let L = 0; L < 3; L++) {
          for (let c = 0; c < clusters; c++) {
            // Büschel bleiben eher am Rand, damit in der Mitte Licht durchkommt
            const a = Math.random() * TAU, rr = Math.pow(Math.random(), 0.45) * Math.hypot(W, H) * 0.55;
            const cx = W / 2 + Math.cos(a) * rr, cy = H / 2 + Math.sin(a) * rr;
            const n = Math.round(DK.rand(12, 22) * (0.6 + env.q * 0.4));
            const twigA = Math.atan2(cy - H / 2, cx - W / 2);
            twigs.push({ L, x: cx, y: cy, a: twigA, len: M * DK.rand(0.15, 0.3) });
            for (let i = 0; i < n; i++) {
              const d = Math.sqrt(Math.random()) * M * 0.13;
              const aa = Math.random() * TAU;
              leaves.push({
                L, x: cx + Math.cos(aa) * d, y: cy + Math.sin(aa) * d,
                s: M * DK.rand(0.05, 0.085) * (0.8 + L * 0.25), rot: aa + DK.rand(-0.5, 0.5), ph: Math.random() * TAU,
              });
            }
          }
        }
        leaves.sort((p, q) => p.L - q.L);
        for (let i = 0; i < 14; i++) {
          bokeh.push({ x: sun.x + DK.rand(-0.5, 0.5) * W, y: sun.y + DK.rand(-0.5, 0.5) * H, r: M * DK.rand(0.02, 0.07), ph: Math.random() * TAU });
        }
      }
      build();

      return {
        info: mood.n,
        resize() { build(); },
        render(t, dt, env) {
          const wind = 1 + env.audio.level + Math.max(0, noise(t * 0.08, 2, 0)) * 1.5;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(sky, 0, 0);

          // Sonnenschein hinter dem Laub
          ctx.globalCompositeOperation = 'lighter';
          const ss = M * 0.7;
          ctx.globalAlpha = 0.45;
          ctx.drawImage(DK.glowSprite(0.14, 0.5, 0.75, 128), sun.x - ss / 2, sun.y - ss / 2, ss, ss);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';

          for (let L = 0; L < 3; L++) {
            const amp = M * 0.006 * (L + 1) * wind;
            const ox = Math.sin(t * (0.4 + L * 0.13)) * amp, oy = Math.cos(t * (0.33 + L * 0.11)) * amp;
            // Zweige
            ctx.strokeStyle = `hsla(${mood.hue - 40}, 30%, ${L === 2 ? 8 : 18 + (2 - L) * 12}%, ${0.5 + L * 0.2})`;
            ctx.lineCap = 'round';
            for (const tw of twigs) {
              if (tw.L !== L) continue;
              ctx.lineWidth = M * 0.004 * (1 + L);
              ctx.beginPath();
              ctx.moveTo(tw.x + Math.cos(tw.a) * tw.len + ox * 0.5, tw.y + Math.sin(tw.a) * tw.len + oy * 0.5);
              ctx.lineTo(tw.x + ox, tw.y + oy);
              ctx.stroke();
            }
            ctx.globalAlpha = L === 0 ? 0.75 : L === 1 ? 0.9 : 1;
            const spr = sprites[L];
            for (const lf of leaves) {
              if (lf.L !== L) continue;
              const fl = Math.sin(t * 1.8 * wind + lf.ph) * 0.15;
              ctx.setTransform(1, 0, 0, 1, lf.x + ox, lf.y + oy);
              ctx.rotate(lf.rot + fl);
              ctx.scale(0.75 + 0.25 * Math.cos(t * 1.3 + lf.ph), 1);
              ctx.drawImage(spr, -lf.s / 2, -lf.s / 2, lf.s, lf.s);
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }

          // Sonnentaler und Lichtflecken vor der Linse
          ctx.globalCompositeOperation = 'lighter';
          for (const b of bokeh) {
            const k = 0.5 + 0.5 * Math.sin(t * 0.7 + b.ph);
            ctx.globalAlpha = 0.06 + 0.1 * k;
            ctx.drawImage(DK.glowSprite(0.13, 0.4, 0.8, 64), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
