/* Hanami bei Nacht: Blick von unten in eine Kirschbaumkrone – Mond, fallende Blätter, Himmelslaternen */
(function () {
  'use strict';
  const TAU = DK.TAU;

  function sprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    return c;
  }

  // Sakura-Blütenblatt mit Kerbe, Spitze oben
  const petalCache = {};
  function petal(h) {
    const k = Math.round(h * 100);
    if (petalCache[k]) return petalCache[k];
    return (petalCache[k] = sprite(32, 48, (g) => {
      g.beginPath();
      g.moveTo(16, 46);
      g.bezierCurveTo(32, 36, 31, 10, 21, 3);
      g.lineTo(16, 10);
      g.lineTo(11, 3);
      g.bezierCurveTo(1, 10, 0, 36, 16, 46);
      const grd = g.createLinearGradient(16, 46, 16, 0);
      grd.addColorStop(0, DK.hsl(h, 0.55, 0.93));
      grd.addColorStop(1, DK.hsl(h, 0.7, 0.72));
      g.fillStyle = grd;
      g.fill();
    }));
  }

  // fünfblättrige Kirschblüte
  const flowerCache = {};
  function flower(h) {
    const k = Math.round(h * 100);
    if (flowerCache[k]) return flowerCache[k];
    return (flowerCache[k] = sprite(64, 64, (g) => {
      g.translate(32, 32);
      for (let i = 0; i < 5; i++) {
        g.save();
        g.rotate((i / 5) * TAU);
        g.drawImage(petal(h), -9, -30, 18, 27);
        g.restore();
      }
      g.fillStyle = 'rgba(255,120,150,0.9)';
      g.beginPath();
      g.arc(0, 0, 4, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,230,160,0.95)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.beginPath();
        g.arc(Math.cos(a) * 7, Math.sin(a) * 7, 1.4, 0, TAU);
        g.fill();
      }
    }));
  }

  // Papierlaterne
  let lanternImg = null;
  function lantern() {
    if (lanternImg) return lanternImg;
    return (lanternImg = sprite(40, 60, (g) => {
      const grd = g.createLinearGradient(0, 6, 0, 54);
      grd.addColorStop(0, 'rgba(255,190,90,1)');
      grd.addColorStop(0.6, 'rgba(255,130,40,1)');
      grd.addColorStop(1, 'rgba(200,60,20,1)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(8, 6);
      g.quadraticCurveTo(-2, 30, 8, 54);
      g.lineTo(32, 54);
      g.quadraticCurveTo(42, 30, 32, 6);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(120,40,10,0.35)';
      g.lineWidth = 1;
      for (let y = 14; y < 54; y += 8) {
        g.beginPath();
        g.moveTo(4, y);
        g.lineTo(36, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,15,10,0.9)';
      g.fillRect(9, 2, 22, 5);
      g.fillRect(9, 53, 22, 5);
    }));
  }

  DK.register({
    id: 'hanami',
    name: 'Hanami bei Nacht',
    sub: 'Unter dem Kirschbaum, Blick nach oben',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const hue = DK.pick([0.93, 0.95, 0.97, 0.99]);
      const phase = DK.pick(['Vollmond', 'Sichelmond', 'Halbmond']);
      const moonN = { x: DK.rand(0.3, 0.7), y: DK.rand(0.3, 0.7), r: DK.rand(0.05, 0.075) };
      const lanternsOn = Math.random() < 0.75;
      let sky, tree, bloom, tips, W, H, M;
      const petals = [], lanterns = [], clouds = [];
      let nextLantern = DK.rand(1, 4);

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        const mx = moonN.x * W, my = moonN.y * H, mr = moonN.r * M;

        // Himmel mit Mond
        sky = sprite(W, H, (g) => {
          const grd = g.createRadialGradient(mx, my, 0, mx, my, Math.max(W, H) * 0.9);
          grd.addColorStop(0, 'hsl(228, 38%, 20%)');
          grd.addColorStop(0.35, 'hsl(235, 45%, 9%)');
          grd.addColorStop(1, 'hsl(245, 50%, 2.5%)');
          g.fillStyle = grd;
          g.fillRect(0, 0, W, H);
          const n = Math.round((W * H) / 5000);
          for (let i = 0; i < n; i++) {
            const x = Math.random() * W, y = Math.random() * H;
            const d = Math.hypot(x - mx, y - my) / M;
            g.fillStyle = `rgba(220,225,255,${DK.rand(0.1, 0.6) * DK.clamp(d - 0.15, 0, 1)})`;
            g.fillRect(x, y, 1.3, 1.3);
          }
          g.globalCompositeOperation = 'lighter';
          g.drawImage(DK.glowSprite(0.13, 0.25, 0.55, 256), mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
          g.globalCompositeOperation = 'source-over';
          const moon = sprite(Math.ceil(mr * 2 + 4), Math.ceil(mr * 2 + 4), (m) => {
            const c = mr + 2;
            const mg = m.createRadialGradient(c - mr * 0.3, c - mr * 0.3, 0, c, c, mr);
            mg.addColorStop(0, '#fffbea');
            mg.addColorStop(1, '#e9dfc0');
            m.fillStyle = mg;
            m.beginPath();
            m.arc(c, c, mr, 0, TAU);
            m.fill();
            m.fillStyle = 'rgba(160,150,130,0.18)';
            for (let i = 0; i < 7; i++) {
              const a = Math.random() * TAU, r = Math.random() * mr * 0.7;
              m.beginPath();
              m.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, mr * DK.rand(0.08, 0.22), 0, TAU);
              m.fill();
            }
            if (phase !== 'Vollmond') {
              m.globalCompositeOperation = 'destination-out';
              m.beginPath();
              m.arc(c + mr * (phase === 'Halbmond' ? 1.0 : 0.55), c - mr * 0.15, mr * (phase === 'Halbmond' ? 1.05 : 0.95), 0, TAU);
              m.fill();
            }
          });
          g.drawImage(moon, mx - mr - 2, my - mr - 2);
        });

        // Äste (Silhouetten mit Mondlicht-Kante) und Blüten
        tips = [];
        tree = document.createElement('canvas');
        tree.width = W; tree.height = H;
        bloom = document.createElement('canvas');
        bloom.width = W; bloom.height = H;
        const g = tree.getContext('2d');
        const b = bloom.getContext('2d');
        g.lineCap = 'round';
        const maxDepth = 8;

        function branch(x, y, a, len, wd, depth) {
          const bend = DK.rand(-0.35, 0.35);
          const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
          const cx = x + Math.cos(a + bend) * len * 0.5, cy = y + Math.sin(a + bend) * len * 0.5;
          g.strokeStyle = '#08060c';
          g.lineWidth = wd;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(cx, cy, ex, ey);
          g.stroke();
          let ox = mx - cx, oy = my - cy;
          const od = Math.hypot(ox, oy) || 1;
          ox = (ox / od) * wd * 0.32; oy = (oy / od) * wd * 0.32;
          g.strokeStyle = 'rgba(160,170,220,0.22)';
          g.lineWidth = Math.max(0.7, wd * 0.16);
          g.beginPath();
          g.moveTo(x + ox, y + oy);
          g.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy);
          g.stroke();
          if (depth >= 4) {
            tips.push({ x: ex, y: ey, n: DK.randInt(2, 5) });
            if (Math.random() < 0.6) tips.push({ x: cx, y: cy, n: DK.randInt(1, 3) });
          }
          if (depth >= maxDepth || wd < 1.2) return;
          const kids = depth < 2 ? 2 : DK.randInt(2, 3);
          for (let k = 0; k < kids; k++) {
            branch(ex, ey, a + DK.rand(-0.75, 0.75), len * DK.rand(0.62, 0.82), wd * DK.rand(0.58, 0.72), depth + 1);
          }
        }

        const roots = DK.randInt(2, 3);
        const start = Math.random() * TAU;
        for (let r = 0; r < roots; r++) {
          // Stamm ausserhalb des Bildes, wächst Richtung Mitte
          const ang = start + (r / roots) * TAU + DK.rand(-0.4, 0.4);
          const sx = W / 2 + Math.cos(ang) * Math.max(W, H) * 0.62;
          const sy = H / 2 + Math.sin(ang) * Math.max(W, H) * 0.62;
          const toC = Math.atan2(H / 2 - sy, W / 2 - sx) + DK.rand(-0.35, 0.35);
          branch(sx, sy, toC, M * DK.rand(0.3, 0.4), M * DK.rand(0.045, 0.065), 0);
        }

        b.globalCompositeOperation = 'lighter';
        const s0 = M * 0.03;
        for (const tp of tips) {
          b.globalAlpha = 0.07;
          b.drawImage(DK.glowSprite(hue, 0.7, 0.55, 64), tp.x - s0 * 1.5, tp.y - s0 * 1.5, s0 * 3, s0 * 3);
        }
        b.globalCompositeOperation = 'source-over';
        for (const tp of tips) {
          if (Math.random() < 0.3) continue;
          for (let i = 0; i < tp.n; i++) {
            const s = M * DK.rand(0.012, 0.022);
            const a = Math.random() * TAU, r = Math.random() * M * 0.02;
            b.globalAlpha = DK.rand(0.65, 0.95);
            b.save();
            b.translate(tp.x + Math.cos(a) * r, tp.y + Math.sin(a) * r);
            b.rotate(Math.random() * TAU);
            b.drawImage(flower(hue + DK.rand(-0.02, 0.02)), -s / 2, -s / 2, s, s);
            b.restore();
          }
        }
        b.globalAlpha = 1;

        clouds.length = 0;
        for (let i = 0; i < 5; i++) clouds.push({ x: Math.random() * W, y: Math.random() * H, s: M * DK.rand(0.25, 0.5), v: M * DK.rand(0.004, 0.012) });
      }
      build();

      function spawnPetal(x, y, burst) {
        const tp = x === undefined ? DK.pick(tips) : null;
        petals.push({
          x: tp ? tp.x : x, y: tp ? tp.y : y, size: M * DK.rand(0.008, 0.014), age: 0, life: DK.rand(4, 8),
          rot: Math.random() * TAU, vr: DK.rand(-2, 2), flip: DK.rand(1.5, 4), ph: Math.random() * TAU,
          vx: burst ? DK.rand(-1, 1) * M * 0.15 : 0, vy: burst ? DK.rand(-1, 1) * M * 0.15 : 0,
          h: hue + DK.rand(-0.02, 0.02),
        });
      }

      function spawnLantern(x, y) {
        const a = Math.random() * TAU;
        lanterns.push({
          x: x !== undefined ? x : W / 2 + Math.cos(a) * W * DK.rand(0.3, 0.5),
          y: y !== undefined ? y : H / 2 + Math.sin(a) * H * DK.rand(0.3, 0.5),
          s: M * DK.rand(0.05, 0.075), ph: Math.random() * TAU, sway: Math.random() * 100,
        });
      }

      return {
        info: `${phase}${lanternsOn ? ' · Himmelslaternen' : ''}`,
        resize() { build(); petals.length = 0; lanterns.length = 0; },
        render(t, dt, env) {
          const p = env.pointer;
          const pX = p.nx * W, pY = p.ny * H;
          const cxp = W / 2, cyp = H / 2;
          const wa = noise(t * 0.04, 1.3, 0) * TAU;
          const wx = Math.cos(wa) * M * 0.02, wy = Math.sin(wa) * M * 0.02;

          if (Math.random() < dt * 7 * env.q * (1 + env.audio.level * 2)) spawnPetal();
          if (p.pulse) {
            for (let i = 0; i < 30; i++) spawnPetal(pX + DK.rand(-1, 1) * M * 0.05, pY + DK.rand(-1, 1) * M * 0.05, true);
            spawnLantern(pX, pY);
          }
          if (lanternsOn) {
            nextLantern -= dt;
            if (nextLantern < 0 && lanterns.length < 14) { nextLantern = DK.rand(2.5, 7); spawnLantern(); }
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(sky, 0, 0);

          // Wolkenschleier
          ctx.globalCompositeOperation = 'lighter';
          for (const c of clouds) {
            c.x += c.v * dt;
            if (c.x - c.s > W) c.x = -c.s;
            ctx.globalAlpha = 0.06;
            ctx.drawImage(DK.glowSprite(0.62, 0.15, 0.6, 128), c.x - c.s, c.y - c.s * 0.25, c.s * 2, c.s * 0.5);
          }

          // Laternen steigen in die Ferne: werden kleiner und wandern zum Fluchtpunkt
          for (let i = lanterns.length - 1; i >= 0; i--) {
            const l = lanterns[i];
            l.x += (cxp - l.x) * 0.025 * dt + Math.sin(t * 0.5 + l.sway) * M * 0.004 * dt;
            l.y += (cyp - l.y) * 0.025 * dt;
            l.s *= 1 - 0.025 * dt;
            if (l.s < M * 0.006) { lanterns.splice(i, 1); continue; }
            const fl = 0.85 + 0.15 * Math.sin(t * 9 + l.ph) * Math.sin(t * 5.3 + l.ph * 2);
            const gs = l.s * 4;
            ctx.globalAlpha = 0.5 * fl;
            ctx.drawImage(DK.glowSprite(0.07, 0.9, 0.55, 128), l.x - gs / 2, l.y - gs / 2, gs, gs);
            ctx.globalAlpha = 0.95 * fl;
            ctx.drawImage(lantern(), l.x - l.s * 0.33, l.y - l.s / 2, l.s * 0.66, l.s);
          }

          // Baum wiegt sich kaum merklich im Wind
          const sc = 1 + 0.005 * Math.sin(t * 0.31), rot = 0.004 * Math.sin(t * 0.23 + 1);
          ctx.setTransform(sc * Math.cos(rot), sc * Math.sin(rot), -sc * Math.sin(rot), sc * Math.cos(rot), cxp, cyp);
          ctx.translate(-cxp, -cyp);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.drawImage(tree, 0, 0);
          ctx.globalAlpha = 0.88 + 0.08 * Math.sin(t * 0.4);
          ctx.drawImage(bloom, 0, 0);
          ctx.globalCompositeOperation = 'lighter';
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          // Blätter fallen dem Betrachter entgegen: werden grösser und driften nach aussen
          for (let i = petals.length - 1; i >= 0; i--) {
            const q = petals[i];
            q.age += dt;
            if (q.age > q.life) { petals.splice(i, 1); continue; }
            q.vx += (wx - q.vx) * 0.5 * dt;
            q.vy += (wy - q.vy) * 0.5 * dt;
            q.x += q.vx * dt + (q.x - cxp) * 0.06 * dt;
            q.y += q.vy * dt + (q.y - cyp) * 0.06 * dt;
            q.size *= 1 + 0.18 * dt;
            q.rot += q.vr * dt;
            const k = q.age / q.life;
            ctx.globalAlpha = Math.min(1, q.age * 2) * (1 - k * k) * 0.9;
            ctx.setTransform(1, 0, 0, 1, q.x, q.y);
            ctx.rotate(q.rot);
            ctx.scale(Math.cos(q.age * q.flip + q.ph), 1);
            ctx.drawImage(petal(q.h), -q.size / 2, -q.size * 0.75, q.size, q.size * 1.5);
          }
          if (petals.length > 600) petals.splice(0, petals.length - 600);

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
