/* Bambushain: im Hain liegen und nach oben schauen – die Halme laufen zum Himmel zusammen und wiegen sich im Wind */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const TIMES = [
    { n: 'Morgenlicht', sky: ['#f6fbe6', '#b9d99a', '#2b4a22'], stalk: [92, 0.42, 0.42], leaf: [95, 0.5, 0.3], haze: 'rgba(225,240,205,', rays: true },
    { n: 'Mittagssonne', sky: ['#fffdf0', '#d4e9a6', '#3a5a26'], stalk: [80, 0.45, 0.45], leaf: [88, 0.55, 0.32], haze: 'rgba(240,248,215,', rays: true },
    { n: 'Mondnacht', sky: ['#c8d6ff', '#33456e', '#05080f'], stalk: [150, 0.2, 0.22], leaf: [160, 0.25, 0.14], haze: 'rgba(120,140,200,', rays: false },
    { n: 'Nebel', sky: ['#eef2ec', '#bcc8bb', '#56635a'], stalk: [110, 0.18, 0.4], leaf: [115, 0.2, 0.3], haze: 'rgba(225,232,225,', rays: false },
  ];

  // Blätterbüschel: mehrere schmale Lanzettblätter, die aus einem Punkt fächern
  const sprayCache = {};
  function spray(c, key) {
    if (sprayCache[key]) return sprayCache[key];
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const g = cv.getContext('2d');
    g.translate(64, 120);
    const n = 5 + (key.charCodeAt(1) % 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 1.6 + DK.rand(-0.1, 0.1);
      const L = DK.rand(70, 105), W = DK.rand(6, 9);
      g.save();
      g.rotate(a + Math.PI / 2);
      const grd = g.createLinearGradient(0, 0, 0, -L);
      grd.addColorStop(0, `hsl(${c[0]}, ${c[1] * 100}%, ${c[2] * 70}%)`);
      grd.addColorStop(0.6, `hsl(${c[0]}, ${c[1] * 100}%, ${c[2] * 100}%)`);
      grd.addColorStop(1, `hsla(${c[0] - 10}, ${c[1] * 100}%, ${c[2] * 130}%, 0.85)`);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(W, -L * 0.45, 0, -L);
      g.quadraticCurveTo(-W, -L * 0.45, 0, 0);
      g.fill();
      g.restore();
    }
    return (sprayCache[key] = cv);
  }

  DK.register({
    id: 'bambushain',
    name: 'Bambushain',
    sub: 'Arashiyama, von unten',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const T = DK.pick(TIMES);
      const N = Math.round(30 * env.q + 14);
      const stalks = [];
      let sky, W, H, M, C;
      const gusts = [];
      let nextGust = DK.rand(4, 9);

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        C = { x: W / 2 + DK.rand(-0.08, 0.08) * W, y: H / 2 + DK.rand(-0.08, 0.08) * H };
        const R = Math.hypot(W, H) * 0.65;
        sky = document.createElement('canvas');
        sky.width = W; sky.height = H;
        const g = sky.getContext('2d');
        const grd = g.createRadialGradient(C.x, C.y, 0, C.x, C.y, R);
        grd.addColorStop(0, T.sky[0]);
        grd.addColorStop(0.3, T.sky[1]);
        grd.addColorStop(1, T.sky[2]);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        if (T.rays) {
          g.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 9; i++) {
            const a = Math.random() * TAU, wd = DK.rand(0.04, 0.12);
            g.fillStyle = 'rgba(255,250,215,0.05)';
            g.beginPath();
            g.moveTo(C.x, C.y);
            g.arc(C.x, C.y, R, a, a + wd);
            g.closePath();
            g.fill();
          }
        }
        stalks.length = 0;
        for (let i = 0; i < N; i++) {
          const depth = Math.random(); // 0 = fern, 1 = nah
          const a = Math.random() * TAU;
          stalks.push({
            a, depth,
            base: R * DK.rand(1.0, 1.2),
            top: M * DK.lerp(0.25, 0.05, depth) * DK.rand(0.7, 1.3),
            wb: M * DK.lerp(0.012, 0.075, depth * depth),
            ph: Math.random() * TAU, f: DK.rand(0.25, 0.45),
            sprays: Array.from({ length: DK.randInt(3, 7) }, () => ({ t: DK.rand(0.62, 0.98), side: Math.random() < 0.5 ? 1 : -1, s: DK.rand(0.7, 1.3), k: 'k' + DK.randInt(0, 3) })),
          });
        }
        stalks.sort((p, q) => p.depth - q.depth);
      }
      build();

      // Punkt entlang eines Halms: u = 0 unten (Bildrand), 1 oben (beim Himmel)
      function at(s, u, sway) {
        const r = DK.lerp(s.base, s.top, Math.pow(u, 0.85));
        const a = s.a + sway * u * u;
        return [C.x + Math.cos(a) * r, C.y + Math.sin(a) * r, a];
      }

      return {
        info: T.n,
        resize() { build(); },
        render(t, dt, env) {
          nextGust -= dt;
          if (nextGust < 0 || env.pointer.pulse) {
            nextGust = DK.rand(5, 12);
            gusts.push({ a: env.pointer.pulse ? Math.atan2(env.pointer.ny * H - C.y, env.pointer.nx * W - C.x) : Math.random() * TAU, t: 0 });
          }
          for (let i = gusts.length - 1; i >= 0; i--) { gusts[i].t += dt; if (gusts[i].t > 6) gusts.splice(i, 1); }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(sky, 0, 0);

          let lastDepth = 0;
          for (const s of stalks) {
            // Dunst zwischen den Tiefenschichten
            if (s.depth - lastDepth > 0.25) {
              ctx.fillStyle = T.haze + '0.12)';
              ctx.fillRect(0, 0, W, H);
              lastDepth = s.depth;
            }
            let sway = Math.sin(t * s.f + s.ph) * 0.03 + noise(s.a, t * 0.1, 0) * 0.02;
            for (const gu of gusts) {
              // die Böe läuft rundherum durch den Hain
              const front = gu.a + gu.t * 1.2;
              const d = Math.abs(Math.atan2(Math.sin(s.a - front), Math.cos(s.a - front)));
              sway += Math.exp(-d * d * 4) * 0.08 * Math.sin(gu.t * 3) * Math.exp(-gu.t * 0.4);
            }
            sway *= 1 + env.audio.level;

            // Halm als schmaler werdendes Band mit Licht- und Schattenkante
            const steps = 10;
            const left = [], right = [];
            for (let k = 0; k <= steps; k++) {
              const u = k / steps;
              const [x, y, a] = at(s, u, sway);
              const w = s.wb * DK.lerp(1, 0.18, u);
              const nx = -Math.sin(a), ny = Math.cos(a);
              left.push([x + nx * w, y + ny * w]);
              right.push([x - nx * w, y - ny * w]);
            }
            const [bx, by] = at(s, 0, sway), [tx, ty] = at(s, 1, sway);
            const nx0 = -Math.sin(s.a), ny0 = Math.cos(s.a);
            const grd = ctx.createLinearGradient(bx + nx0 * s.wb, by + ny0 * s.wb, bx - nx0 * s.wb, by - ny0 * s.wb);
            const [hh, ss, ll] = T.stalk;
            const L = ll * DK.lerp(1.25, 0.65, s.depth);
            grd.addColorStop(0, `hsl(${hh}, ${ss * 100}%, ${L * 55}%)`);
            grd.addColorStop(0.35, `hsl(${hh}, ${ss * 100}%, ${L * 115}%)`);
            grd.addColorStop(0.6, `hsl(${hh}, ${ss * 100}%, ${L * 90}%)`);
            grd.addColorStop(1, `hsl(${hh}, ${ss * 100}%, ${L * 40}%)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.moveTo(left[0][0], left[0][1]);
            for (const q of left) ctx.lineTo(q[0], q[1]);
            for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1]);
            ctx.closePath();
            ctx.fill();

            // Knoten: dichter, je höher (Perspektive)
            ctx.strokeStyle = `hsla(${hh}, ${ss * 100}%, ${L * 35}%, 0.8)`;
            for (let k = 1; k < 9; k++) {
              const u = 1 - Math.pow(0.78, k);
              const [x, y, a] = at(s, u, sway);
              const w = s.wb * DK.lerp(1, 0.18, u);
              const nx = -Math.sin(a), ny = Math.cos(a);
              ctx.lineWidth = Math.max(1, w * 0.12);
              ctx.beginPath();
              ctx.moveTo(x + nx * w, y + ny * w);
              ctx.lineTo(x - nx * w, y - ny * w);
              ctx.stroke();
            }

            // Blätter im oberen Teil
            const [lh, ls, lL] = T.leaf;
            // Helligkeit in Stufen, damit nur wenige Sprites entstehen
            const lc = [lh, ls, Math.round(lL * DK.lerp(1.3, 0.8, s.depth) * 20) / 20];
            for (const sp of s.sprays) {
              const [x, y, a] = at(s, sp.t, sway);
              const size = M * 0.09 * sp.s * DK.lerp(0.5, 1.4, s.depth);
              const flutter = Math.sin(t * 2.2 + sp.t * 20 + s.ph) * 0.12 + sway * 3;
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate(a + Math.PI / 2 + sp.side * 1.0 + flutter);
              ctx.drawImage(spray(lc, `${sp.k}_${lc[0]}_${lc[1]}_${lc[2].toFixed(2)}`), -size / 2, -size * 0.94, size, size);
              ctx.restore();
            }
            void tx; void ty;
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
