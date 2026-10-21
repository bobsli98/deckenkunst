/* Tiefsee: pulsierende Quallen mit wehenden Tentakeln und leuchtendem Plankton */
(function () {
  'use strict';
  const TAU = DK.TAU;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  DK.register({
    id: 'quallen',
    name: 'Tiefsee',
    sub: 'Lebewesen, die ihr eigenes Licht machen',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const M = () => Math.min(env.w, env.h);
      const palette = DK.pick([[0.52, 0.6, 0.85], [0.8, 0.9, 0.55], [0.08, 0.95, 0.55], [0.45, 0.5, 0.58]]);
      const jellies = [];
      const nJ = DK.randInt(5, 9);
      const T = 8; // Tentakel
      const S = 14; // Glieder pro Tentakel

      function makeJelly() {
        const m = M();
        const j = {
          x: Math.random() * env.w, y: Math.random() * env.h, a: Math.random() * TAU,
          s: m * DK.rand(0.045, 0.1), hue: DK.pick(palette) + DK.rand(-0.03, 0.03),
          ph: Math.random() * TAU, freq: DK.rand(0.5, 0.9), seed: Math.random() * 100, v: 0, tent: [],
        };
        for (let k = 0; k < T; k++) {
          const pts = [];
          for (let i = 0; i < S; i++) pts.push({ x: j.x, y: j.y });
          j.tent.push({ pts, len: DK.rand(1.2, 3.2), off: (k / (T - 1)) * 2 - 1 });
        }
        return j;
      }
      for (let i = 0; i < nJ; i++) jellies.push(makeJelly());
      jellies.sort((a, b) => a.s - b.s);

      const NP = Math.round(260 * env.q + 80);
      const plankton = [];
      for (let i = 0; i < NP; i++) plankton.push({ x: Math.random(), y: Math.random(), z: DK.rand(0.3, 1), glow: 0, ph: Math.random() * TAU });

      return {
        info: `${nJ} Quallen`,
        render(t, dt, env) {
          const w = env.w, h = env.h, m = M();
          const p = env.pointer;
          const pX = p.nx * w, pY = p.ny * h;

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#01040a';
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'lighter';

          // Plankton leuchtet auf, wenn etwas vorbeischwimmt
          for (const pl of plankton) {
            pl.x = DK.wrap01(pl.x + noise(pl.ph, t * 0.05, 0) * 0.004 * dt);
            pl.y = DK.wrap01(pl.y + noise(pl.ph, t * 0.05, 5) * 0.004 * dt);
            const X = pl.x * w, Y = pl.y * h;
            for (const j of jellies) {
              if (Math.abs(X - j.x) < j.s * 1.5 && Math.abs(Y - j.y) < j.s * 1.5) pl.glow = 1;
            }
            if (p.active > 0.5 && Math.hypot(X - pX, Y - pY) < m * 0.08) pl.glow = 1;
            pl.glow = Math.max(0, pl.glow - dt * 0.6);
            const b = 0.12 + pl.glow * 0.88;
            const s = m * 0.012 * pl.z * (1 + pl.glow);
            ctx.globalAlpha = b * pl.z * (0.7 + 0.3 * Math.sin(t * 2 + pl.ph));
            ctx.drawImage(DK.glowSprite(0.5, 0.8, 0.6, 32), X - s / 2, Y - s / 2, s, s);
          }

          for (const j of jellies) {
            // Pumpen: Kontraktion erzeugt Schub
            j.ph += dt * j.freq * TAU * (1 + env.audio.bass * 0.6);
            const c = Math.max(0, Math.sin(j.ph));
            j.v += c * c * j.s * 2.2 * dt;
            j.v *= Math.pow(0.35, dt);
            let turn = noise(j.seed, t * 0.07, 0) * 0.6;
            const mg = m * 0.1;
            if (j.x < -mg || j.x > w + mg || j.y < -mg || j.y > h + mg) turn += angDiff(Math.atan2(h / 2 - j.y, w / 2 - j.x), j.a) * 1.5;
            if (p.pulse && Math.hypot(j.x - pX, j.y - pY) < m * 0.25) { j.a = Math.atan2(j.y - pY, j.x - pX); j.v += j.s * 3; }
            j.a += turn * dt;
            j.x += Math.cos(j.a) * j.v * dt;
            j.y += Math.sin(j.a) * j.v * dt;

            const ca = Math.cos(j.a), sa = Math.sin(j.a);
            const bw = j.s * (1 - 0.18 * c), bh = j.s * 0.85 * (1 + 0.12 * c);

            // Tentakel: folgen dem Rand der Glocke mit Verzögerung
            ctx.lineWidth = Math.max(0.8, j.s * 0.025);
            for (const tn of j.tent) {
              const ax = j.x - ca * 0 + -sa * tn.off * bw * 0.8;
              const ay = j.y + ca * tn.off * bw * 0.8;
              const pts = tn.pts;
              pts[0].x = ax; pts[0].y = ay;
              const seg = (j.s * tn.len) / S;
              for (let i = 1; i < S; i++) {
                const prev = pts[i - 1], cur = pts[i];
                const sway = Math.sin(t * 1.6 - i * 0.5 + tn.off * 3) * seg * 0.35;
                const tx = prev.x - ca * seg - sa * sway, ty = prev.y - sa * seg + ca * sway;
                cur.x += (tx - cur.x) * Math.min(1, dt * 6);
                cur.y += (ty - cur.y) * Math.min(1, dt * 6);
              }
              ctx.strokeStyle = DK.hsl(j.hue, 0.7, 0.65, 0.35);
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < S; i++) ctx.lineTo(pts[i].x, pts[i].y);
              ctx.stroke();
            }

            // Glocke
            ctx.setTransform(ca, sa, -sa, ca, j.x, j.y);
            const gs = j.s * 3.2;
            ctx.globalAlpha = 0.35 + 0.25 * c;
            ctx.drawImage(DK.glowSprite(j.hue, 0.8, 0.55), bh * 0.3 - gs / 2, -gs / 2, gs, gs);
            ctx.globalAlpha = 1;
            const grd = ctx.createRadialGradient(bh * 0.2, 0, 0, bh * 0.2, 0, bw * 1.1);
            grd.addColorStop(0, DK.hsl(j.hue, 0.4, 0.85, 0.55));
            grd.addColorStop(0.6, DK.hsl(j.hue, 0.8, 0.55, 0.3));
            grd.addColorStop(1, DK.hsl(j.hue, 0.9, 0.5, 0.05));
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.moveTo(0, -bw);
            ctx.bezierCurveTo(bh * 1.25, -bw * 0.95, bh * 1.25, bw * 0.95, 0, bw);
            for (let k = 6; k >= -6; k--) ctx.lineTo(-Math.abs(Math.sin(k * 1.3 + t * 3)) * bh * 0.08, (k / 6) * bw);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = DK.hsl(j.hue, 0.6, 0.8, 0.5);
            ctx.lineWidth = Math.max(1, j.s * 0.02);
            ctx.stroke();
            // Innenleben
            ctx.fillStyle = DK.hsl(j.hue + 0.08, 0.9, 0.7, 0.5);
            for (let k = 0; k < 4; k++) {
              const aa = (k / 4) * TAU + t * 0.2;
              ctx.beginPath();
              ctx.ellipse(bh * 0.4 + Math.cos(aa) * bh * 0.12, Math.sin(aa) * bw * 0.3, bw * 0.16, bw * 0.09, aa, 0, TAU);
              ctx.fill();
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
