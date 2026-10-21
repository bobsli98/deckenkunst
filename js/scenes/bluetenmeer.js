/* Blütenmeer: Blumen blühen auf, welken und verwehen – die Jahreszeiten ziehen vorbei */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const SEASONS = [
    { name: 'Frühling', cols: [[0.94, 0.5], [0.97, 0.3], [0.9, 0.6], [0.0, 0.0]] },
    { name: 'Sommer', cols: [[0.13, 0.95], [0.6, 0.75], [0.76, 0.6], [0.04, 0.9]] },
    { name: 'Herbst', cols: [[0.02, 0.9], [0.07, 0.95], [0.11, 0.85], [0.96, 0.7]] },
    { name: 'Winter', cols: [[0.58, 0.3], [0.55, 0.12], [0.63, 0.45], [0.0, 0.0]] },
  ];

  // Blütenblatt-Sprites: Spitze oben, Ansatz unten
  const cache = new Map();
  function petalSprite(h, s, shape) {
    const hb = Math.round(DK.wrap01(h) * 48) % 48, sb = Math.round(s * 8);
    const key = `${hb}_${sb}_${shape}`;
    let c = cache.get(key);
    if (c) return c;
    const H = hb / 48, S = sb / 8;
    c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.beginPath();
    g.moveTo(32, 126);
    if (shape === 'spitz') {
      g.bezierCurveTo(50, 100, 46, 30, 32, 2);
      g.bezierCurveTo(18, 30, 14, 100, 32, 126);
    } else if (shape === 'sakura') {
      g.bezierCurveTo(64, 98, 62, 22, 42, 8);
      g.lineTo(32, 20);
      g.lineTo(22, 8);
      g.bezierCurveTo(2, 22, 0, 98, 32, 126);
    } else {
      g.bezierCurveTo(64, 96, 60, 10, 32, 4);
      g.bezierCurveTo(4, 10, 0, 96, 32, 126);
    }
    g.closePath();
    const grd = g.createLinearGradient(32, 126, 32, 0);
    grd.addColorStop(0, DK.hsl(H + 0.04, S * 0.4, 0.92));
    grd.addColorStop(0.3, DK.hsl(H, S, 0.66));
    grd.addColorStop(1, DK.hsl(H, S, 0.42, 0.85));
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = DK.hsl(H, S * 0.5, 0.92, 0.22);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(32, 120);
    g.quadraticCurveTo(34, 64, 32, 18);
    g.stroke();
    cache.set(key, c);
    return c;
  }

  let centerSprite = null;
  function center() {
    if (centerSprite) return centerSprite;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,250,220,1)');
    grd.addColorStop(0.35, 'rgba(255,205,90,0.9)');
    grd.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, r = 13;
      g.fillStyle = 'rgba(255,240,170,0.9)';
      g.beginPath();
      g.arc(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2, 0, TAU);
      g.fill();
    }
    centerSprite = c;
    return c;
  }

  DK.register({
    id: 'bluetenmeer',
    name: 'Blütenmeer',
    sub: 'Blühen, welken, verwehen',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const flowers = [], petals = [];
      let season = DK.randInt(0, 3), seasonT = 0;
      let gust = null, nextGust = DK.rand(12, 25);
      const density = DK.rand(24, 36);

      function M() { return Math.min(env.w, env.h); }

      function makeFlower(x, y) {
        const S = SEASONS[season];
        const col = DK.pick(S.cols);
        const shape = S.name === 'Frühling' && Math.random() < 0.6 ? 'sakura' : DK.pick(['rund', 'spitz', 'sakura']);
        const n = shape === 'spitz' ? DK.randInt(9, 14) : DK.randInt(5, 7);
        const rot = Math.random() * TAU;
        const list = [];
        for (let k = 0; k < n; k++) list.push({ a: rot + (k / n) * TAU + DK.rand(-0.08, 0.08), l: DK.rand(0.85, 1.1) });
        return {
          x, y, R: M() * DK.rand(0.03, 0.075), shape, h: col[0] + DK.rand(-0.02, 0.02), s: col[1],
          petals: list, age: 0, bloom: DK.rand(3, 7), live: DK.rand(10, 24), spin: DK.rand(-0.05, 0.05),
          wd: shape === 'spitz' ? 0.32 : 0.62, seed: Math.random() * 100,
        };
      }

      function spawn() {
        let best = null, bestD = -1;
        for (let k = 0; k < 8; k++) {
          const x = Math.random() * env.w, y = Math.random() * env.h;
          let d = Infinity;
          for (const f of flowers) d = Math.min(d, Math.hypot(f.x - x, f.y - y) - f.R);
          if (d > bestD) { bestD = d; best = [x, y]; }
        }
        flowers.push(makeFlower(best[0], best[1]));
      }

      function scatter(f, push = 0, px = 0, py = 0) {
        const open = DK.smooth(DK.clamp(f.age / f.bloom, 0, 1));
        const sp = petalSprite(f.h, f.s, f.shape);
        const m = M();
        for (const pt of f.petals) {
          const a = pt.a + f.age * f.spin;
          const L = f.R * pt.l * (0.25 + 0.75 * open);
          const x = f.x + Math.cos(a) * L * 0.5, y = f.y + Math.sin(a) * L * 0.5;
          let vx = Math.cos(a) * m * DK.rand(0.01, 0.05), vy = Math.sin(a) * m * DK.rand(0.01, 0.05);
          if (push) {
            const dx = x - px, dy = y - py, d = Math.hypot(dx, dy) + 1;
            vx += (dx / d) * push; vy += (dy / d) * push;
          }
          petals.push({
            x, y, vx, vy, rot: a + Math.PI / 2, vr: DK.rand(-1.5, 1.5), L, Wd: L * f.wd * (0.4 + 0.6 * open),
            sp, life: DK.rand(5, 10), age: 0, flip: DK.rand(1, 3), ph: Math.random() * TAU,
          });
        }
        f.dead = true;
      }

      // nicht leer starten: ein paar Blumen sind schon unterwegs
      const startN = Math.round(DK.clamp(((env.w * env.h) / (M() * M())) * density * 0.5, 6, 50));
      for (let i = 0; i < startN; i++) {
        spawn();
        const f = flowers[flowers.length - 1];
        f.age = Math.random() * (f.bloom + f.live * 0.5);
      }

      return {
        info: `Es beginnt im ${SEASONS[season].name}`,
        render(t, dt, env) {
          const w = env.w, h = env.h, m = M();
          const p = env.pointer;
          const pX = p.nx * w, pY = p.ny * h;

          // Jahreszeiten
          seasonT += dt;
          if (seasonT > 40) { seasonT = 0; season = (season + 1) % 4; }

          // Wind und Böen
          const wa = noise(t * 0.03, 0.5, 3.3) * TAU;
          const wind = m * (0.015 + 0.02 * (noise(t * 0.05, 7.1, 1) + 1));
          const wx = Math.cos(wa) * wind, wy = Math.sin(wa) * wind;
          nextGust -= dt;
          if (!gust && nextGust < 0) {
            const ang = Math.random() * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
            const ps = [0, w * ca, h * sa, w * ca + h * sa];
            gust = { ca, sa, pos: Math.min(...ps) - m * 0.1, end: Math.max(...ps) + m * 0.1, speed: m * DK.rand(0.2, 0.35) };
          }
          if (gust) {
            gust.pos += gust.speed * dt;
            if (gust.pos > gust.end) { gust = null; nextGust = DK.rand(18, 35); }
          }

          // Blumen nachwachsen lassen
          const target = Math.round(DK.clamp(((w * h) / (m * m)) * density, 12, 110));
          if (flowers.length < target && Math.random() < dt * 4) spawn();

          for (const f of flowers) {
            f.age += dt * (1 + env.audio.bass * 0.8);
            if (f.age > f.bloom + f.live) { scatter(f); continue; }
            const ripe = f.age > f.bloom * 0.6;
            if (gust && ripe) {
              const proj = f.x * gust.ca + f.y * gust.sa;
              if (Math.abs(proj - gust.pos) < m * 0.04 && Math.random() < 0.08) {
                scatter(f, m * 0.3, f.x - gust.ca * 50, f.y - gust.sa * 50);
                continue;
              }
            }
            const dp = Math.hypot(f.x - pX, f.y - pY);
            if (ripe && p.active > 0.6 && dp < m * 0.08 + f.R) { scatter(f, m * 0.15, pX, pY); continue; }
            if (p.pulse && dp < m * 0.22) scatter(f, m * 0.4, pX, pY);
          }
          for (let i = flowers.length - 1; i >= 0; i--) if (flowers[i].dead) flowers.splice(i, 1);

          // Zeichnen
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'lighter';

          for (const f of flowers) {
            const open = DK.smooth(DK.clamp(f.age / f.bloom, 0, 1));
            const lifeLeft = f.bloom + f.live - f.age;
            const wilt = DK.clamp(lifeLeft / 3, 0, 1);
            const R = f.R;
            const glow = DK.glowSprite(f.h, f.s * 0.8, 0.5);
            ctx.globalAlpha = 0.3 * open * wilt;
            ctx.drawImage(glow, f.x - R * 2, f.y - R * 2, R * 4, R * 4);
            const sp = petalSprite(f.h, f.s, f.shape);
            ctx.globalAlpha = 0.85 * Math.min(1, open * 2) * (0.6 + 0.4 * wilt);
            for (let k = 0; k < f.petals.length; k++) {
              const pt = f.petals[k];
              const L = R * pt.l * (0.25 + 0.75 * open) * (0.92 + 0.08 * wilt);
              const Wd = L * f.wd * (0.4 + 0.6 * open);
              const sway = Math.sin(t * 0.8 + f.seed + k) * 0.03;
              ctx.setTransform(1, 0, 0, 1, f.x, f.y);
              ctx.rotate(pt.a + f.age * f.spin + sway + Math.PI / 2);
              ctx.drawImage(sp, -Wd / 2, -L, Wd, L);
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = open * wilt * 0.9;
            const cs = R * 0.5;
            ctx.drawImage(center(), f.x - cs / 2, f.y - cs / 2, cs, cs);
          }

          // fallende Blätter
          for (let i = petals.length - 1; i >= 0; i--) {
            const q = petals[i];
            q.age += dt;
            if (q.age > q.life || q.x < -m * 0.2 || q.y < -m * 0.2 || q.x > w + m * 0.2 || q.y > h + m * 0.2) {
              petals.splice(i, 1);
              continue;
            }
            q.vx += (wx - q.vx) * 0.4 * dt;
            q.vy += (wy - q.vy) * 0.4 * dt;
            if (gust) {
              const proj = q.x * gust.ca + q.y * gust.sa;
              if (Math.abs(proj - gust.pos) < m * 0.06) { q.vx += gust.ca * m * 1.5 * dt; q.vy += gust.sa * m * 1.5 * dt; }
            }
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            q.rot += q.vr * dt;
            const k = 1 - q.age / q.life;
            ctx.globalAlpha = Math.pow(k, 1.5) * 0.8;
            ctx.setTransform(1, 0, 0, 1, q.x, q.y);
            ctx.rotate(q.rot);
            ctx.scale(Math.cos(q.age * q.flip + q.ph), 1);
            ctx.drawImage(q.sp, -q.Wd / 2, -q.L / 2, q.Wd, q.L);
          }
          if (petals.length > 2500) petals.splice(0, petals.length - 2500);

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
