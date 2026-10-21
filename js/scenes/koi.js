/* Koi-Teich: Fische mit Leuchtspuren, Seerosenblätter, Wellenringe. Klick = Futter */
(function () {
  'use strict';
  const TAU = DK.TAU;

  // Farben als [h, s, l]
  const PATTERNS = [
    { n: 'Kohaku', base: [0.08, 0.15, 0.93], spot: [[0.015, 0.92, 0.5]] },
    { n: 'Sanke', base: [0.08, 0.15, 0.93], spot: [[0.015, 0.92, 0.5], [0.62, 0.3, 0.16]] },
    { n: 'Ogon', base: [0.12, 0.9, 0.6], spot: [[0.1, 0.95, 0.72]] },
    { n: 'Asagi', base: [0.58, 0.4, 0.55], spot: [[0.03, 0.85, 0.55]] },
    { n: 'Showa', base: [0.62, 0.35, 0.18], spot: [[0.015, 0.92, 0.5], [0.08, 0.1, 0.93]] },
    { n: 'Yamabuki', base: [0.13, 0.95, 0.62], spot: [] },
    { n: 'Kujaku', base: [0.5, 0.35, 0.75], spot: [[0.05, 0.9, 0.55]] },
  ];
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const css = (c, a = 1) => DK.hsl(c[0], c[1], c[2], a);

  DK.register({
    id: 'koi',
    name: 'Koi-Teich',
    sub: 'Wer klickt, füttert',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const fish = [], ripples = [], pads = [];
      let food = null, bg = null, nextRipple = 1;
      const M = () => Math.min(env.w, env.h);
      const K = 16;

      function makeFish() {
        const pat = DK.pick(PATTERNS);
        const m = M();
        const L = m * DK.rand(0.1, 0.16);
        const seg = L / K;
        const x = Math.random() * env.w, y = Math.random() * env.h, a = Math.random() * TAU;
        const pts = [];
        for (let k = 0; k < K; k++) pts.push({ x: x - Math.cos(a) * seg * k, y: y - Math.sin(a) * seg * k });
        const spots = [];
        for (const c of pat.spot) {
          const n = DK.randInt(1, 4);
          for (let i = 0; i < n; i++) spots.push({ u: DK.rand(0.05, 0.75), r: DK.rand(0.6, 1.2), off: DK.rand(-0.6, 0.6), c });
        }
        const main = pat.spot.length ? pat.spot[0] : pat.base;
        return {
          pat, L, seg, pts, a, v: m * DK.rand(0.05, 0.09), seed: Math.random() * 100, spots,
          trail: [], trailHue: main[0] + DK.rand(-0.03, 0.03), glowHue: main[0], phase: Math.random() * TAU,
        };
      }

      function makePad() {
        const m = M();
        return {
          x: Math.random() * env.w, y: Math.random() * env.h, r: m * DK.rand(0.035, 0.07),
          rot: Math.random() * TAU, vr: DK.rand(-0.03, 0.03), lotus: Math.random() < 0.35, lh: DK.rand(0.9, 1.0),
        };
      }

      function buildBg() {
        bg = document.createElement('canvas');
        bg.width = env.w; bg.height = env.h;
        const g = bg.getContext('2d');
        const grd = g.createRadialGradient(env.w / 2, env.h / 2, 0, env.w / 2, env.h / 2, Math.max(env.w, env.h) * 0.7);
        grd.addColorStop(0, 'hsl(195, 60%, 7%)');
        grd.addColorStop(1, 'hsl(215, 70%, 1.5%)');
        g.fillStyle = grd;
        g.fillRect(0, 0, env.w, env.h);
      }

      const nFish = DK.randInt(7, 13);
      for (let i = 0; i < nFish; i++) fish.push(makeFish());
      const nPads = DK.randInt(3, 9);
      for (let i = 0; i < nPads; i++) pads.push(makePad());
      buildBg();

      const widthAt = (u, L) => L * 0.11 * Math.sin(Math.PI * Math.pow(u * 0.92 + 0.08, 0.75)) * (1 - 0.55 * u);

      function ripple(x, y, big) {
        const m = M();
        ripples.push({ x, y, age: 0, life: DK.rand(3, 5), R: m * (big ? DK.rand(0.2, 0.3) : DK.rand(0.06, 0.15)) });
      }

      function drawFish(f, t) {
        const P = [], N = [], Wd = [];
        for (let i = 0; i < K; i++) {
          const a = f.pts[Math.max(0, i - 1)], b = f.pts[Math.min(K - 1, i + 1)];
          let dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          dx /= d; dy /= d;
          const u = i / (K - 1);
          const wig = Math.sin(f.phase - i * 0.45) * f.L * 0.06 * (0.2 + u);
          N.push([-dy, dx]);
          P.push([f.pts[i].x - dy * wig, f.pts[i].y + dx * wig]);
          Wd.push(widthAt(u, f.L));
        }
        const dir0 = Math.atan2(P[0][1] - P[1][1], P[0][0] - P[1][0]);

        // Leuchten unter dem Fisch
        ctx.globalCompositeOperation = 'lighter';
        const gs = DK.glowSprite(f.glowHue, 0.9, 0.55);
        const gp = P[5];
        ctx.globalAlpha = 0.3;
        ctx.drawImage(gs, gp[0] - f.L * 0.8, gp[1] - f.L * 0.8, f.L * 1.6, f.L * 1.6);
        ctx.globalCompositeOperation = 'source-over';

        // Flossen
        ctx.fillStyle = css(f.pat.base, 0.5);
        const fin = 2.2 + Math.sin(f.phase * 0.5) * 0.25;
        for (const side of [1, -1]) {
          const c = P[3];
          ctx.beginPath();
          ctx.ellipse(c[0] + N[3][0] * Wd[3] * side, c[1] + N[3][1] * Wd[3] * side, f.L * 0.09, f.L * 0.035,
            dir0 + fin * side, 0, TAU);
          ctx.fill();
        }
        const T = P[K - 1], Tb = P[K - 2];
        const back = Math.atan2(T[1] - Tb[1], T[0] - Tb[0]);
        for (const side of [1, -1]) {
          const a = back + side * (0.35 + 0.1 * Math.sin(f.phase));
          ctx.beginPath();
          ctx.ellipse(T[0] + Math.cos(a) * f.L * 0.09, T[1] + Math.sin(a) * f.L * 0.09, f.L * 0.11, f.L * 0.035, a, 0, TAU);
          ctx.fill();
        }

        // Körper
        ctx.beginPath();
        ctx.moveTo(P[0][0] + N[0][0] * Wd[0], P[0][1] + N[0][1] * Wd[0]);
        for (let i = 1; i < K; i++) ctx.lineTo(P[i][0] + N[i][0] * Wd[i], P[i][1] + N[i][1] * Wd[i]);
        for (let i = K - 1; i >= 0; i--) ctx.lineTo(P[i][0] - N[i][0] * Wd[i], P[i][1] - N[i][1] * Wd[i]);
        const tip = [P[0][0] + Math.cos(dir0) * Wd[0] * 2.6, P[0][1] + Math.sin(dir0) * Wd[0] * 2.6];
        ctx.quadraticCurveTo(tip[0], tip[1], P[0][0] + N[0][0] * Wd[0], P[0][1] + N[0][1] * Wd[0]);
        ctx.closePath();
        ctx.fillStyle = css(f.pat.base);
        ctx.fill();
        if (f.spots.length) {
          ctx.save();
          ctx.clip();
          for (const s of f.spots) {
            const i = Math.round(s.u * (K - 1));
            ctx.fillStyle = css(s.c);
            ctx.beginPath();
            ctx.arc(P[i][0] + N[i][0] * s.off * Wd[i], P[i][1] + N[i][1] * s.off * Wd[i], Math.max(1, s.r * Wd[i] * 1.3), 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      return {
        info: `${nFish} Koi · ${[...new Set(fish.map((f) => f.pat.n))].slice(0, 3).join(', ')}`,
        resize() { buildBg(); },
        render(t, dt, env) {
          const w = env.w, h = env.h, m = M();
          const p = env.pointer;
          const pX = p.nx * w, pY = p.ny * h;

          if (p.pulse) { food = { x: pX, y: pY, life: 7 }; ripple(pX, pY, true); }
          if (food) { food.life -= dt; if (food.life < 0) food = null; }
          nextRipple -= dt;
          if (nextRipple < 0) { nextRipple = DK.rand(1, 3.5); ripple(Math.random() * w, Math.random() * h); }

          // Schwimmen
          for (const f of fish) {
            const hd = f.pts[0];
            let turn = noise(f.seed, t * 0.12, 0) * 1.6;
            const mg = m * 0.12;
            let ex = 0, ey = 0;
            if (hd.x < mg) ex = (mg - hd.x) / mg; else if (hd.x > w - mg) ex = -(hd.x - (w - mg)) / mg;
            if (hd.y < mg) ey = (mg - hd.y) / mg; else if (hd.y > h - mg) ey = -(hd.y - (h - mg)) / mg;
            if (ex || ey) turn += angDiff(Math.atan2(ey, ex), f.a) * 2.5 * Math.min(1.5, Math.hypot(ex, ey));
            for (const g of fish) {
              if (g === f) continue;
              const dx = hd.x - g.pts[0].x, dy = hd.y - g.pts[0].y, d = Math.hypot(dx, dy);
              if (d < m * 0.07 && d > 0) turn += angDiff(Math.atan2(dy, dx), f.a) * 0.8 * (1 - d / (m * 0.07));
            }
            let hungry = false;
            if (food) {
              const d = Math.hypot(food.x - hd.x, food.y - hd.y);
              if (d < m * 0.6) { hungry = true; turn += angDiff(Math.atan2(food.y - hd.y, food.x - hd.x), f.a) * 2.2; }
            } else if (p.active > 0.3) {
              const d = Math.hypot(pX - hd.x, pY - hd.y);
              if (d < m * 0.3) turn += angDiff(Math.atan2(pY - hd.y, pX - hd.x), f.a) * 0.9 * p.active;
            }
            f.a += turn * dt;
            const speed = f.v * (0.8 + 0.4 * Math.sin(t * 0.4 + f.seed)) * (hungry ? 1.7 : 1) * (1 + env.audio.level * 0.6);
            hd.x += Math.cos(f.a) * speed * dt;
            hd.y += Math.sin(f.a) * speed * dt;
            for (let i = 1; i < K; i++) {
              const a = f.pts[i - 1], b = f.pts[i];
              const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
              b.x = a.x + (dx / d) * f.seg;
              b.y = a.y + (dy / d) * f.seg;
            }
            f.phase += dt * (3 + (speed / m) * 40);
            f.trail.push(hd.x, hd.y);
            if (f.trail.length > 180) f.trail.splice(0, 2);
          }

          // Wasser
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);

          ctx.globalCompositeOperation = 'lighter';
          ctx.lineWidth = Math.max(1, m * 0.0018);
          for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.age += dt;
            if (r.age > r.life) { ripples.splice(i, 1); continue; }
            const k = r.age / r.life;
            for (let j = 0; j < 3; j++) {
              const rr = k * r.R - j * r.R * 0.12;
              if (rr <= 0) continue;
              ctx.strokeStyle = `hsla(190, 50%, 75%, ${(1 - k) * 0.22})`;
              ctx.beginPath();
              ctx.arc(r.x, r.y, rr, 0, TAU);
              ctx.stroke();
            }
          }

          // Leuchtspuren
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (const f of fish) {
            const tr = f.trail, n = tr.length / 2;
            const chunks = 12;
            for (let c = 0; c < chunks; c++) {
              const i0 = Math.floor((c / chunks) * (n - 1)), i1 = Math.floor(((c + 1) / chunks) * (n - 1));
              if (i1 <= i0) continue;
              const k = (c + 1) / chunks;
              ctx.strokeStyle = DK.hsl(f.trailHue + env.hue * 0.2, 0.9, 0.6, k * k * 0.35);
              ctx.lineWidth = Math.max(1, f.L * 0.06 * k);
              ctx.beginPath();
              ctx.moveTo(tr[i0 * 2], tr[i0 * 2 + 1]);
              for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(tr[i * 2], tr[i * 2 + 1]);
              ctx.stroke();
            }
          }
          ctx.globalCompositeOperation = 'source-over';
          for (const f of fish) drawFish(f, t);

          // Futter
          if (food) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.min(1, food.life / 2) * 0.7;
            const s = m * 0.05;
            ctx.drawImage(DK.glowSprite(0.12, 0.8, 0.6), food.x - s, food.y - s, s * 2, s * 2);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }

          // Seerosenblätter über den Fischen
          for (const pd of pads) {
            pd.rot += pd.vr * dt;
            pd.x += Math.sin(t * 0.05 + pd.r) * m * 0.004 * dt;
            pd.y += Math.cos(t * 0.04 + pd.r) * m * 0.004 * dt;
            ctx.fillStyle = 'hsla(130, 40%, 11%, 0.93)';
            ctx.beginPath();
            ctx.moveTo(pd.x, pd.y);
            ctx.arc(pd.x, pd.y, pd.r, pd.rot + 0.18, pd.rot + TAU - 0.18);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'hsla(110, 35%, 24%, 0.6)';
            ctx.lineWidth = Math.max(1, pd.r * 0.03);
            ctx.stroke();
            ctx.beginPath();
            for (let v = 1; v < 8; v++) {
              const a = pd.rot + 0.18 + (v / 8) * (TAU - 0.36);
              ctx.moveTo(pd.x, pd.y);
              ctx.lineTo(pd.x + Math.cos(a) * pd.r * 0.85, pd.y + Math.sin(a) * pd.r * 0.85);
            }
            ctx.strokeStyle = 'hsla(110, 30%, 20%, 0.5)';
            ctx.stroke();
            if (pd.lotus) {
              ctx.globalCompositeOperation = 'lighter';
              const s = pd.r * 1.1;
              ctx.globalAlpha = 0.55 + 0.15 * Math.sin(t * 0.7 + pd.r);
              ctx.drawImage(DK.glowSprite(pd.lh, 0.6, 0.65), pd.x - s, pd.y - s, s * 2, s * 2);
              ctx.globalAlpha = 1;
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        },
      };
    },
  });
})();
