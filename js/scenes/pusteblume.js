/* Pusteblume: Samenschirmchen segeln im Abendlicht über einen hinweg. Klick = pusten */
(function () {
  'use strict';
  const TAU = DK.TAU;
  const SKIES = [
    { n: 'Goldene Stunde', c: ['hsl(38, 65%, 26%)', 'hsl(20, 50%, 14%)', 'hsl(265, 35%, 6%)'], glow: 0.1 },
    { n: 'Sommernacht', c: ['hsl(225, 35%, 14%)', 'hsl(230, 40%, 7%)', 'hsl(240, 45%, 3%)'], glow: 0.6 },
    { n: 'Morgentau', c: ['hsl(200, 30%, 30%)', 'hsl(210, 30%, 16%)', 'hsl(230, 35%, 6%)'], glow: 0.55 },
  ];

  // ein Samenschirmchen von unten gesehen: feine Strahlen um einen Kern
  let seedImg = null;
  function seedSprite() {
    if (seedImg) return seedImg;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.translate(32, 32);
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.1, L = 24 + Math.random() * 5;
      g.strokeStyle = 'rgba(255,252,240,0.55)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      g.quadraticCurveTo(Math.cos(a + 0.05) * L * 0.6, Math.sin(a + 0.05) * L * 0.6, Math.cos(a) * L, Math.sin(a) * L);
      g.stroke();
      g.fillStyle = 'rgba(255,255,250,0.7)';
      g.beginPath(); g.arc(Math.cos(a) * L, Math.sin(a) * L, 1, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(200,170,120,0.9)';
    g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill();
    return (seedImg = c);
  }

  // eine ganze Pusteblume: dichte Kugel aus Schirmchen
  function headSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    const s = seedSprite();
    for (let i = 0; i < 220; i++) {
      const a = Math.random() * TAU, r = Math.pow(Math.random(), 0.35) * 46;
      const sz = DK.rand(26, 40);
      g.globalAlpha = DK.rand(0.35, 0.8);
      g.drawImage(s, 80 + Math.cos(a) * r - sz / 2, 80 + Math.sin(a) * r - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(140,120,70,0.9)';
    g.beginPath(); g.arc(80, 80, 7, 0, TAU); g.fill();
    return c;
  }

  DK.register({
    id: 'pusteblume',
    name: 'Pusteblume',
    sub: 'Wünsch dir was',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const sky = DK.pick(SKIES);
      const target = Math.round(110 * env.q + 50);
      const seeds = [], heads = [];
      let bg, W, H, M, nextPuff = DK.rand(3, 6);

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        bg = document.createElement('canvas');
        bg.width = W; bg.height = H;
        const g = bg.getContext('2d');
        const sx = W * DK.rand(0.2, 0.8), sy = H * DK.rand(0.2, 0.8);
        const grd = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.9);
        grd.addColorStop(0, sky.c[0]);
        grd.addColorStop(0.4, sky.c[1]);
        grd.addColorStop(1, sky.c[2]);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        heads.length = 0;
        const n = DK.randInt(2, 4);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          heads.push({ x: W / 2 + Math.cos(a) * W * 0.36, y: H / 2 + Math.sin(a) * H * 0.36, s: M * DK.rand(0.26, 0.36), full: 1, img: headSprite(), sway: Math.random() * 10 });
        }
      }
      build();

      function release(h, n, power) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, r = Math.random() * h.s * 0.3;
          seeds.push({
            x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r, z: DK.rand(0.45, 1),
            vx: Math.cos(a) * M * DK.rand(0.02, 0.08) * power, vy: Math.sin(a) * M * DK.rand(0.02, 0.08) * power,
            rot: Math.random() * TAU, vr: DK.rand(-0.6, 0.6), age: 0, ph: Math.random() * 50,
          });
        }
        h.full = Math.max(0, h.full - n / 60);
      }
      for (const h of heads) release(h, Math.round(target / heads.length / 2), 6);
      for (const s of seeds) { s.x += s.vx * 3; s.y += s.vy * 3; }

      return {
        info: sky.n,
        resize() { build(); },
        render(t, dt, env) {
          const p = env.pointer;
          const pX = p.nx * W, pY = p.ny * H;
          const wa = noise(t * 0.03, 2, 0) * TAU;
          const gust = 1 + Math.max(0, noise(t * 0.1, 5, 0)) * 2 + env.audio.level * 2;
          const wx = Math.cos(wa) * M * 0.02 * gust, wy = Math.sin(wa) * M * 0.02 * gust;

          nextPuff -= dt;
          if (nextPuff < 0 && seeds.length < target) {
            nextPuff = DK.rand(4, 9);
            const h = DK.pick(heads);
            if (h.full > 0.1) release(h, DK.randInt(12, 25), 2.5);
          }
          if (p.pulse) {
            let best = heads[0], bd = Infinity;
            for (const h of heads) { const d = Math.hypot(h.x - pX, h.y - pY); if (d < bd) { bd = d; best = h; } }
            release(best, 30, 4);
            for (const s of seeds) {
              const dx = s.x - pX, dy = s.y - pY, d = Math.hypot(dx, dy) + 1;
              if (d < M * 0.3) { s.vx += (dx / d) * M * 0.25; s.vy += (dy / d) * M * 0.25; }
            }
          }
          // Köpfe wachsen langsam nach
          for (const h of heads) h.full = Math.min(1, h.full + dt * 0.006);

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.globalCompositeOperation = 'lighter';

          for (const h of heads) {
            const sw = Math.sin(t * 0.6 + h.sway) * 0.03;
            const s = h.s * (0.35 + 0.65 * h.full);
            ctx.globalAlpha = 0.3 + 0.7 * h.full;
            ctx.setTransform(Math.cos(sw), Math.sin(sw), -Math.sin(sw), Math.cos(sw), h.x, h.y);
            ctx.drawImage(h.img, -s / 2, -s / 2, s, s);
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          const img = seedSprite();
          const glow = DK.glowSprite(0.12, 0.3, 0.7, 64);
          for (let i = seeds.length - 1; i >= 0; i--) {
            const s = seeds[i];
            s.age += dt;
            const fx = noise(s.x * 0.004, s.y * 0.004, t * 0.05 + s.ph) * M * 0.03;
            const fy = noise(s.y * 0.004, s.x * 0.004, t * 0.05 - s.ph) * M * 0.03;
            s.vx += ((wx + fx) * s.z - s.vx) * 0.6 * dt;
            s.vy += ((wy + fy) * s.z - s.vy) * 0.6 * dt;
            if (p.active > 0.4) {
              const dx = s.x - pX, dy = s.y - pY, d2 = dx * dx + dy * dy;
              if (d2 < M * M * 0.02) { const d = Math.sqrt(d2) + 1; s.vx += (dx / d) * M * 0.4 * dt; s.vy += (dy / d) * M * 0.4 * dt; }
            }
            s.x += s.vx * dt; s.y += s.vy * dt;
            s.rot += s.vr * dt;
            const m = M * 0.15;
            if (s.x < -m || s.y < -m || s.x > W + m || s.y > H + m) { seeds.splice(i, 1); continue; }
            const size = M * 0.075 * s.z;
            const a = Math.min(1, s.age * 1.5) * (0.4 + 0.6 * s.z);
            if (sky.glow > 0.3) {
              ctx.globalAlpha = a * 0.25;
              ctx.drawImage(glow, s.x - size, s.y - size, size * 2, size * 2);
            }
            ctx.globalAlpha = a * 0.85;
            ctx.setTransform(Math.cos(s.rot), Math.sin(s.rot), -Math.sin(s.rot), Math.cos(s.rot), s.x, s.y);
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
