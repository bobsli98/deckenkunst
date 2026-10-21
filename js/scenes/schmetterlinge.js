/* Schmetterlinge: sechs Arten flattern über eine Wiese, ruhen auf Blüten und klappen die Flügel */
(function () {
  'use strict';
  const TAU = DK.TAU;

  // Flügel einer Seite: Wurzel links in der Mitte, Vorderflügel oben, Hinterflügel unten
  function wingSprite(sp) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    // Vorderflügel: breites Dreieck mit spitzer Ecke vorne aussen, Hinterflügel rundlich
    const fore = new Path2D();
    fore.moveTo(4, 60);
    fore.bezierCurveTo(18, 22, 66, 2, 126, 6);
    fore.lineTo(120, 40);
    fore.bezierCurveTo(98, 58, 52, 64, 4, 66);
    const hind = new Path2D();
    hind.moveTo(4, 66);
    hind.bezierCurveTo(52, 64, 100, 76, 94, 102);
    hind.bezierCurveTo(80, 126, 30, 114, 4, 70);
    if (sp.tail) { hind.moveTo(70, 112); hind.lineTo(78, 127); hind.lineTo(84, 110); }
    for (const path of [fore, hind]) {
      const grd = g.createRadialGradient(6, 64, 4, 6, 64, 120);
      grd.addColorStop(0, sp.base[0]);
      grd.addColorStop(0.7, sp.base[1]);
      grd.addColorStop(1, sp.edge);
      g.fillStyle = grd;
      g.fill(path);
    }
    g.save();
    g.clip(fore);
    g.strokeStyle = sp.edge;
    g.lineWidth = 9;
    g.stroke(fore);
    g.restore();
    g.save();
    g.clip(hind);
    g.lineWidth = 7;
    g.strokeStyle = sp.edge;
    g.stroke(hind);
    g.restore();
    if (sp.veins) {
      g.strokeStyle = sp.veins;
      g.lineWidth = 1.4;
      for (const [x, y] of [[110, 20], [95, 38], [70, 54], [80, 96], [60, 104], [40, 98]]) {
        g.beginPath(); g.moveTo(6, 64); g.quadraticCurveTo(x * 0.5, (y + 64) * 0.5 - 6, x, y); g.stroke();
      }
    }
    for (const s of sp.spots || []) {
      g.fillStyle = s[3];
      g.beginPath(); g.arc(s[0], s[1], s[2], 0, TAU); g.fill();
    }
    return c;
  }

  const SPECIES = [
    { n: 'Blauer Morphofalter', base: ['hsl(200, 95%, 62%)', 'hsl(210, 95%, 45%)'], edge: 'hsl(220, 60%, 8%)', spots: [[104, 24, 3, '#fff'], [96, 32, 2.5, '#fff']] },
    { n: 'Monarch', base: ['hsl(32, 100%, 60%)', 'hsl(24, 95%, 48%)'], edge: 'hsl(0, 0%, 6%)', veins: 'rgba(10,10,10,0.85)', spots: [[112, 26, 2.5, '#fff'], [100, 44, 2, '#fff'], [86, 108, 2, '#fff']] },
    { n: 'Zitronenfalter', base: ['hsl(60, 90%, 72%)', 'hsl(55, 85%, 60%)'], edge: 'hsl(55, 70%, 50%)', spots: [[62, 44, 3, 'hsl(25, 90%, 55%)'], [58, 90, 3, 'hsl(25, 90%, 55%)']] },
    { n: 'Tagpfauenauge', base: ['hsl(5, 75%, 45%)', 'hsl(10, 70%, 35%)'], edge: 'hsl(20, 40%, 10%)', spots: [[98, 30, 11, 'hsl(45, 90%, 60%)'], [98, 30, 7, 'hsl(220, 70%, 45%)'], [98, 30, 3, '#000'], [72, 96, 10, 'hsl(220, 50%, 20%)'], [72, 96, 5, 'hsl(200, 70%, 60%)']] },
    { n: 'Schwalbenschwanz', base: ['hsl(50, 85%, 78%)', 'hsl(48, 80%, 65%)'], edge: 'hsl(0, 0%, 8%)', veins: 'rgba(15,15,15,0.9)', tail: true, spots: [[80, 104, 4, 'hsl(215, 80%, 55%)'], [30, 96, 4, 'hsl(10, 85%, 50%)']] },
    { n: 'Leuchtfalter', base: ['hsl(180, 100%, 70%)', 'hsl(290, 90%, 55%)'], edge: 'hsla(300, 90%, 40%, 0.5)', glow: true, spots: [[100, 30, 5, '#fff']] },
  ];

  DK.register({
    id: 'schmetterlinge',
    name: 'Schmetterlinge',
    sub: 'Leichtigkeit im Zickzack',
    type: '2d',
    scale: 1,
    create(ctx, env) {
      const noise = DK.makeNoise();
      const night = Math.random() < 0.3;
      const kinds = night ? [SPECIES[5], SPECIES[0]] : SPECIES.slice(0, 5);
      const sprites = new Map(kinds.map((k) => [k, wingSprite(k)]));
      const N = Math.round(12 * env.q + 8);
      const flies = [], flowers = [];
      let bg, W, H, M;

      function build() {
        W = env.w; H = env.h; M = Math.min(W, H);
        bg = document.createElement('canvas');
        bg.width = W; bg.height = H;
        const g = bg.getContext('2d');
        const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
        grd.addColorStop(0, night ? 'hsl(230, 35%, 9%)' : 'hsl(100, 35%, 13%)');
        grd.addColorStop(1, night ? 'hsl(240, 40%, 3%)' : 'hsl(110, 40%, 4%)');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);
        // Grashalme von oben: feine Striche
        for (let i = 0; i < (W * H) / 1500; i++) {
          const x = Math.random() * W, y = Math.random() * H, a = Math.random() * TAU, l = M * DK.rand(0.004, 0.012);
          g.strokeStyle = night ? 'rgba(90,110,160,0.08)' : `hsla(${DK.randInt(85, 120)}, 45%, ${DK.randInt(18, 30)}%, 0.5)`;
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
        flowers.length = 0;
        const nf = DK.randInt(14, 24);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < nf; i++) {
          const f = { x: DK.rand(0.08, 0.92) * W, y: DK.rand(0.08, 0.92) * H, h: DK.pick([0.95, 0.12, 0.8, 0.0, 0.6]), s: M * DK.rand(0.012, 0.02), busy: null };
          flowers.push(f);
          g.globalAlpha = night ? 0.25 : 0.45;
          g.drawImage(DK.glowSprite(f.h, 0.7, 0.55, 64), f.x - f.s * 2, f.y - f.s * 2, f.s * 4, f.s * 4);
          g.globalAlpha = 0.9;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU;
            g.fillStyle = DK.hsl(f.h, 0.75, 0.6);
            g.beginPath(); g.ellipse(f.x + Math.cos(a) * f.s * 0.55, f.y + Math.sin(a) * f.s * 0.55, f.s * 0.45, f.s * 0.25, a, 0, TAU); g.fill();
          }
          g.fillStyle = 'rgba(255,220,120,0.9)';
          g.beginPath(); g.arc(f.x, f.y, f.s * 0.25, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      build();

      for (let i = 0; i < N; i++) {
        flies.push({
          x: Math.random() * W, y: Math.random() * H, a: Math.random() * TAU, sp: DK.rand(0.06, 0.12),
          kind: DK.pick(kinds), size: M * DK.rand(0.07, 0.11), ph: Math.random() * TAU, fr: DK.rand(7, 11),
          seed: Math.random() * 100, state: 'fliegen', timer: DK.rand(4, 12), target: null,
        });
      }
      const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

      return {
        info: night ? 'Nachtfalter-Tanz' : 'Sommerwiese',
        resize() { build(); for (const f of flies) { f.state = 'fliegen'; f.target = null; } },
        render(t, dt, env) {
          const p = env.pointer;
          const pX = p.nx * W, pY = p.ny * H;
          for (const f of flies) {
            f.timer -= dt;
            if (p.pulse && Math.hypot(f.x - pX, f.y - pY) < M * 0.3) {
              if (f.target) f.target.busy = null;
              f.state = 'fliegen'; f.target = null; f.a = Math.atan2(f.y - pY, f.x - pX); f.timer = DK.rand(3, 6);
            }
            if (f.state === 'fliegen') {
              let turn = noise(f.seed, t * 0.5, 0) * 4;
              if (f.target) {
                const d = Math.hypot(f.target.x - f.x, f.target.y - f.y);
                turn += angDiff(Math.atan2(f.target.y - f.y, f.target.x - f.x), f.a) * 4;
                if (d < f.size * 0.4) { f.state = 'sitzen'; f.timer = DK.rand(3, 8); }
              } else if (f.timer < 0) {
                const free = flowers.filter((fl) => !fl.busy);
                if (free.length && Math.random() < 0.6) { f.target = DK.pick(free); f.target.busy = f; }
                f.timer = DK.rand(5, 12);
              }
              if (p.active > 0.3 && !f.target) turn += angDiff(Math.atan2(pY - f.y, pX - f.x), f.a) * 0.8;
              const mg = M * 0.08;
              if (f.x < mg || f.x > W - mg || f.y < mg || f.y > H - mg) turn += angDiff(Math.atan2(H / 2 - f.y, W / 2 - f.x), f.a) * 2;
              f.a += turn * dt;
              // Flattern: Vortrieb kommt in Schüben mit jedem Flügelschlag
              f.ph += f.fr * dt * (1 + env.audio.bass * 0.5);
              const push = 0.55 + 0.45 * Math.max(0, Math.sin(f.ph));
              const v = M * f.sp * push * (1 + env.audio.level * 0.5);
              f.x += Math.cos(f.a) * v * dt;
              f.y += Math.sin(f.a) * v * dt + Math.sin(f.ph) * M * 0.004 * dt;
            } else {
              // auf der Blüte: Flügel langsam auf und zu
              f.ph += dt * 1.2;
              if (f.timer < 0) { f.state = 'fliegen'; if (f.target) f.target.busy = null; f.target = null; f.timer = DK.rand(6, 14); }
            }
          }

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(bg, 0, 0);
          for (const f of flies) {
            const spr = sprites.get(f.kind);
            const open = f.state === 'sitzen' ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(f.ph)) : 0.2 + 0.8 * Math.abs(Math.cos(f.ph));
            const s = f.size;
            const heading = f.a + Math.PI / 2;
            const c = Math.cos(heading), si = Math.sin(heading);
            // Schatten auf der Wiese
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = f.kind.glow ? 0 : 0.25;
            ctx.setTransform(c, si, -si, c, f.x + s * 0.25, f.y + s * 0.3);
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(0, 0, s * open * 0.8, s * 0.45, 0, 0, TAU); ctx.fill();
            if (f.kind.glow) {
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = 0.5;
              ctx.drawImage(DK.glowSprite(0.5, 0.8, 0.6, 64), f.x - s * 1.5, f.y - s * 1.5, s * 3, s * 3);
            }
            ctx.globalAlpha = 1;
            ctx.setTransform(c, si, -si, c, f.x, f.y);
            for (const side of [1, -1]) {
              ctx.save();
              ctx.scale(side * open, 1);
              ctx.drawImage(spr, 0, -s / 2, s, s);
              ctx.restore();
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(20,15,10,0.95)';
            ctx.beginPath(); ctx.ellipse(0, 0, s * 0.05, s * 0.32, 0, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(20,15,10,0.8)';
            ctx.lineWidth = Math.max(0.8, s * 0.012);
            ctx.beginPath();
            ctx.moveTo(0, -s * 0.3); ctx.quadraticCurveTo(-s * 0.08, -s * 0.45, -s * 0.12, -s * 0.52);
            ctx.moveTo(0, -s * 0.3); ctx.quadraticCurveTo(s * 0.08, -s * 0.45, s * 0.12, -s * 0.52);
            ctx.stroke();
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  });
})();
