/* Laternenfluss (Tōrō nagashi): Papierlaternen treiben auf einem nächtlichen Fluss */
(function () {
  'use strict';
  const TAU = DK.TAU;

  const PAPERS = [
    { n: 'Warmes Kerzenlicht', hues: [0.08, 0.1, 0.06] },
    { n: 'Bunte Laternen', hues: [0.0, 0.08, 0.13, 0.55, 0.85] },
    { n: 'Weisses Papier', hues: [0.11, 0.12] },
  ];

  // Laterne von oben: quadratisches Papierhaus, innen die Flamme
  const cache = {};
  function lanternTop(h) {
    const k = Math.round(h * 50);
    if (cache[k]) return cache[k];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 26);
    grd.addColorStop(0, 'rgba(255,250,225,1)');
    grd.addColorStop(0.35, DK.hsl(h, 0.85, 0.72));
    grd.addColorStop(1, DK.hsl(h, 0.9, 0.42));
    g.fillStyle = grd;
    g.fillRect(10, 10, 44, 44);
    g.strokeStyle = 'rgba(40,20,10,0.75)';
    g.lineWidth = 3;
    g.strokeRect(10, 10, 44, 44);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(10, 10); g.lineTo(54, 54); g.moveTo(54, 10); g.lineTo(10, 54);
    g.stroke();
    return (cache[k] = c);
  }

  DK.register({
    id: 'laternenfluss',
    name: 'Laternenfluss',
    sub: 'Tōrō nagashi – Lichter für die, an die man denkt',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const paper = DK.pick(PAPERS);
      const flowA = Math.random() * TAU;
      const fx = Math.cos(flowA), fy = Math.sin(flowA);
      const lanterns = [], ripples = [], streaks = [];
      let bg, W, H, M;
      const maxL = Math.round(22 * env.q + 10);

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        bg = document.createElement('canvas');
        bg.width = W; bg.height = H;
        const g = bg.getContext('2d');
        const grd = g.createLinearGradient(-fy * W, fx * H, fy * W, -fx * H);
        grd.addColorStop(0, 'hsl(220, 45%, 3%)');
        grd.addColorStop(0.5, 'hsl(215, 40%, 7%)');
        grd.addColorStop(1, 'hsl(225, 45%, 3%)');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        streaks.length = 0;
        for (let i = 0; i < 70; i++) streaks.push({ u: Math.random(), v: Math.random(), len: DK.rand(0.05, 0.2), sp: DK.rand(0.6, 1.4) });
      }
      build();

      // Koordinaten quer (v) und längs (u) zur Strömung
      function toXY(u, v) {
        const L = Math.hypot(W, H);
        const cx = W / 2 + fx * (u - 0.5) * L - fy * (v - 0.5) * L * 0.75;
        const cy = H / 2 + fy * (u - 0.5) * L + fx * (v - 0.5) * L * 0.75;
        return [cx, cy];
      }

      function spawn(u) {
        lanterns.push({
          u: u !== undefined ? u : -0.05, v: DK.rand(0.15, 0.85), rot: Math.random() * TAU, vr: DK.rand(-0.08, 0.08),
          s: M * DK.rand(0.055, 0.09), h: DK.pick(paper.hues) + DK.rand(-0.015, 0.015), ph: Math.random() * TAU, sp: DK.rand(0.7, 1.2),
        });
      }
      for (let i = 0; i < maxL * 0.8; i++) spawn(Math.random());

      return {
        info: paper.n,
        resize() { build(); },
        render(t, dt, env) {
          const base = 0.012 * (1 + env.audio.level);
          if (lanterns.length < maxL && Math.random() < dt * 0.6) spawn();
          if (Math.random() < dt * 0.8) {
            const [x, y] = toXY(Math.random(), Math.random());
            ripples.push({ x, y, age: 0, life: DK.rand(2.5, 4), R: M * DK.rand(0.03, 0.08) });
          }
          const p = env.pointer;
          if (p.pulse) {
            ripples.push({ x: p.nx * W, y: p.ny * H, age: 0, life: 4, R: M * 0.18 });
            // eine neue Laterne dort aussetzen, wo geklickt wurde
            const L = Math.hypot(W, H);
            const dx = p.nx * W - W / 2, dy = p.ny * H - H / 2;
            spawn((dx * fx + dy * fy) / L + 0.5);
            lanterns[lanterns.length - 1].v = (-dx * fy + dy * fx) / (L * 0.75) + 0.5;
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          ctx.globalCompositeOperation = 'lighter';

          // Strömungslinien auf dem Wasser
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(1, M * 0.0015);
          for (const s of streaks) {
            s.u += base * s.sp * dt * 1.3;
            if (s.u > 1.1) { s.u = -0.1; s.v = Math.random(); }
            const [x0, y0] = toXY(s.u, s.v), [x1, y1] = toXY(s.u + s.len * 0.3, s.v + noise(s.v * 3, t * 0.05, 0) * 0.004);
            ctx.strokeStyle = 'rgba(120,150,210,0.07)';
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          }
          for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.age += dt;
            if (r.age > r.life) { ripples.splice(i, 1); continue; }
            const k = r.age / r.life;
            ctx.strokeStyle = `rgba(150,180,230,${(1 - k) * 0.18})`;
            ctx.beginPath(); ctx.arc(r.x, r.y, k * r.R, 0, TAU); ctx.stroke();
          }

          for (let i = lanterns.length - 1; i >= 0; i--) {
            const l = lanterns[i];
            l.u += base * l.sp * dt;
            l.v += noise(l.ph, t * 0.04, 0) * 0.006 * dt;
            l.rot += l.vr * dt;
            if (l.u > 1.08) { lanterns.splice(i, 1); continue; }
            const [x, y] = toXY(l.u, l.v);
            const flick = 0.85 + 0.15 * Math.sin(t * 8 + l.ph) * Math.sin(t * 5.1 + l.ph * 3);
            // Spiegelung: in Strömungsrichtung gestreckter Schein
            const gs = l.s * 5;
            ctx.globalAlpha = 0.35 * flick;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(flowA);
            ctx.scale(1.8, 0.8);
            ctx.drawImage(DK.glowSprite(l.h, 0.85, 0.55, 128), -gs / 2, -gs / 2, gs, gs);
            ctx.restore();
            ctx.globalAlpha = 0.6 * flick;
            const g2 = l.s * 2.2;
            ctx.drawImage(DK.glowSprite(l.h, 0.7, 0.65, 64), x - g2 / 2, y - g2 / 2, g2, g2);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.95;
            ctx.setTransform(Math.cos(l.rot), Math.sin(l.rot), -Math.sin(l.rot), Math.cos(l.rot), x, y);
            ctx.drawImage(lanternTop(l.h), -l.s / 2, -l.s / 2, l.s, l.s);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'lighter';
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
